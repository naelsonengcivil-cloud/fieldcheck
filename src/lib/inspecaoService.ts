import type {
  FieldCheckDB,
  LocalInspecao,
  LocalResposta,
  LocalEvento,
  LocalEvidencia,
} from "@/lib/db";
import type { Checklist, ItemChecklist, Obra, Resposta } from "@/types/db";
import { avaliarFinalizacao, type RespostaAvaliavel } from "@/lib/finalizacao";

// ============================================================
// Serviço de inspeção (RF03–RF06). A execução acontece em memória
// (ExecInspecao) e, ao finalizar, TUDO é gravado no Dexie como
// 'pendente' — a fila do M4 (sync.ts) sobe quando houver rede.
// ============================================================

/** UUID v4 (crypto do browser; fallback simples fora dele). */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Estado de um item durante a execução (em memória). */
export interface ExecItem {
  item_id: string;
  ordem: number;
  texto: string;
  criterio: string | null;
  resposta: Resposta | "";
  observacao: string;
  responsavel: string;
  prazo: string; // YYYY-MM-DD ou ""
  fotoBlob: Blob | null; // JPEG ~1280 (upload)
  fotoPreview: string | null; // data URL ~480 (UI)
}

/** Inspeção em execução (ainda não persistida). */
export interface ExecInspecao {
  obra: Obra;
  checklist: Checklist;
  frente: string;
  contratada: string;
  itens: ExecItem[];
  iniciada_em: string;
}

export function criarExecucao(
  obra: Obra,
  checklist: Checklist,
  itens: ItemChecklist[],
  dados: { frente: string; contratada: string },
  iniciada_em: string,
): ExecInspecao {
  return {
    obra,
    checklist,
    frente: dados.frente,
    contratada: dados.contratada,
    iniciada_em,
    itens: itens
      .slice()
      .sort((a, b) => a.ordem - b.ordem)
      .map((it) => ({
        item_id: it.id,
        ordem: it.ordem,
        texto: it.texto,
        criterio: it.criterio,
        resposta: "",
        observacao: "",
        responsavel: "",
        prazo: "",
        fotoBlob: null,
        fotoPreview: null,
      })),
  };
}

export function avaliarExecucao(exec: ExecInspecao) {
  const respostas: RespostaAvaliavel[] = exec.itens.map((i) => ({
    resposta: i.resposta,
    observacao: i.observacao,
  }));
  return avaliarFinalizacao(respostas, exec.itens.length);
}

export interface ContextoSalvar {
  empresaId: string;
  inspetorId: string;
  finalizadaEm: string;
  geo?: { lat: number | null; lng: number | null };
}

/**
 * Persiste a inspeção finalizada no Dexie como 'pendente' (grava offline).
 * Cria: 1 inspeção + N respostas + 1 evento_nc por NC + 1 evidência por foto.
 * Lança se a inspeção não atende à regra de finalização (RF05).
 * @returns id da inspeção criada
 */
export async function salvarInspecaoLocal(
  db: FieldCheckDB,
  exec: ExecInspecao,
  ctx: ContextoSalvar,
): Promise<string> {
  const avaliacao = avaliarExecucao(exec);
  if (!avaliacao.ok) {
    throw new Error(avaliacao.motivo ?? "Inspeção incompleta");
  }

  const inspecaoId = uuid();
  const inspecao: LocalInspecao = {
    id: inspecaoId,
    empresa_id: ctx.empresaId,
    obra_id: exec.obra.id,
    checklist_id: exec.checklist.id,
    inspetor_id: ctx.inspetorId,
    frente: exec.frente.trim() || null,
    contratada: exec.contratada.trim() || null,
    iniciada_em: exec.iniciada_em,
    finalizada_em: ctx.finalizadaEm,
    lat: ctx.geo?.lat ?? null,
    lng: ctx.geo?.lng ?? null,
    status: "finalizada",
    origem_offline: true,
    arquivada: false,
    sync: "pendente",
  };

  const respostas: LocalResposta[] = [];
  const eventos: LocalEvento[] = [];
  const evidencias: LocalEvidencia[] = [];

  for (const it of exec.itens) {
    const respostaId = uuid();
    respostas.push({
      id: respostaId,
      inspecao_id: inspecaoId,
      item_id: it.item_id,
      resposta: it.resposta as Resposta,
      observacao: it.observacao.trim() || null,
      criado_em: ctx.finalizadaEm,
      sync: "pendente",
    });

    if (it.resposta === "NC") {
      eventos.push({
        id: uuid(),
        resposta_id: respostaId,
        empresa_id: ctx.empresaId,
        obra_id: exec.obra.id,
        responsavel: it.responsavel.trim() || null,
        prazo: it.prazo || null,
        status: "aberto",
        tratamento: null,
        updated_at: ctx.finalizadaEm,
        sync: "pendente",
      });
    }

    if (it.fotoBlob) {
      evidencias.push({
        id: uuid(),
        resposta_id: respostaId,
        evento_id: null,
        tipo: "abertura",
        blob: it.fotoBlob,
        url: null,
        lat: ctx.geo?.lat ?? null,
        lng: ctx.geo?.lng ?? null,
        capturada_em: ctx.finalizadaEm,
        sync: "pendente",
        tentativas: 0,
        proxima_tentativa: 0,
      });
    }
  }

  await db.transaction(
    "rw",
    db.inspecoes,
    db.respostas,
    db.eventos,
    db.evidencias,
    async () => {
      await db.inspecoes.put(inspecao);
      await db.respostas.bulkPut(respostas);
      await db.eventos.bulkPut(eventos);
      await db.evidencias.bulkPut(evidencias);
    },
  );

  return inspecaoId;
}
