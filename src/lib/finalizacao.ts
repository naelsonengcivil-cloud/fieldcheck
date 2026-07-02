import type { Resposta } from "@/types/db";

// ============================================================
// Regra de finalização da inspeção (RF05) — função pura e testável.
// Finaliza só se: 100% dos itens respondidos E toda NC com observação.
// ============================================================

export interface RespostaAvaliavel {
  resposta: Resposta | ""; // "" = ainda não respondido
  observacao?: string | null;
}

export interface ResultadoFinalizacao {
  ok: boolean;
  motivo?: string;
  faltamItens: number;
  ncSemObservacao: number;
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

  if (faltamItens > 0) {
    return {
      ok: false,
      motivo: `Faltam ${faltamItens} ${faltamItens === 1 ? "item" : "itens"}`,
      faltamItens,
      ncSemObservacao,
    };
  }
  if (ncSemObservacao > 0) {
    return {
      ok: false,
      motivo: "Descreva as NCs para finalizar",
      faltamItens,
      ncSemObservacao,
    };
  }
  return { ok: true, faltamItens: 0, ncSemObservacao: 0 };
}
