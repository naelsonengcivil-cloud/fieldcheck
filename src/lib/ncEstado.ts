import type { StatusEvento, Papel } from "@/types/db";
import { T } from "@/theme";

// ============================================================
// Máquina de estados do ciclo de tratamento de NC (Marco B1) — pura,
// sem dependências (fácil de testar). Espelha a validação do banco
// (migration 0012 / RPCs). O fluxo:
//   aberto ─registrar_tratamento→ tratada ─aprovar→ aprovada (encerra)
//                     ▲                  └reprovar→ reaberta ┐
//                     └─────────────────registrar_tratamento─┘
// ============================================================

export type AcaoNc = "tratar" | "aprovar" | "reprovar";

/** Estados a partir dos quais a executora pode (re)enviar tratamento. */
const TRATAVEL: ReadonlySet<StatusEvento> = new Set(["aberto", "reaberta", "em_andamento"]);

/** Uma NC está "em aberto" enquanto não foi aprovada (nem fechada no legado). */
export function ncAberta(status: StatusEvento): boolean {
  return status !== "aprovada" && status !== "fechado";
}

/** Ações disponíveis para um dado status + papel do usuário. */
export function acoesDisponiveis(status: StatusEvento, papel: Papel): AcaoNc[] {
  const acoes: AcaoNc[] = [];
  // Registrar/reenviar tratamento: qualquer membro (executora) enquanto tratável.
  // (O papel executora dedicado por contratada chega no M17/B2.)
  if (TRATAVEL.has(status)) acoes.push("tratar");
  // Aprovar/reprovar o tratamento enviado: só gestor/admin.
  if (status === "tratada" && (papel === "gestor" || papel === "admin")) {
    acoes.push("aprovar", "reprovar");
  }
  return acoes;
}

/** Status resultante de uma ação (para atualização otimista do cache). */
export function statusApos(acao: AcaoNc): StatusEvento {
  return acao === "tratar" ? "tratada" : acao === "aprovar" ? "aprovada" : "reaberta";
}

// Rótulos e cores (chaves de cor do tema T) por status.
export const ROTULO_STATUS: Record<StatusEvento, string> = {
  aberto: "Aberta",
  reaberta: "Reaberta",
  em_andamento: "Em tratamento",
  tratada: "Tratada · aguardando aprovação",
  aprovada: "Aprovada · encerrada",
  fechado: "Encerrada",
};

/** Cores (frente/fundo do tema) do badge de status. */
export function corStatus(status: StatusEvento): { fg: string; bg: string } {
  switch (status) {
    case "aberto":
    case "reaberta":
      return { fg: T.red, bg: T.redBg };
    case "tratada":
    case "em_andamento":
      return { fg: T.yellowDark, bg: "#FBEFD3" };
    case "aprovada":
    case "fechado":
      return { fg: T.green, bg: T.greenBg };
    default:
      return { fg: T.gray, bg: T.grayBg };
  }
}
