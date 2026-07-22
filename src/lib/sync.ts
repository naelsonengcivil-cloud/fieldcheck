import type { Table, UpdateSpec } from "dexie";
import type {
  FieldCheckDB,
  SyncMeta,
  SyncStatus,
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

const MAX_TENTATIVAS_TRANSITORIO = 3;

/** Detalhe extraído de uma falha de envio (Entrega C). */
export interface DetalheErro {
  status: number | null; // HTTP (Storage/PostgREST)
  codigo: string | null; // código do Postgres (ex.: 23514)
  mensagem: string;
}

/** Lê status/código/mensagem de um erro lançado pelo SyncClient. */
export function extrairErroSync(e: unknown): DetalheErro {
  const x = (e ?? {}) as { message?: string; codigo?: string; code?: string; status?: number };
  return {
    status: typeof x.status === "number" ? x.status : null,
    codigo: x.codigo ?? x.code ?? null,
    mensagem: x.message ?? String(e),
  };
}

/**
 * Erro transitório (vale retry automático) × permanente (aguarda ação).
 * Permanente: qualquer erro do Postgres (tem código: constraint, tipo, RLS…)
 * ou HTTP 4xx (exceto 408/429). Transitório: sem status (rede/timeout), 5xx,
 * 408, 429.
 */
export function ehTransitorio(d: DetalheErro): boolean {
  if (d.codigo) return false;
  const s = d.status;
  if (s == null) return true;
  if (s === 408 || s === 429) return true;
  return s >= 500;
}

/** Grava metadados da falha e decide o próximo estado (pendente c/ backoff × erro). */
async function registrarFalha<T extends SyncMeta & { id: string }>(
  tabela: Table<T, string>,
  item: T,
  e: unknown,
  agora: number,
): Promise<SyncStatus> {
  const det = extrairErroSync(e);
  const tentativas = (item.tentativas ?? 0) + 1;
  const transitorio = ehTransitorio(det) && tentativas < MAX_TENTATIVAS_TRANSITORIO;
  const status: SyncStatus = transitorio ? "pendente" : "erro";
  await tabela.update(item.id, {
    sync: status,
    tentativas,
    proxima_tentativa: transitorio ? agora + backoffMs(tentativas) : 0,
    ultima_tentativa_em: new Date(agora).toISOString(),
    ultimo_status_http: det.status,
    ultimo_erro: det.codigo ? `${det.codigo}: ${det.mensagem}` : det.mensagem,
  } as unknown as UpdateSpec<T>);
  return status;
}

/** true se o item está em janela de backoff (não tentar agora). */
const emBackoff = (item: SyncMeta, agora: number) => (item.proxima_tentativa ?? 0) > agora;

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

  // 0) Self-heal de evidências órfãs (foto sem binário local): concluídas se
  // já têm url no servidor, removidas se irrecuperáveis — para não travar a
  // fila como "erro" eterno. (Erros com metadados aguardam ação no painel;
  // não há mais reset cego de 'erro' → 'pendente'.)
  const orfas = await db.evidencias.filter((e) => !e.blob && e.sync !== "sincronizado").toArray();
  for (const ev of orfas) {
    if (ev.url) await db.evidencias.update(ev.id, { sync: "sincronizado" });
    else await db.evidencias.delete(ev.id);
  }

  // 1) INSPEÇÕES ------------------------------------------------
  const inspecoesPendentes = await db.inspecoes
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const insp of inspecoesPendentes) {
    if (emBackoff(insp, agora)) { res.adiadas++; continue; }
    try {
      await client.upsertInspecao(stripInspecao(insp));
      await db.inspecoes.update(insp.id, { sync: "sincronizado" });
      res.inspecoes++;
    } catch (e) {
      if ((await registrarFalha(db.inspecoes, insp, e, agora)) === "erro") res.erros++;
      else res.adiadas++;
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
    if (emBackoff(r, agora)) { res.adiadas++; continue; }
    try {
      await client.upsertResposta(stripResposta(r));
      await db.respostas.update(r.id, { sync: "sincronizado" });
      res.respostas++;
    } catch (e) {
      if ((await registrarFalha(db.respostas, r, e, agora)) === "erro") res.erros++;
      else res.adiadas++;
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
    if (emBackoff(e, agora)) { res.adiadas++; continue; }
    try {
      await client.upsertEvento(stripEvento(e));
      await db.eventos.update(e.id, { sync: "sincronizado" });
      res.eventos++;
    } catch (err) {
      if ((await registrarFalha(db.eventos, e, err, agora)) === "erro") res.erros++;
      else res.adiadas++;
    }
  }

  // 3.5) OCORRÊNCIAS (independentes das inspeções; fotos vêm depois) ---
  const ocorrenciasPendentes = await db.ocorrencias
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const o of ocorrenciasPendentes) {
    if (emBackoff(o, agora)) { res.adiadas++; continue; }
    try {
      await client.upsertOcorrencia(stripOcorrencia(o));
      await db.ocorrencias.update(o.id, { sync: "sincronizado" });
      res.ocorrencias++;
    } catch (e) {
      if ((await registrarFalha(db.ocorrencias, o, e, agora)) === "erro") res.erros++;
      else res.adiadas++;
    }
  }

  // 4) FOTOS (não bloqueiam; retry exponencial §7.4) ------------
  const evidenciasPendentes = await db.evidencias
    .where("sync")
    .equals("pendente")
    .toArray();
  for (const ev of evidenciasPendentes) {
    if (emBackoff(ev, agora)) { res.adiadas++; continue; } // janela de backoff
    if (!ev.blob) continue; // órfã: já resolvida no self-heal do passo 0
    try {
      const url = await client.uploadFoto(ev.id, ev.blob);
      await client.insertEvidencia(remoteEvidencia(ev, url));
      await db.evidencias.update(ev.id, {
        sync: "sincronizado",
        url,
        blob: null, // libera espaço após subir
      });
      res.fotos++;
    } catch (e) {
      // Rede/timeout → retry com backoff (até 3); 413/permanente → erro (após
      // o uploadFoto já ter tentado recomprimir 1x).
      if ((await registrarFalha(db.evidencias, ev, e, agora)) === "erro") res.erros++;
      else res.adiadas++;
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

// ── Painel de pendências (Entrega C) ────────────────────────────────────────

export type TabelaFila = "inspecoes" | "respostas" | "eventos" | "ocorrencias" | "evidencias";

export interface ItemFila {
  id: string;
  tabela: TabelaFila;
  status: SyncStatus; // 'pendente' | 'erro'
  criado_em: string | null;
  tentativas: number;
  ultima_tentativa_em: string | null;
  ultimo_status_http: number | null;
  ultimo_erro: string | null;
  obra_id: string | null; // p/ referência legível (quando aplicável)
  descricao: string | null; // p/ referência legível
}

function tabelasFila(db: FieldCheckDB): Record<TabelaFila, Table<SyncMeta & { id: string }, string>> {
  return {
    inspecoes: db.inspecoes as unknown as Table<SyncMeta & { id: string }, string>,
    respostas: db.respostas as unknown as Table<SyncMeta & { id: string }, string>,
    eventos: db.eventos as unknown as Table<SyncMeta & { id: string }, string>,
    ocorrencias: db.ocorrencias as unknown as Table<SyncMeta & { id: string }, string>,
    evidencias: db.evidencias as unknown as Table<SyncMeta & { id: string }, string>,
  };
}

const metaFila = (tabela: TabelaFila, it: Record<string, unknown>): ItemFila => ({
  id: it.id as string,
  tabela,
  status: it.sync as SyncStatus,
  criado_em: (it.criado_em ?? it.capturada_em ?? null) as string | null,
  tentativas: (it.tentativas as number) ?? 0,
  ultima_tentativa_em: (it.ultima_tentativa_em ?? null) as string | null,
  ultimo_status_http: (it.ultimo_status_http ?? null) as number | null,
  ultimo_erro: (it.ultimo_erro ?? null) as string | null,
  obra_id: (it.obra_id ?? null) as string | null,
  descricao: (it.descricao ?? it.observacao ?? it.tratamento ?? null) as string | null,
});

/** Lista unificada dos itens não sincronizados das 5 tabelas da fila. */
export async function coletarPendencias(db: FieldCheckDB): Promise<ItemFila[]> {
  const naoSync = <T extends SyncMeta>(arr: T[]) => arr.filter((x) => x.sync !== "sincronizado");
  const [insp, resp, evt, ocor, evid] = await Promise.all([
    db.inspecoes.toArray(),
    db.respostas.toArray(),
    db.eventos.toArray(),
    db.ocorrencias.toArray(),
    db.evidencias.toArray(),
  ]);
  const out: ItemFila[] = [
    ...naoSync(insp).map((i) => metaFila("inspecoes", i as unknown as Record<string, unknown>)),
    ...naoSync(resp).map((r) => metaFila("respostas", r as unknown as Record<string, unknown>)),
    ...naoSync(evt).map((e) => metaFila("eventos", e as unknown as Record<string, unknown>)),
    ...naoSync(ocor).map((o) => metaFila("ocorrencias", o as unknown as Record<string, unknown>)),
    ...naoSync(evid).map((e) => metaFila("evidencias", e as unknown as Record<string, unknown>)),
  ];
  // Erros primeiro; depois por data de criação.
  return out.sort((a, b) =>
    a.status === b.status ? (a.criado_em ?? "").localeCompare(b.criado_em ?? "") : a.status === "erro" ? -1 : 1,
  );
}

/** Reenfileira um item para nova tentativa imediata (ação do usuário). */
export async function tentarItem(db: FieldCheckDB, tabela: TabelaFila, id: string): Promise<void> {
  await tabelasFila(db)[tabela].update(id, { sync: "pendente", proxima_tentativa: 0, tentativas: 0 } as unknown as UpdateSpec<SyncMeta & { id: string }>);
}

/** Descarta um item da fila — grava log em sync_descartes e remove a linha. */
export async function descartarItem(
  db: FieldCheckDB,
  fila: ItemFila,
  tipoOperacao: string,
  referencia: string,
): Promise<void> {
  const tabela = tabelasFila(db)[fila.tabela];
  const item = await tabela.get(fila.id);
  await db.sync_descartes.put({
    id: fila.id,
    tabela: fila.tabela,
    tipo_operacao: tipoOperacao,
    referencia,
    conteudo: JSON.stringify(resumoDescarte(item)),
    descartado_em: new Date().toISOString(),
  });
  await tabela.delete(fila.id);
}

function resumoDescarte(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") return {};
  const o = item as Record<string, unknown>;
  const { blob: _blob, ...resto } = o; // não serializa binário
  return resto;
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
