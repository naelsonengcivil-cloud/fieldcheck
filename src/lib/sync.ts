import type {
  FieldCheckDB,
  LocalInspecao,
  LocalResposta,
  LocalEvento,
  LocalEvidencia,
  LocalOcorrencia,
} from "@/lib/db";

// ============================================================
// Fila de sincronização (§7). Envia na ordem
//   inspeções → respostas → eventos → fotos
// Upsert idempotente por UUID; eventos com last-write-wins (updated_at);
// falha de foto NÃO bloqueia o restante (retry exponencial).
//
// O motor recebe um `SyncClient` injetável — em produção fala com o
// Supabase (supabaseSync.ts); nos testes, um fake em memória.
// ============================================================

/** Linhas "remotas" = registro local sem os campos de controle de sync. */
// arquivada é gerenciada no servidor (RPCs), não enviada pela fila.
// registrado_em é carimbado pelo servidor (default now()) → não sobe do app (melhoria A).
export type RemoteInspecao = Omit<LocalInspecao, "sync" | "arquivada" | "registrado_em">;
export type RemoteResposta = Omit<LocalResposta, "sync">;
// contratada_id do evento é denormalizado no servidor (trigger) → não sobe.
export type RemoteEvento = Omit<LocalEvento, "sync" | "contratada_id">;
export type RemoteEvidencia = Omit<
  LocalEvidencia,
  "sync" | "blob" | "tentativas" | "proxima_tentativa"
>;
export type RemoteOcorrencia = Omit<LocalOcorrencia, "sync">;

export interface SyncClient {
  upsertInspecao(row: RemoteInspecao): Promise<void>;
  upsertResposta(row: RemoteResposta): Promise<void>;
  /** Upsert com last-write-wins por updated_at. */
  upsertEvento(row: RemoteEvento): Promise<void>;
  upsertOcorrencia(row: RemoteOcorrencia): Promise<void>;
  /** Sobe a foto e devolve o caminho (path) no Storage. */
  uploadFoto(id: string, blob: Blob): Promise<string>;
  insertEvidencia(row: RemoteEvidencia): Promise<void>;
}

export interface SyncResult {
  inspecoes: number;
  respostas: number;
  eventos: number;
  ocorrencias: number;
  fotos: number;
  erros: number;
  adiadas: number; // fotos que ficaram para retry
}

/** Backoff exponencial: 5s, 10s, 20s, 40s… teto de 5min. */
export function backoffMs(tentativas: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, tentativas - 1));
}

const stripInspecao = (i: LocalInspecao): RemoteInspecao => {
  const { sync: _sync, arquivada: _arquivada, registrado_em: _registrado_em, ...r } = i;
  return r;
};
const stripResposta = (r: LocalResposta): RemoteResposta => {
  const { sync: _sync, ...rest } = r;
  return rest;
};
const stripEvento = (e: LocalEvento): RemoteEvento => {
  const { sync: _sync, contratada_id: _contratada_id, ...rest } = e;
  return rest;
};
const stripOcorrencia = (o: LocalOcorrencia): RemoteOcorrencia => {
  const { sync: _sync, ...rest } = o;
  return rest;
};

/**
 * Executa uma passada de sincronização. Idempotente: registros já
 * 'sincronizado' não são reenviados; upsert por id evita duplicação.
 * @param agora epoch ms (injetável para testes de backoff)
 */
