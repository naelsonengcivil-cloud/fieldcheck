import { supabase } from "@/lib/supabase";
import { db, type RncPendente } from "@/lib/db";
import { T } from "@/theme";
import type { Rnc, RncGravidade, RncSecao, RncStatus } from "@/types/db";

// ============================================================
// Serviço do módulo RNC (Marco RNC) — geração via Edge Function
// `rnc-generate`, edição/formalização e workflow de status. A geração é
// SEMPRE manual (opção do cliente/inspetor), nunca automática. Offline:
// enfileira e gera ao reconectar (a IA roda no servidor).
// ============================================================

export const ROTULO_GRAVIDADE: Record<RncGravidade, string> = {
  critica: "Crítica",
  maior: "Maior",
  menor: "Menor",
  observacao: "Observação",
};

export const GRAVIDADES: RncGravidade[] = ["observacao", "menor", "maior", "critica"];

/** Cor (frente/fundo) do selo de gravidade. */
export function corGravidade(g: RncGravidade): { fg: string; bg: string } {
  switch (g) {
    case "critica":
      return { fg: T.red, bg: T.redBg };
    case "maior":
      return { fg: "#E07B39", bg: "#FBEFE3" };
    case "menor":
      return { fg: T.yellowDark, bg: "#FBEFD3" };
    case "observacao":
    default:
      return { fg: T.green, bg: T.greenBg };
  }
}

export const ROTULO_STATUS_RNC: Record<RncStatus, string> = {
  aberta: "Aberta",
  em_tratamento: "Em tratamento",
  aguardando_reinspecao: "Aguardando reinspeção",
  fechada: "Fechada",
  cancelada: "Cancelada",
};

/** Cor (frente/fundo) do selo de status da RNC. */
export function corStatusRnc(s: RncStatus): { fg: string; bg: string } {
  switch (s) {
    case "aberta":
      return { fg: T.red, bg: T.redBg };
    case "em_tratamento":
      return { fg: T.yellowDark, bg: "#FBEFD3" };
    case "aguardando_reinspecao":
      return { fg: T.navy, bg: "#E7ECF3" };
    case "fechada":
      return { fg: T.green, bg: T.greenBg };
    case "cancelada":
    default:
      return { fg: T.gray, bg: T.grayBg };
  }
}

/** Transições válidas do workflow (cancelar é permitido de qualquer estado ativo). */
export const TRANSICOES_RNC: Record<RncStatus, RncStatus[]> = {
  aberta: ["em_tratamento", "cancelada"],
  em_tratamento: ["aguardando_reinspecao", "cancelada"],
  aguardando_reinspecao: ["fechada", "em_tratamento", "cancelada"],
  fechada: [],
  cancelada: [],
};

export function transicaoValida(de: RncStatus, para: RncStatus): boolean {
  return TRANSICOES_RNC[de]?.includes(para) ?? false;
}

/** Rodapé obrigatório de responsabilidade técnica (documento/exportação). */
export const RODAPE_RESPONSABILIDADE =
  "A responsabilidade técnica pelo conteúdo deste relatório permanece do profissional habilitado que o assina.";

export interface DadosGeracao {
  resposta_item_id: string;
  local?: string;
  ativo?: string;
  descricao_nc?: string;
}

/** Dispara a geração da RNC na Edge Function (online). */
export async function gerarRnc(dados: DadosGeracao): Promise<{ rnc: Rnc | null; erro: string | null }> {
  const { data, error } = await supabase.functions.invoke("rnc-generate", { body: dados });
  if (error) {
    // Erro de função retorna o corpo em error.context (quando disponível).
    let msg = "Não foi possível gerar a RNC.";
    try {
      const j = await (error as { context?: Response }).context?.json?.();
      if (j?.error) msg = j.error;
    } catch { /* usa a mensagem padrão */ }
    return { rnc: null, erro: msg };
  }
  if (data?.error) return { rnc: null, erro: data.error };
  return { rnc: (data?.rnc as Rnc) ?? null, erro: null };
}

/** Enfileira a geração para quando houver rede (uso offline). */
export async function enfileirarRnc(dados: DadosGeracao): Promise<void> {
  const p: RncPendente = {
    resposta_item_id: dados.resposta_item_id,
    local: dados.local ?? "",
    ativo: dados.ativo ?? "",
    descricao_nc: dados.descricao_nc ?? "",
    criado_em: new Date().toISOString(),
  };
  await db.rnc_pendentes.put(p);
}

/** Processa a fila de RNCs pendentes (chamado ao reconectar). */
export async function processarRncPendentes(): Promise<number> {
  const pendentes = await db.rnc_pendentes.toArray();
  let ok = 0;
  for (const p of pendentes) {
    const { rnc, erro } = await gerarRnc({
      resposta_item_id: p.resposta_item_id,
      local: p.local,
      ativo: p.ativo,
      descricao_nc: p.descricao_nc,
    });
    // Tira da fila em caso de sucesso ou erro terminal. "Resposta não
    // encontrada" = ainda não sincronizou → mantém para tentar depois.
    if (rnc || (erro && ERRO_TERMINAL.test(erro))) {
      await db.rnc_pendentes.delete(p.resposta_item_id);
      if (rnc) ok++;
    }
  }
  return ok;
}

/** RNC existente para uma resposta reprovada (se houver). */
export async function buscarRncPorResposta(respostaItemId: string): Promise<Rnc | null> {
  const { data } = await supabase.from("rncs").select("*").eq("resposta_item_id", respostaItemId).maybeSingle();
  return (data as Rnc) ?? null;
}

/** RNCs existentes para um conjunto de respostas (mapa resposta_item_id → RNC). */
export async function buscarRncsPorRespostas(ids: string[]): Promise<Map<string, Rnc>> {
  const m = new Map<string, Rnc>();
  if (!ids.length) return m;
  const { data } = await supabase.from("rncs").select("*").in("resposta_item_id", ids);
  for (const r of (data as Rnc[]) ?? []) m.set(r.resposta_item_id, r);
  return m;
}

// Erros terminais da geração (não adianta reprocessar a fila).
const ERRO_TERMINAL = /não é uma não conformidade|sem texto-base|sem modelo de rnc|fora do escopo/i;

/** Carrega a estrutura padrão das 12 seções (referência, ordenada). */
export async function carregarSecoesRnc(): Promise<RncSecao[]> {
  const { data } = await supabase.from("rnc_secoes").select("*").order("ordem");
  return (data as RncSecao[]) ?? [];
}

/** Persiste alterações da RNC (edição/formalização/status). */
export async function atualizarRnc(id: string, patch: Partial<Rnc>): Promise<{ erro: string | null }> {
  const { error } = await supabase.from("rncs").update(patch).eq("id", id);
  return { erro: error ? "Não foi possível salvar as alterações da RNC." : null };
}
