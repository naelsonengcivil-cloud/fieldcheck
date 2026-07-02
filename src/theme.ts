// ============================================================
// Design system — tokens do protótipo validado em campo
// (ver ESPECIFICACAO.md §8 e fieldcheck-v2-2.jsx)
// ============================================================

export const T = {
  bg: "#F4F4F1",
  card: "#FFFFFF",
  ink: "#16181B",
  inkSoft: "#5A5F66",
  line: "#E2E2DD",
  yellow: "#F5A800", // ação primária + faixa zebrada
  yellowDark: "#8A5F00",
  green: "#1F8A4C", // Conforme
  greenBg: "#E4F3EA",
  red: "#C6362B", // Não conforme
  redBg: "#FBE9E7",
  gray: "#6B7178", // N/A
  grayBg: "#EDEEF0",
  navy: "#1C2733", // header
} as const;

export const FONT_HEAD =
  "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif";
export const FONT_BODY =
  "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Alvo de toque mínimo (uso com luvas / sol) — ESPECIFICACAO.md §6. */
export const TOUCH_MIN = 44;

export type Cor = (typeof T)[keyof typeof T];

/** Cor de conformidade por faixa percentual (padrão do protótipo). */
export function corPorPct(pct: number): string {
  if (pct >= 95) return T.green;
  if (pct >= 80) return T.yellowDark;
  return T.red;
}
