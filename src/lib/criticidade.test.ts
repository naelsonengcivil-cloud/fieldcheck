import { describe, it, expect } from "vitest";
import { CRITICIDADES, ROTULO_CRIT, PRAZOS_PADRAO, prazoSugerido, vencida } from "@/lib/criticidade";

// Criticidade + prazo da NC (Marco I) — funções puras.

describe("criticidade", () => {
  it("ordena da menor à maior e rotula em pt-BR", () => {
    expect(CRITICIDADES).toEqual(["baixa", "media", "alta", "critica"]);
    expect(ROTULO_CRIT.critica).toBe("Crítica");
    expect(ROTULO_CRIT.media).toBe("Média");
  });

  it("prazoSugerido usa os dias configurados pela empresa", () => {
    const base = new Date("2026-07-09T12:00:00Z");
    expect(prazoSugerido("critica", { critica: 2, alta: 5, media: 10, baixa: 20 }, base)).toBe("2026-07-11");
    expect(prazoSugerido("baixa", { critica: 2, alta: 5, media: 10, baixa: 20 }, base)).toBe("2026-07-29");
  });

  it("prazoSugerido cai no padrão quando a empresa não configurou", () => {
    const base = new Date("2026-07-09T12:00:00Z");
    // padrão: critica=1, alta=3, media=7, baixa=15
    expect(prazoSugerido("alta", null, base)).toBe("2026-07-12");
    expect(prazoSugerido("media", undefined, base)).toBe("2026-07-16");
    expect(PRAZOS_PADRAO.critica).toBe(1);
  });

  it("vencida: prazo no passado e NC ainda em tratamento", () => {
    expect(vencida("2026-07-01", "aberto", "2026-07-09")).toBe(true);
    expect(vencida("2026-07-20", "aberto", "2026-07-09")).toBe(false);
  });

  it("vencida: NC aprovada/fechada nunca conta como vencida", () => {
    expect(vencida("2026-07-01", "aprovada", "2026-07-09")).toBe(false);
    expect(vencida("2026-07-01", "fechado", "2026-07-09")).toBe(false);
  });

  it("vencida: sem prazo não é vencida", () => {
    expect(vencida(null, "aberto", "2026-07-09")).toBe(false);
    expect(vencida("", "aberto", "2026-07-09")).toBe(false);
  });
});
