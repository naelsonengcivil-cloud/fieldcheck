import { db, type LocalOcorrencia, type LocalEvidencia, type LocalInspecao, type LocalResposta, type LocalEvento } from "@/lib/db";
import { uuid } from "@/lib/inspecaoService";
import { prazoSugerido } from "@/lib/criticidade";
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

/** Atualiza um desvio/ocorrência existente (edição) — marca autor/hora e
 *  reenfileira para sincronizar (o upsert por id sobrescreve no servidor). */
export async function atualizarOcorrenciaLocal(
  id: string,
  dados: DadosOcorrencia,
  ctx: ContextoOcorrencia,
): Promise<void> {
  if (!dados.obra_id) throw new Error("Selecione a obra.");
  if (!dados.descricao.trim()) throw new Error("Descreva a ocorrência.");
  if (ehDesvio(dados.tipo) && !dados.criticidade) throw new Error("Informe a criticidade do desvio.");
  if (dados.ocorrida_em && new Date(dados.ocorrida_em).getTime() > Date.now()) {
    throw new Error("A data do desvio não pode ser futura.");
  }
  await db.ocorrencias.update(id, {
    obra_id: dados.obra_id,
    contratada_id: dados.contratada_id,
    tipo: dados.tipo,
    data: dados.ocorrida_em ? dados.ocorrida_em.slice(0, 10) : dados.data,
    descricao: dados.descricao.trim(),
    criticidade: dados.criticidade ?? null,
    frente: dados.frente?.trim() || null,
    ref_cronograma_codigo: dados.ref_cronograma_codigo?.trim() || null,
    ocorrida_em: dados.ocorrida_em ?? null,
    triagem_ia: dados.triagem_ia ?? null,
    origem_ia: dados.origem_ia ?? false,
    editado_apos_ia: dados.editado_apos_ia ?? false,
    atualizado_em: new Date().toISOString(),
    atualizado_por: ctx.criadoPor,
    sync: "pendente",
  });
}

/** Exclui um desvio/ocorrência — SOFT DELETE auditável (nunca remove a linha).
 *  Some de todas as leituras (filtram excluido_em is null) e da Pirâmide. */
export async function excluirDesvioLocal(
  id: string,
  ctx: ContextoOcorrencia,
  motivo?: string,
): Promise<void> {
  await db.ocorrencias.update(id, {
    excluido_em: new Date().toISOString(),
    excluido_por: ctx.criadoPor,
    motivo_exclusao: motivo?.trim() || null,
    sync: "pendente",
  });
}

export const CHECKLIST_DESVIO_CODIGO = "DESVIO-CAMPO";

/**
 * Promove um desvio avulso a NC (Marco M · Fase 3a) — cria a cadeia
 * inspeção-sintética → resposta(NC) → evento_nc no Dexie e sincroniza. A NC
 * herda obra/contratada/criticidade/descrição/fotos (fotos via trigger no
 * servidor). A resposta nasce com classificacao_st null (não conta na base da
 * Bird — o desvio segue como o ponto). @returns id da inspeção sintética.
 */
export async function promoverDesvioLocal(
  desvio: LocalOcorrencia,
  ctx: ContextoOcorrencia,
  prazosNc?: Record<string, number> | null,
): Promise<string> {
  if (!ehDesvio(desvio.tipo)) throw new Error("Apenas desvios podem ser promovidos a NC.");
  if (desvio.promovida_inspecao_id) throw new Error("Este desvio já foi promovido a NC.");
  if (desvio.sync !== "sincronizado") throw new Error("Sincronize o desvio antes de promover.");
  if (!desvio.criticidade) throw new Error("O desvio precisa de criticidade para virar NC.");

  const ck = await db.checklists.filter((c) => c.codigo === CHECKLIST_DESVIO_CODIGO).first();
  if (!ck) throw new Error("Catálogo desatualizado — sincronize e tente novamente.");
  const item = await db.itens.filter((i) => i.checklist_id === ck.id).first();
  if (!item) throw new Error("Catálogo desatualizado — sincronize e tente novamente.");

  const inspecaoId = uuid();
  const respostaId = uuid();
  const eventoId = uuid();
  const agora = new Date().toISOString();
  const baseDia = desvio.ocorrida_em ?? desvio.data ?? agora;

  const inspecao: LocalInspecao = {
    id: inspecaoId,
    empresa_id: ctx.empresaId,
    obra_id: desvio.obra_id,
    checklist_id: ck.id,
    inspetor_id: ctx.criadoPor,
    iniciada_em: agora,
    finalizada_em: agora,
    data_inspecao: desvio.ocorrida_em ?? baseDia,
    registrado_em: null,
    frente: desvio.frente ?? null,
    contratada: null,
    lat: null,
    lng: null,
    status: "finalizada",
    origem_offline: false,
    arquivada: false,
    contratada_id: desvio.contratada_id,
    origem_desvio_id: desvio.id,
    sync: "pendente",
  };
  const resposta: LocalResposta = {
    id: respostaId,
    inspecao_id: inspecaoId,
    item_id: item.id,
    resposta: "NC",
    observacao: desvio.descricao,
    classificacao_st: null, // não conta na base da Bird (evita dupla contagem)
    criado_em: agora,
    sync: "pendente",
  };
  const evento: LocalEvento = {
    id: eventoId,
    resposta_id: respostaId,
    empresa_id: ctx.empresaId,
    obra_id: desvio.obra_id,
    responsavel: null,
    prazo: prazoSugerido(desvio.criticidade, prazosNc, new Date(baseDia)),
    criticidade: desvio.criticidade,
    status: "aberto",
    tratamento: null,
    contratada_id: desvio.contratada_id,
    updated_at: agora,
    sync: "pendente",
  };

  await db.transaction("rw", db.inspecoes, db.respostas, db.eventos, db.ocorrencias, async () => {
    await db.inspecoes.put(inspecao);
    await db.respostas.put(resposta);
    await db.eventos.put(evento);
    await db.ocorrencias.update(desvio.id, { promovida_inspecao_id: inspecaoId, sync: "pendente" });
  });
  return inspecaoId;
}

export const ROTULO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  dano_material: "Dano material",
  acidente_sem_afastamento: "Acidente sem afastamento",
  acidente_com_afastamento: "Acidente com afastamento",
  ato_inseguro: "Ato inseguro",
  condicao_insegura: "Condição insegura",
  quase_acidente: "Quase acidente",
};
