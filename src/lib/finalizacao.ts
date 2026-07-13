import type { Resposta } from "@/types/db";

// ============================================================
// Regra de finalização da inspeção (RF05) — função pura e testável.
// Finaliza só se: 100% dos itens respondidos E toda NC com observação.
// ============================================================

export interface RespostaAvaliavel {
  resposta: Resposta | ""; // "" = ainda não respondido
  observacao?: string | null;
  exigeClassificacaoST?: boolean; // checklist de Segurança do Trabalho (A2)
  classificacao_st?: string | null; // classificação da NC (ato/condição/quase/na)
  classificacao_st_justificativa?: string | null; // obrigatória quando 'na' (melhoria 2)
  criticidade?: string | null; // Marco I — obrigatória na NC
  prazo?: string | null; // Marco I — obrigatório na NC
}

export interface ResultadoFinalizacao {
  ok: boolean;
  motivo?: string;
  faltamItens: number;
  ncSemObservacao: number;
  ncSemClassificacao: number; // NC de ST sem classificação (A2)
  ncNaSemJustificativa: number; // classificação 'na' sem justificativa (melhoria 2)
  ncSemCriticidade: number; // NC sem criticidade (Marco I)
  ncSemPrazo: number; // NC sem prazo (Marco I)
}

const RESPOSTAS_VALIDAS: readonly string[] = ["C", "NC", "NA"];

export function respondida(r: RespostaAvaliavel): boolean {
  return RESPOSTAS_VALIDAS.includes(r.resposta);
}

function temObservacao(r: RespostaAvaliavel): boolean {
  return !!(r.observacao && r.observacao.trim().length > 0);
}

/**
 * @param respostas estado atual de cada item da inspeção
 * @param totalItens quantidade de itens do checklist (denominador do "100%")
 */
export function avaliarFinalizacao(
  respostas: RespostaAvaliavel[],
  totalItens: number,
): ResultadoFinalizacao {
  const respondidas = respostas.filter(respondida).length;
  const faltamItens = Math.max(0, totalItens - respondidas);
  const ncSemObservacao = respostas.filter(
    (r) => r.resposta === "NC" && !temObservacao(r),
  ).length;
  const ncSemClassificacao = respostas.filter(
    (r) => r.resposta === "NC" && r.exigeClassificacaoST && !(r.classificacao_st && r.classificacao_st.length > 0),
  ).length;
  // 'na' exige justificativa (melhoria 2).
  const ncNaSemJustificativa = respostas.filter(
    (r) => r.classificacao_st === "na" && !(r.classificacao_st_justificativa && r.classificacao_st_justificativa.trim().length > 0),
  ).length;
  const cheia = (v?: string | null) => !!(v && v.length > 0);
  const ncSemCriticidade = respostas.filter((r) => r.resposta === "NC" && !cheia(r.criticidade)).length;
  const ncSemPrazo = respostas.filter((r) => r.resposta === "NC" && !cheia(r.prazo)).length;

  const extra = { ncSemObservacao, ncSemClassificacao, ncNaSemJustificativa, ncSemCriticidade, ncSemPrazo };

  if (faltamItens > 0) {
    return { ok: false, motivo: `Faltam ${faltamItens} ${faltamItens === 1 ? "item" : "itens"}`, faltamItens, ...extra };
  }
  if (ncSemObservacao > 0) {
    return { ok: false, motivo: "Descreva as NCs para finalizar", faltamItens, ...extra };
  }
  if (ncSemClassificacao > 0) {
    return { ok: false, motivo: "Classifique as NCs de segurança (Bird)", faltamItens, ...extra };
  }
  if (ncNaSemJustificativa > 0) {
    return { ok: false, motivo: "Justifique a classificação N/A", faltamItens, ...extra };
  }
  if (ncSemCriticidade > 0) {
    return { ok: false, motivo: "Defina a criticidade das NCs", faltamItens, ...extra };
  }
  if (ncSemPrazo > 0) {
    return { ok: false, motivo: "Defina o prazo das NCs", faltamItens, ...extra };
  }
  return { ok: true, faltamItens: 0, ...extra };
}
