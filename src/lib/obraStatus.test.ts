import { describe, it, expect } from "vitest";
import {
  aceitaNovaInspecao,
  visivelPadrao,
  transicoesPermitidas,
} from "@/lib/obraStatus";

describe("obraStatus", () => {
  it("só em_andamento aceita novas inspeções", () => {
    expect(aceitaNovaInspecao("em_andamento")).toBe(true);
    expect(aceitaNovaInspecao("finalizada")).toBe(false);
    expect(aceitaNovaInspecao("arquivada")).toBe(false);
  });

  it("arquivada não aparece nas listas padrão; as demais sim", () => {
    expect(visivelPadrao("em_andamento")).toBe(true);
    expect(visivelPadrao("finalizada")).toBe(true);
    expect(visivelPadrao("arquivada")).toBe(false);
  });

  it("transições não incluem o próprio estado e cobrem os demais", () => {
    expect(transicoesPermitidas("em_andamento")).toEqual(["finalizada", "arquivada"]);
    expect(transicoesPermitidas("finalizada")).toContain("em_andamento");
    expect(transicoesPermitidas("arquivada")).toContain("em_andamento");
    for (const s of ["em_andamento", "finalizada", "arquivada"] as const) {
      expect(transicoesPermitidas(s)).not.toContain(s);
    }
  });
});
