import { describe, it, expect } from "vitest";
import type { Empresa } from "@/types/db";
import { statusPlano } from "@/lib/plano";

const AGORA = Date.parse("2026-07-02T12:00:00Z");
const DIA = 86_400_000;

function empresa(p: Partial<Empresa>): Empresa {
  return {
    id: "e",
    nome: "Emp",
    plano: "trial",
    trial_expira_em: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    assinatura_ativa_ate: null,
    criado_em: "2026-07-01T12:00:00Z",
    ...p,
  };
}

describe("statusPlano", () => {
  it("cartão ativo (com subscription) → liberado", () => {
    const s = statusPlano(empresa({ plano: "ativo", stripe_subscription_id: "sub_1" }), AGORA);
    expect(s).toMatchObject({ liberada: true, estado: "ativo" });
  });

  it("ativo sem subscription e sem acesso vigente → bloqueado (expirado)", () => {
    const s = statusPlano(empresa({ plano: "ativo" }), AGORA);
    expect(s).toMatchObject({ liberada: false, estado: "expirado" });
  });

  it("Pix avulso vigente → liberado com dias restantes", () => {
    const s = statusPlano(
      empresa({ plano: "ativo", assinatura_ativa_ate: new Date(AGORA + 10 * DIA).toISOString() }),
      AGORA,
    );
    expect(s).toMatchObject({ liberada: true, estado: "pix", diasRestantes: 10 });
  });

  it("Pix avulso vencido → bloqueado", () => {
    const s = statusPlano(
      empresa({ plano: "ativo", assinatura_ativa_ate: new Date(AGORA - DIA).toISOString() }),
      AGORA,
    );
    expect(s).toMatchObject({ liberada: false, estado: "expirado" });
  });

  it("suspenso → bloqueado", () => {
    expect(statusPlano(empresa({ plano: "suspenso" }), AGORA).liberada).toBe(false);
  });

  it("trial válido → liberado com dias restantes", () => {
    const s = statusPlano(
      empresa({ plano: "trial", trial_expira_em: new Date(AGORA + 5 * DIA).toISOString() }),
      AGORA,
    );
    expect(s).toMatchObject({ liberada: true, estado: "trial", diasRestantes: 5 });
  });

  it("trial expirado → bloqueado", () => {
    const s = statusPlano(
      empresa({ plano: "trial", trial_expira_em: new Date(AGORA - DIA).toISOString() }),
      AGORA,
    );
    expect(s).toMatchObject({ liberada: false, estado: "trial_expirado" });
  });

  it("sem trial_expira_em → deriva de criado_em + 14 dias", () => {
    const s = statusPlano(empresa({ plano: "trial" }), AGORA);
    expect(s.liberada).toBe(true);
    expect(s.diasRestantes).toBe(13);
  });

  it("empresa nula → bloqueado", () => {
    expect(statusPlano(null, AGORA).liberada).toBe(false);
  });
});
