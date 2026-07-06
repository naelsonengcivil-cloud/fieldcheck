import { describe, it, expect } from "vitest";
import { acoesDisponiveis, ncAberta, statusApos } from "@/lib/ncEstado";

describe("ncAberta", () => {
  it("aberta enquanto não aprovada/encerrada", () => {
    expect(ncAberta("aberto")).toBe(true);
    expect(ncAberta("tratada")).toBe(true);
    expect(ncAberta("reaberta")).toBe(true);
    expect(ncAberta("aprovada")).toBe(false);
    expect(ncAberta("fechado")).toBe(false);
  });
});

describe("acoesDisponiveis — máquina de estados + papel", () => {
  it("qualquer papel pode tratar quando aberto/reaberta", () => {
    expect(acoesDisponiveis("aberto", "inspetor")).toEqual(["tratar"]);
    expect(acoesDisponiveis("reaberta", "inspetor")).toEqual(["tratar"]);
    expect(acoesDisponiveis("aberto", "gestor")).toEqual(["tratar"]);
  });
  it("tratada: só gestor/admin aprova ou reprova; inspetor não age", () => {
    expect(acoesDisponiveis("tratada", "inspetor")).toEqual([]);
    expect(acoesDisponiveis("tratada", "gestor")).toEqual(["aprovar", "reprovar"]);
    expect(acoesDisponiveis("tratada", "admin")).toEqual(["aprovar", "reprovar"]);
  });
  it("aprovada é terminal — nenhuma ação", () => {
    expect(acoesDisponiveis("aprovada", "admin")).toEqual([]);
    expect(acoesDisponiveis("aprovada", "gestor")).toEqual([]);
  });
});

describe("statusApos", () => {
  it("mapeia cada ação ao próximo status", () => {
    expect(statusApos("tratar")).toBe("tratada");
    expect(statusApos("aprovar")).toBe("aprovada");
    expect(statusApos("reprovar")).toBe("reaberta");
  });
});
