import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Integridade da FONTE do seed RNC (Marco RNC · Tarefa 5). Reparseia o xlsx
// e confere as contagens + a consistência checklist↔texto-base, o mesmo que o
// gerador scripts/gen-seed-rnc.mjs valida antes de emitir a migração 0024.

const req = createRequire(import.meta.url);
const XLSX = req("xlsx");
const SRC = fileURLToPath(new URL("../../seed-data/FieldCheck_Modelos_RNC_v1.xlsx", import.meta.url));
const wb = XLSX.readFile(SRC);
const J = (n: string): Record<string, unknown>[] =>
  XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" });

const modelos = J("MODELOS_RNC");
const secoes = J("ESTRUTURA_RNC");
const textos = J("TEXTOS_BASE");
const placeholders = J("PLACEHOLDERS");

const cobertos = modelos.flatMap((m) =>
  String(m["Checklists abrangidos"]).split(";").map((s) => s.trim()).filter(Boolean),
);
const codsTextos = new Set(textos.map((t) => String(t["Código Checklist"]).trim()));

describe("seed RNC — fonte xlsx", () => {
  it("contagens: 643 textos-base · 9 modelos · 12 seções · 26 placeholders", () => {
    expect(textos.length).toBe(643);
    expect(modelos.length).toBe(9);
    expect(secoes.length).toBe(12);
    expect(placeholders.length).toBe(26);
  });

  it("83 checklists cobertos, sem duplicidade entre modelos", () => {
    expect(new Set(cobertos).size).toBe(83);
    const dup = cobertos.filter((c, i) => cobertos.indexOf(c) !== i);
    expect(dup).toEqual([]);
  });

  it("integridade: todo checklist coberto tem texto-base e vice-versa", () => {
    const semTextos = [...new Set(cobertos)].filter((c) => !codsTextos.has(c));
    expect(semTextos).toEqual([]);
    const semModelo = [...codsTextos].filter((c) => !cobertos.includes(c));
    expect(semModelo).toEqual([]);
  });

  it("todo texto-base tem as 4 seções normativas preenchidas", () => {
    const cols = [
      "TEXTO-BASE — Requisito Descumprido",
      "TEXTO-BASE — Fundamentação Normativa",
      "TEXTO-BASE — Risco/Consequência",
      "TEXTO-BASE — Ação Corretiva",
    ];
    const incompletos = textos.filter((t) => cols.some((c) => !String(t[c] ?? "").trim()));
    expect(incompletos.length).toBe(0);
  });
});
