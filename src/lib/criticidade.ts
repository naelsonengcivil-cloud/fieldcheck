import { T } from "@/theme";
import type { Criticidade, StatusEvento } from "@/types/db";

// ============================================================
// Criticidade + prazo da NC (Marco I) — puro/testável. Rótulos, cores,
// prazo sugerido a partir dos parâmetros da empresa e cálculo de "vencida".
// ============================================================

export const CRITICIDADES: Criticidade[] = ["baixa", "media", "alta", "critica"];

export const ROTULO_CRIT: Record<Criticidade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

/** Prazos padrão (dias) por criticidade — usados quando a empresa não configurou. */
export const PRAZOS_PADRAO: Record<Criticidade, number> = { critica: 1, alta: 3, media: 7, baixa: 15 };

/** Cores (frente/fundo do tema) do selo de criticidade. */
export function corCriticidade(c: Criticidade): { fg: string; bg: string } {
  switch (c) {
    case "critica":
      return { fg: T.red, bg: T.redBg };
    case "alta":
      return { fg: "#E07B39", bg: "#FBEFE3" };
    case "media":
      return { fg: T.yellowDark, bg: "#FBEFD3" };
    case "baixa":
    default:
      return { fg: T.green, bg: T.greenBg };
  }
}

/** Data-limite (YYYY-MM-DD) sugerida = base + dias configurados p/ a criticidade. */
export function prazoSugerido(
  c: Criticidade,
  prazos: Record<string, number> | null | undefined,
  base: Date = new Date(),
): string {
  const dias = (prazos && typeof prazos[c] === "number" ? prazos[c] : PRAZOS_PADRAO[c]);
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** NC vencida: tem prazo, já passou e ainda não foi aprovada/encerrada. */
export function vencida(
  prazo: string | null | undefined,
  status: StatusEvento,
  hoje: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!prazo) return false;
  if (status === "aprovada" || status === "fechado") return false;
  return prazo < hoje;
}
