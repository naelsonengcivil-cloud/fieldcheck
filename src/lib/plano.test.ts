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
    criado_em: "2026-07-01T12:00:00Z",
    ...p,
  };
}

describe("statusPlano", () => {
  it("plano ativo → liberado", () => {
    const s = statusPlano(empresa({ plano: "ativo" }), AGORA);
    expect(s).toMatchObject({ liberada: true, estado: "ativo" });
  });

  it("suspenso → bloqueado", () => {
    const s = statusPlano(empresa({ plano: "suspenso" }), AGORA);
    expect(s).toMatchObject({ liberada: false, estado: "suspenso" });
  });

  it("trial válido → liberado com dias restantes", () => {
    const s = statusPlano(
      empresa({ plano: "trial", trial_expira_em: new Date(AGORA + 5 * DIA).toISOString() }),
      AGORA,
    );
    expect(s.liberada).toBe(true);
    expect(s.estado).toBe("trial");
    expect(s.diasRestantes).toBe(5);
  });

  it("trial expirado → bloqueado", () => {
    const s = statusPlano(
      empresa({ plano: "trial", trial_expira_em: new Date(AGORA - DIA).toISOString() }),
      AGORA,
    );
    expect(s).toMatchObject({ liberada: false, estado: "trial_expirado", diasRestantes: 0 });
  });

  it("sem trial_expira_em → deriva de criado_em + 14 dias", () => {
    // criado_em = 2026-07-01 → expira 2026-07-15; agora 2026-07-02 → ~13 dias
    const s = statusPlano(empresa({ plano: "trial", trial_expira_em: null }), AGORA);
    expect(s.liberada).toBe(true);
    expect(s.diasRestantes).toBe(13);
  });

  it("empresa nula → bloqueado", () => {
    expect(statusPlano(null, AGORA).liberada).toBe(false);
  });
});
