import type { Empresa } from "@/types/db";

// ============================================================
// Status de plano/assinatura (RF16 / M12 + Pix avulso) — pura/testável.
// Modelos suportados:
//  - cartão (assinatura recorrente): plano 'ativo' + stripe_subscription_id;
//  - Pix avulso (pagamento único): plano 'ativo' + assinatura_ativa_ate futura;
//  - trial: plano 'trial' válido até trial_expira_em.
// Liberação = escrita permitida (leitura é sempre liberada na UI).
// ============================================================

const DIA_MS = 86_400_000;

export type EstadoPlano =
  | "ativo" // assinatura de cartão vigente
  | "pix" // acesso por Pix avulso vigente
  | "cortesia" // acesso gratuito concedido pelo operador (Marco F)
  | "trial"
  | "trial_expirado"
  | "expirado" // acesso pago encerrado (Pix venceu, sem assinatura)
  | "suspenso"
  | "sem_empresa";

export interface StatusPlano {
  liberada: boolean;
  estado: EstadoPlano;
  diasRestantes: number | null;
  acessoAte: string | null; // ISO — fim do acesso (trial ou Pix), quando aplicável
  rotulo: string;
}

type EmpresaPlano = Pick<
  Empresa,
  "plano" | "trial_expira_em" | "stripe_subscription_id" | "assinatura_ativa_ate" | "criado_em" | "cortesia_ate"
>;

const dias = (ms: number) => Math.ceil(ms / DIA_MS);

export function statusPlano(
  empresa: EmpresaPlano | null,
  agora: number = Date.now(),
): StatusPlano {
  if (!empresa) {
    return { liberada: false, estado: "sem_empresa", diasRestantes: null, acessoAte: null, rotulo: "Sem empresa" };
  }

  // Cortesia do operador libera sobre qualquer estado (inclusive suspenso).
  const cortesiaMs = empresa.cortesia_ate ? new Date(empresa.cortesia_ate).getTime() : null;
  if (cortesiaMs !== null && cortesiaMs > agora) {
    const d = dias(cortesiaMs - agora);
    // Cortesia muito distante (>10 anos) = acesso permanente (conta interna/fundador):
    // mostra "Acesso liberado", sem contagem regressiva.
    const permanente = d > 3650;
    return {
      liberada: true,
      estado: "cortesia",
      diasRestantes: permanente ? null : d,
      acessoAte: empresa.cortesia_ate ?? null,
      rotulo: permanente ? "Acesso liberado" : `Cortesia · ${d} ${d === 1 ? "dia restante" : "dias restantes"}`,
    };
  }

  if (empresa.plano === "suspenso") {
    return { liberada: false, estado: "suspenso", diasRestantes: null, acessoAte: null, rotulo: "Assinatura suspensa" };
  }

  if (empresa.plano === "ativo") {
    // Cartão: confia no status da assinatura (Stripe mantém).
    if (empresa.stripe_subscription_id) {
      return {
        liberada: true,
        estado: "ativo",
        diasRestantes: null,
        acessoAte: empresa.assinatura_ativa_ate,
        rotulo: "Assinatura ativa",
      };
    }
    // Pix avulso: liberado enquanto assinatura_ativa_ate for futura.
    const ateMs = empresa.assinatura_ativa_ate ? new Date(empresa.assinatura_ativa_ate).getTime() : null;
    if (ateMs !== null && ateMs > agora) {
      const d = dias(ateMs - agora);
      return {
        liberada: true,
        estado: "pix",
        diasRestantes: d,
        acessoAte: empresa.assinatura_ativa_ate,
        rotulo: `Acesso por Pix · ${d} ${d === 1 ? "dia restante" : "dias restantes"}`,
      };
    }
    return {
      liberada: false,
      estado: "expirado",
      diasRestantes: 0,
      acessoAte: empresa.assinatura_ativa_ate,
      rotulo: "Acesso expirado",
    };
  }

  // trial
  const expiraMs = empresa.trial_expira_em
    ? new Date(empresa.trial_expira_em).getTime()
    : new Date(empresa.criado_em).getTime() + 14 * DIA_MS;
  const acessoAte = new Date(expiraMs).toISOString();
  const restanteMs = expiraMs - agora;
  if (restanteMs > 0) {
    const d = dias(restanteMs);
    return {
      liberada: true,
      estado: "trial",
      diasRestantes: d,
      acessoAte,
      rotulo: `Teste grátis · ${d} ${d === 1 ? "dia restante" : "dias restantes"}`,
    };
  }
  return { liberada: false, estado: "trial_expirado", diasRestantes: 0, acessoAte, rotulo: "Teste grátis expirado" };
}
