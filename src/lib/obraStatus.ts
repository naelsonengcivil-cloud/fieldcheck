import type { StatusObra } from "@/types/db";

// ============================================================
// Regras do ciclo de vida da obra (Marco A / M13) — puras e testáveis.
//  - em_andamento: fluxo normal, aceita novas inspeções;
//  - finalizada: NÃO aceita novas inspeções, mas continua visível em
//    listas/dashboards/KPIs (selo "Finalizada");
//  - arquivada: fora das listas/seletores padrão (só no filtro
//    "mostrar arquivadas"); histórico preservado.
// ============================================================

/** A obra aceita a criação de novas inspeções? (só em_andamento) */
export function aceitaNovaInspecao(status: StatusObra): boolean {
  return status === "em_andamento";
}

/** A obra aparece nas listas/KPIs padrão? (em_andamento e finalizada; arquivada não) */
export function visivelPadrao(status: StatusObra): boolean {
  return status !== "arquivada";
}

export const ROTULO_STATUS: Record<StatusObra, string> = {
  em_andamento: "Em andamento",
  finalizada: "Finalizada",
  arquivada: "Arquivada",
};

/** Transições de status permitidas a partir do estado atual. */
export function transicoesPermitidas(atual: StatusObra): StatusObra[] {
  switch (atual) {
    case "em_andamento":
      return ["finalizada", "arquivada"];
    case "finalizada":
      return ["em_andamento", "arquivada"];
    case "arquivada":
      return ["em_andamento", "finalizada"];
  }
}