export async function sincronizar(
  db: FieldCheckDB,
  client: SyncClient,
  agora: number = Date.now(),
): Promise<SyncResult> {
  const res: SyncResult = {
    inspecoes: 0,
    respostas: 0,
    eventos: 0,
    ocorrencias: 0,
    fotos: 0,
    erros: 0,
    adiadas: 0,
  };

  // 1) INSPEÇÕES ------------------------------------------------
  const inspecoesPendentes = await db.inspecoes
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const insp of inspecoesPendentes) {
    try {
      await client.upsertInspecao(stripInspecao(insp));
      await db.inspecoes.update(insp.id, { sync: "sincronizado" });
      res.inspecoes++;
    } catch {
      await db.inspecoes.update(insp.id, { sync: "erro" });
      res.erros++;
    }
  }

  // Conjunto de inspeções já no servidor (para respeitar a FK das respostas).
  const inspecoesSincronizadas = new Set(
    (await db.inspecoes.where("sync").equals("sincronizado").toArray()).map(
      (i) => i.id,
    ),
  );

  // 2) RESPOSTAS (só as cuja inspeção já subiu) -----------------
  const respostasPendentes = await db.respostas
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const r of respostasPendentes) {
    if (!inspecoesSincronizadas.has(r.inspecao_id)) continue; // aguarda a inspeção pai
    try {
      await client.upsertResposta(stripResposta(r));
      await db.respostas.update(r.id, { sync: "sincronizado" });
      res.respostas++;
    } catch {
      await db.respostas.update(r.id, { sync: "erro" });
      res.erros++;
    }
  }

  const respostasSincronizadas = new Set(
    (await db.respostas.where("sync").equals("sincronizado").toArray()).map(
      (r) => r.id,
    ),
  );

  // 3) EVENTOS_NC (após a resposta pai; LWW por updated_at) -----
  const eventosPendentes = await db.eventos
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const e of eventosPendentes) {
    if (!respostasSincronizadas.has(e.resposta_id)) continue;
    try {
      await client.upsertEvento(stripEvento(e));
      await db.eventos.update(e.id, { sync: "sincronizado" });
      res.eventos++;
    } catch {
      await db.eventos.update(e.id, { sync: "erro" });
      res.erros++;
    }
  }

  // 3.5) OCORRÊNCIAS (independentes das inspeções; fotos vêm depois) ---
  const ocorrenciasPendentes = await db.ocorrencias
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const o of ocorrenciasPendentes) {
    try {
      await client.upsertOcorrencia(stripOcorrencia(o));
      await db.ocorrencias.update(o.id, { sync: "sincronizado" });
      res.ocorrencias++;
    } catch {
      await db.ocorrencias.update(o.id, { sync: "erro" });
      res.erros++;
    }
  }

  // 4) FOTOS (não bloqueiam; retry exponencial §7.4) ------------
  const evidenciasPendentes = await db.evidencias
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const ev of evidenciasPendentes) {
    if (ev.proxima_tentativa > agora) {
      res.adiadas++;
      continue; // ainda em janela de backoff
    }
    if (!ev.blob) {
      // sem binário para subir — nada a fazer
      await db.evidencias.update(ev.id, { sync: "erro" });
      continue;
    }
    try {
      const url = await client.uploadFoto(ev.id, ev.blob);
      await client.insertEvidencia(remoteEvidencia(ev, url));
      await db.evidencias.update(ev.id, {
        sync: "sincronizado",
        url,
        blob: null, // libera espaço após subir
      });
      res.fotos++;
    } catch {
      const tentativas = ev.tentativas + 1;
      await db.evidencias.update(ev.id, {
        tentativas,
        proxima_tentativa: agora + backoffMs(tentativas),
        // permanece 'pendente' para nova tentativa; não conta como erro fatal
      });
      res.adiadas++;
    }
  }

  return res;
}

function remoteEvidencia(ev: LocalEvidencia, url: string): RemoteEvidencia {
  return {
    id: ev.id,
    resposta_id: ev.resposta_id,
    evento_id: ev.evento_id,
    ocorrencia_id: ev.ocorrencia_id ?? null,
    tipo: ev.tipo,
    url,
    lat: ev.lat,
    lng: ev.lng,
    capturada_em: ev.capturada_em,
  };
}

/** Conta itens ainda não sincronizados (para o indicador de pendências). */
export async function contarPendencias(db: FieldCheckDB): Promise<number> {
  const [i, r, e, ev, o] = await Promise.all([
    db.inspecoes.where("sync").notEqual("sincronizado").count(),
    db.respostas.where("sync").notEqual("sincronizado").count(),
    db.eventos.where("sync").notEqual("sincronizado").count(),
    db.evidencias.where("sync").notEqual("sincronizado").count(),
    db.ocorrencias.where("sync").notEqual("sincronizado").count(),
  ]);
  return i + r + e + ev + o;
}
