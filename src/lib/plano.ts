import type { Empresa } from "@/types/db";

// ============================================================
// Status de plano/assinatura (RF16 / M12) — função pura e testável.
// Define liberação (leitura sempre; escrita bloqueada quando não
// liberada) e os dias restantes de trial. Espelha empresa_liberada()
// do banco (migration 0008).
// ============================================================

const DIA_MS = 86_400_000;

export type EstadoPlano = "ativo" | "trial" | "trial_expirado" | "suspenso" | "sem_empresa";

export interface StatusPlano {
  /** Escrita liberada? (plano ativo OU trial válido) */
  liberada: boolean;
  estado: EstadoPlano;
  diasRestantes: number | null; // só no trial
  rotulo: string;
}

type EmpresaPlano = Pick<Empresa, "plano" | "trial_expira_em" | "criado_em">;

export function statusPlano(
  empresa: EmpresaPlano | null,
  agora: number = Date.now(),
): StatusPlano {
  if (!empresa) {
    return { liberada: false, estado: "sem_empresa", diasRestantes: null, rotulo: "Sem empresa" };
  }
  if (empresa.plano === "ativo") {
    return { liberada: true, estado: "ativo", diasRestantes: null, rotulo: "Assinatura ativa" };
  }
  if (empresa.plano === "suspenso") {
    return {
      liberada: false,
      estado: "suspenso",
      diasRestantes: null,
      rotulo: "Assinatura suspensa",
    };
  }
  // trial: usa trial_expira_em; se ausente, deriva de criado_em + 14 dias.
  const expiraMs = empresa.trial_expira_em
    ? new Date(empresa.trial_expira_em).getTime()
    : new Date(empresa.criado_em).getTime() + 14 * DIA_MS;
  const restanteMs = expiraMs - agora;
  if (restanteMs > 0) {
    const dias = Math.ceil(restanteMs / DIA_MS);
    return {
      liberada: true,
      estado: "trial",
      diasRestantes: dias,
      rotulo: `Teste grátis · ${dias} ${dias === 1 ? "dia restante" : "dias restantes"}`,
    };
  }
  return {
    liberada: false,
    estado: "trial_expirado",
    diasRestantes: 0,
    rotulo: "Teste grátis expirado",
  };
}
