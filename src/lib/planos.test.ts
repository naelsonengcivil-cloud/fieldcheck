import { describe, it, expect } from "vitest";
import { extrairUpgradeHint, temFeatureNaMatriz, planoQueInclui, type LinhaFeature } from "./planos";

// ============================================================
// Parser do hint estruturado de limite (0055) — a UX depende dele para abrir
// a vitrine em vez de mostrar erro cru. Nunca deve inventar um recurso.
// ============================================================

describe("extrairUpgradeHint", () => {
  it("lê o hint de um PostgrestError de limite", () => {
    expect(extrairUpgradeHint({ code: "P0001", hint: "upgrade:obras", message: "Limite…" })).toBe("obras");
    expect(extrairUpgradeHint({ hint: "upgrade:usuarios" })).toBe("usuarios");
    expect(extrairUpgradeHint({ hint: "upgrade:checklists" })).toBe("checklists");
  });

  it("lê o hint quando vem como string (checklist)", () => {
    expect(extrairUpgradeHint("upgrade:checklists")).toBe("checklists");
  });

  it("reconhece o modo somente-leitura", () => {
    expect(extrairUpgradeHint({ hint: "reativar" })).toBe("reativar");
  });

  it("acha o hint também no message/details", () => {
    expect(extrairUpgradeHint({ details: "algo upgrade:obras aqui" })).toBe("obras");
  });

  it("ignora recurso desconhecido (não inventa acesso)", () => {
    expect(extrairUpgradeHint({ hint: "upgrade:foobar" })).toBeNull();
  });

  it("retorna null para erros comuns", () => {
    expect(extrairUpgradeHint({ message: "violates row-level security" })).toBeNull();
    expect(extrairUpgradeHint("erro genérico")).toBeNull();
    expect(extrairUpgradeHint(null)).toBeNull();
    expect(extrairUpgradeHint(undefined)).toBeNull();
  });
});

describe("temFeatureNaMatriz / planoQueInclui", () => {
  const matriz: LinhaFeature[] = [
    { feature: "bi_full", basic: false, premium: false, intelligence: true, descricao: null },
    { feature: "data_export", basic: false, premium: true, intelligence: true, descricao: null },
  ];

  it("gate por tier respeita a matriz", () => {
    expect(temFeatureNaMatriz("premium", "bi_full", matriz)).toBe(false);
    expect(temFeatureNaMatriz("intelligence", "bi_full", matriz)).toBe(true);
    expect(temFeatureNaMatriz("premium", "data_export", matriz)).toBe(true);
  });

  it("readonly/archived nunca têm feature", () => {
    expect(temFeatureNaMatriz("readonly", "data_export", matriz)).toBe(false);
    expect(temFeatureNaMatriz("archived", "bi_full", matriz)).toBe(false);
  });

  it("planoQueInclui aponta o menor plano com a feature", () => {
    expect(planoQueInclui("bi_full", matriz)).toBe("intelligence");
    expect(planoQueInclui("data_export", matriz)).toBe("premium");
  });
});
