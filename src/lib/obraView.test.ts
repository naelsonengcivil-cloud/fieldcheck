import { describe, it, expect } from "vitest";
import type { LocalInspecao, LocalResposta } from "@/lib/db";
import type { Obra } from "@/types/db";
import {
  indexarRespostas,
  kpisDoConjunto,
  filtrarInspecoes,
  resumoPorObra,
  pctConformidade,
} from "@/lib/obraView";

const obraA: Obra = { id: "oA", empresa_id: "e", nome: "Obra A", cliente: null, ativa: true };
const obraB: Obra = { id: "oB", empresa_id: "e", nome: "Obra B", cliente: null, ativa: true };

function insp(p: Partial<LocalInspecao> & { id: string }): LocalInspecao {
  return {
    empresa_id: "e",
    obra_id: "oA",
    checklist_id: "ck1",
    inspetor_id: "u1",
    frente: null,
    contratada: null,
    iniciada_em: "2026-06-01T09:00:00Z",
    finalizada_em: "2026-06-01T09:30:00Z",
    lat: null,
    lng: null,
    status: "finalizada",
    origem_offline: false,
    sync: "sincronizado",
    ...p,
  };
}
function resp(inspecao_id: string, resposta: "C" | "NC" | "NA"): LocalResposta {
  return {
    id: `${inspecao_id}-${Math.random()}`,
    inspecao_id,
    item_id: "it",
    resposta,
    observacao: resposta === "NC" ? "x" : null,
    criado_em: "2026-06-01T09:30:00Z",
    sync: "sincronizado",
  };
}

describe("pctConformidade", () => {
  it("ignora N/A no denominador e trata conjunto vazio como 100%", () => {
    expect(pctConformidade(3, 1)).toBe(75);
    expect(pctConformidade(0, 0)).toBe(100);
  });
});

describe("kpisDoConjunto", () => {
  it("soma C/NC/NA e calcula % do conjunto", () => {
    const inspecoes = [insp({ id: "i1" }), insp({ id: "i2" })];
    const respostas = [
      resp("i1", "C"),
      resp("i1", "C"),
      resp("i1", "NC"),
      resp("i2", "C"),
      resp("i2", "NA"),
    ];
    const idx = indexarRespostas(respostas);
    const k = kpisDoConjunto(inspecoes, idx);
    expect(k).toMatchObject({ nInspecoes: 2, conf: 3, nc: 1, na: 1 });
    expect(k.pct).toBe(75); // 3C / (3C+1NC)
  });
});

describe("filtrarInspecoes — filtros combináveis (RF07)", () => {
  const inspecoes = [
    insp({ id: "i1", checklist_id: "ST-01", inspetor_id: "u1", contratada: "X", finalizada_em: "2026-06-01T10:00:00Z" }),
    insp({ id: "i2", checklist_id: "ST-02", inspetor_id: "u2", contratada: "Y", finalizada_em: "2026-06-10T10:00:00Z" }),
    insp({ id: "i3", checklist_id: "ST-01", inspetor_id: "u2", contratada: "X", finalizada_em: "2026-06-20T10:00:00Z" }),
  ];
  const respostas = [resp("i1", "NC"), resp("i2", "C"), resp("i3", "C")];
  const idx = indexarRespostas(respostas);

  it("filtra por checklist", () => {
    const r = filtrarInspecoes(inspecoes, idx, { checklistId: "ST-01" });
    expect(r.map((i) => i.id)).toEqual(["i1", "i3"]);
  });
  it("filtra por inspetor + período (combinados)", () => {
    const r = filtrarInspecoes(inspecoes, idx, {
      inspetorId: "u2",
      de: "2026-06-15",
      ate: "2026-06-30",
    });
    expect(r.map((i) => i.id)).toEqual(["i3"]);
  });
  it("filtra 'somente com NC'", () => {
    const r = filtrarInspecoes(inspecoes, idx, { soNC: true });
    expect(r.map((i) => i.id)).toEqual(["i1"]);
  });
  it("filtra por contratada", () => {
    const r = filtrarInspecoes(inspecoes, idx, { contratada: "X" });
    expect(r.map((i) => i.id)).toEqual(["i1", "i3"]);
  });
  it("KPIs refletem o filtro aplicado (aceite #3)", () => {
    const filtradas = filtrarInspecoes(inspecoes, idx, { checklistId: "ST-01" });
    const k = kpisDoConjunto(filtradas, idx);
    expect(k.nInspecoes).toBe(2);
    expect(k.nc).toBe(1); // só i1 tem NC
    expect(k.conf).toBe(1); // i3 tem 1 C
  });
});

describe("resumoPorObra (RF02)", () => {
  it("agrega KPIs por obra e ordena por nº de inspeções", () => {
    const inspecoes = [
      insp({ id: "i1", obra_id: "oA" }),
      insp({ id: "i2", obra_id: "oA" }),
      insp({ id: "i3", obra_id: "oB" }),
    ];
    const respostas = [resp("i1", "C"), resp("i2", "NC"), resp("i3", "C")];
    const idx = indexarRespostas(respostas);
    const r = resumoPorObra([obraB, obraA], inspecoes, idx);
    expect(r[0].obra.id).toBe("oA"); // mais inspeções primeiro
    expect(r[0].kpis.nInspecoes).toBe(2);
    expect(r[0].kpis.nc).toBe(1);
    expect(r[1].obra.id).toBe("oB");
    expect(r[1].kpis.nInspecoes).toBe(1);
  });
});
