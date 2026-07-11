import type { Notificacao, TipoNotificacao } from "@/types/db";

// ============================================================
// Parte pura das notificações (N1) — sem I/O, testável.
// ============================================================

/** Nº de não lidas. */
export function contarNaoLidas(ns: Notificacao[]): number {
  return ns.reduce((n, x) => n + (x.lida_em ? 0 : 1), 0);
}

const ROTULO: Record<TipoNotificacao, { icone: string; acao: string }> = {
  nc_atribuida: { icone: "🚩", acao: "tratar" },
  nc_reaberta: { icone: "↩️", acao: "tratar" },
  nc_aguardando_aprovacao: { icone: "⏳", acao: "aprovar" },
  nc_aprovada: { icone: "✅", acao: "ver" },
  nc_prazo_proximo: { icone: "⏰", acao: "tratar" },
  nc_prazo_vencido: { icone: "🔴", acao: "tratar" },
};
export const iconeTipo = (t: TipoNotificacao) => ROTULO[t]?.icone ?? "🔔";
export const acaoTipo = (t: TipoNotificacao) => ROTULO[t]?.acao ?? "ver";
