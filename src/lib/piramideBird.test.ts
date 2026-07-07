import { describe, it, expect } from "vitest";
import { calcularBird } from "@/lib/piramideBird";
import type { ClassificacaoST, TipoOcorrencia } from "@/types/db";

const r = (c: ClassificacaoST | null) => ({ classificacao_st: c });
const o = (t: TipoOcorrencia) => ({ tipo: t });

describe("calcularBird", () => {
  it("conta base (por classificação) e topo (por ocorrência)", () => {
    const k = calcularBird(
      [r("ato_inseguro"), r("ato_inseguro"), r("condicao_insegura"), r("condicao_insegura"), r("condicao_insegura"), r("quase_acidente"), r(null)],
      [o("dano_material"), o("acidente_sem_afastamento"), o("acidente_com_afastamento")],
    );
    expect(k.base).toEqual({ ato_inseguro: 2, condicao_insegura: 3, quase_acidente: 1 });
    expect(k.niveis.map((n) => n.count)).toEqual([6, 1, 1, 1]); // base, dano, sem, com
    expect(k.topoTotal).toBe(3);
    expect(k.razaoBaseTopo).toBe(2);
  });

  it("flag de subnotificação quando a base é fina frente aos acidentes", () => {
    const k = calcularBird([r("condicao_insegura")], [o("acidente_com_afastamento")]);
    expect(k.subnotificacao).toBe(true); // base 1 < topo 1 * 5
    expect(k.leitura).toMatch(/SUBNOTIFICA/);
  });

  it("base saudável frente aos acidentes não sinaliza subnotificação", () => {
    const base = Array.from({ length: 100 }, () => r("quase_acidente"));
    const k = calcularBird(base, [o("dano_material"), o("acidente_sem_afastamento"), o("acidente_com_afastamento")]);
    expect(k.subnotificacao).toBe(false);
    expect(k.razaoBaseTopo).toBeCloseTo(100 / 3);
  });

  it("sem acidentes: razão nula e sem subnotificação", () => {
    const k = calcularBird([r("ato_inseguro"), r("condicao_insegura")], []);
    expect(k.topoTotal).toBe(0);
    expect(k.razaoBaseTopo).toBeNull();
    expect(k.subnotificacao).toBe(false);
    expect(k.leitura).toMatch(/nenhum acidente/i);
  });

  it("período vazio", () => {
    const k = calcularBird([], []);
    expect(k.total).toBe(0);
    expect(k.leitura).toMatch(/Sem registros/i);
  });
});
