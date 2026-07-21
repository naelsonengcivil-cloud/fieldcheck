import { db, type LocalOcorrencia, type LocalEvidencia } from "@/lib/db";
import { uuid } from "@/lib/inspecaoService";
import type { Criticidade, TipoDesvio, TipoOcorrencia, TriagemIa } from "@/types/db";

// ============================================================
// Ocorrências — offline-first (A2 + Marco M). Grava no Dexie como
// 'pendente'; a fila (sync.ts) sobe quando houver rede. Fotos viram
// evidências tipo 'ocorrencia' ligadas à ocorrência. Desde o Marco M o
// mesmo registro cobre o DESVIO AVULSO (base da Pirâmide de Bird), com
// criticidade + eixos (frente/EAP) e data/hora editável (retroativo).
// ============================================================

export const TIPOS_DESVIO: TipoDesvio[] = ["ato_inseguro", "condicao_insegura", "quase_acidente"];

export const ehDesvio = (tipo: TipoOcorrencia): tipo is TipoDesvio =>
  (TIPOS_DESVIO as TipoOcorrencia[]).includes(tipo);

export interface DadosOcorrencia {
  obra_id: string;
  contratada_id: string | null;
  tipo: TipoOcorrencia;
  data: string; // YYYY-MM-DD
  descricao: string;
  fotos: Blob[];
  // Marco M — desvio avulso (opcionais para danos/acidentes).
  criticidade?: Criticidade | null;
  frente?: string | null;
  ref_cronograma_codigo?: string | null;
  ocorrida_em?: string | null; // ISO com hora; quando presente, `data` deriva dele
  // M-2 — triagem por IA (sugestão aplicada no formulário + flags de trilha).
  triagem_ia?: TriagemIa | null;
  origem_ia?: boolean;
  editado_apos_ia?: boolean;
  /** true = agendar a análise por IA para depois da sincronização (offline). */
  analisar_apos_sync?: boolean;
}

export interface ContextoOcorrencia {
  empresaId: string;
  criadoPor: string;
}

/** Persiste a ocorrência + fotos no Dexie como 'pendente'. @returns id. */
export async function salvarOcorrenciaLocal(
  dados: DadosOcorrencia,
  ctx: ContextoOcorrencia,
): Promise<string> {
  if (!dados.obra_id) throw new Error("Selecione a obra.");
  if (!dados.descricao.trim()) throw new Error("Descreva a ocorrência.");
  if (ehDesvio(dados.tipo) && !dados.criticidade) throw new Error("Informe a criticidade do desvio.");
  if (dados.ocorrida_em && new Date(dados.ocorrida_em).getTime() > Date.now()) {
    throw new Error("A data do desvio não pode ser futura.");
  }

  const id = uuid();
  const agora = new Date().toISOString();
  const ocorrencia: LocalOcorrencia = {
    id,
    empresa_id: ctx.empresaId,
    obra_id: dados.obra_id,
    contratada_id: dados.contratada_id,
    tipo: dados.tipo,
    data: dados.ocorrida_em ? dados.ocorrida_em.slice(0, 10) : dados.data,
    descricao: dados.descricao.trim(),
    criado_por: ctx.criadoPor,
    criado_em: agora,
    criticidade: dados.criticidade ?? null,
    frente: dados.frente?.trim() || null,
    ref_cronograma_codigo: dados.ref_cronograma_codigo?.trim() || null,
    ocorrida_em: dados.ocorrida_em ?? null,
    promovida_inspecao_id: null,
    triagem_ia: dados.triagem_ia ?? null,
    triagem_em: dados.triagem_ia ? agora : null,
    origem_ia: dados.origem_ia ?? false,
    editado_apos_ia: dados.editado_apos_ia ?? false,
    sync: "pendente",
  };
  const evidencias: LocalEvidencia[] = dados.fotos.map((blob) => ({
    id: uuid(),
    resposta_id: null,
    evento_id: null,
    ocorrencia_id: id,
    tipo: "ocorrencia",
    blob,
    url: null,
    lat: null,
    lng: null,
    capturada_em: agora,
    sync: "pendente",
    tentativas: 0,
    proxima_tentativa: 0,
  }));

  await db.transaction("rw", db.ocorrencias, db.evidencias, db.triagem_pendentes, async () => {
    await db.ocorrencias.put(ocorrencia);
    if (evidencias.length) await db.evidencias.bulkPut(evidencias);
    // M-2: análise agendada (offline) roda após a sincronização subir as fotos.
    if (dados.analisar_apos_sync) {
      await db.triagem_pendentes.put({ ocorrencia_id: id, criado_em: agora, tentativas: 0 });
    }
  });
  return id;
}

export const ROTULO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  dano_material: "Dano material",
  acidente_sem_afastamento: "Acidente sem afastamento",
  acidente_com_afastamento: "Acidente com afastamento",
  ato_inseguro: "Ato inseguro",
  condicao_insegura: "Condição insegura",
  quase_acidente: "Quase acidente",
};
