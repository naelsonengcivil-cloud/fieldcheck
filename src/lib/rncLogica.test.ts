import { describe, it, expect } from "vitest";
import {
  montarValores,
  interpolar,
  interpolarSecoes,
  parseGravidade,
  tentarParse,
  brData,
  type CtxInterpolacao,
} from "../../supabase/functions/rnc-generate/logica";

// Lógica pura da Edge Function rnc-generate (Marco RNC · Tarefa 5).

const CTX_BASE: CtxInterpolacao = {
  numero: "RNC-2026-0007",
  obra: "UFV Diamantina I",
  cliente: "G5 Engenharia",
  contratada: "Montadora X",
  checklist_codigo: "EL-04",
  checklist_nome: "Aterramento e SPDA",
  criterio: "Conexões conforme projeto",
  item_numero: 4,
  item_verificacao: "Conexões estrutura–malha completas",
  data_inspecao_iso: "2026-07-09T13:45:00Z",
  inspetor: "Naelson",
  local: "Fileiras 112 a 118",
  ativo: "Tracker P-03",
  descricao_nc: "6 trackers sem cabo de aterramento",
  exige_projeto_ref: true,
  projeto_num: "PRJ-EL-220",
  projeto_rev: "R03",
};

// Placeholders substituídos (plataforma/campo) × preservados (fechamento).
const SUBSTITUIDOS = [
  "{{numero_rnc}}", "{{obra}}", "{{cliente}}", "{{contratada}}", "{{checklist_codigo}}",
  "{{checklist_nome}}", "{{criterio}}", "{{item_numero}}", "{{item_verificacao}}",
  "{{data_inspecao}}", "{{inspetor}}", "{{local}}", "{{ativo}}", "{{descricao_nc}}",
  "{{evidencia_foto}}", "{{projeto_num}}", "{{projeto_rev}}",
];
const PRESERVADOS = [
  "{{prazo}}", "{{responsavel}}", "{{evidencia_foto_correcao}}", "{{data_fechamento}}",
  "{{reinspecao_resultado}}", "{{acao_complementar}}", "{{risco_complementar}}",
  "{{status}}", "{{gravidade}}",
];

describe("interpolação determinística", () => {
  it("cobre os 26 placeholders: substitui os de plataforma/campo e preserva os de fechamento", () => {
    expect(SUBSTITUIDOS.length + PRESERVADOS.length).toBe(26);
    const valores = montarValores(CTX_BASE);
    const template = [...SUBSTITUIDOS, ...PRESERVADOS].join(" | ");
    const saida = interpolar(template, valores);
    for (const ph of SUBSTITUIDOS) expect(saida).not.toContain(ph); // substituídos
    for (const ph of PRESERVADOS) expect(saida).toContain(ph); // permanecem no texto
  });

  it("data_inspecao vira DD/MM/AAAA; item_numero vira string", () => {
    const v = montarValores(CTX_BASE);
    expect(v["{{data_inspecao}}"]).toBe("09/07/2026");
    expect(v["{{item_numero}}"]).toBe("4");
    expect(v["{{descricao_nc}}"]).toBe("6 trackers sem cabo de aterramento");
  });

  it("com exige_projeto_ref = true, preenche projeto_num/rev", () => {
    const v = montarValores(CTX_BASE);
    expect(v["{{projeto_num}}"]).toBe("PRJ-EL-220");
    expect(v["{{projeto_rev}}"]).toBe("R03");
  });

  it("com exige_projeto_ref = false, projeto_num/rev ficam vazios (placeholder removido)", () => {
    const v = montarValores({ ...CTX_BASE, exige_projeto_ref: false });
    expect(v["{{projeto_num}}"]).toBe("");
    expect(v["{{projeto_rev}}"]).toBe("");
    const saida = interpolar("Projeto {{projeto_num}} rev {{projeto_rev}}.", v);
    expect(saida).toBe("Projeto  rev .");
  });

  it("interpolarSecoes aplica em todas as 4 seções", () => {
    const v = montarValores(CTX_BASE);
    const base = {
      texto_requisito_descumprido: "Item {{item_numero}} do {{checklist_codigo}} em {{local}}.",
      texto_fundamentacao_normativa: "Norma para {{checklist_nome}}.",
      texto_risco_consequencia: "Risco em {{ativo}}.",
      texto_acao_corretiva: "Corrigir até {{prazo}}.",
    };
    const s = interpolarSecoes(base, v);
    expect(s.requisito).toBe("Item 4 do EL-04 em Fileiras 112 a 118.");
    expect(s.fundamentacao).toBe("Norma para Aterramento e SPDA.");
    expect(s.risco).toBe("Risco em Tracker P-03.");
    expect(s.acao).toBe("Corrigir até {{prazo}}."); // {{prazo}} preservado
  });

  it("brData tolera nulo", () => {
    expect(brData(null)).toBe("");
    expect(brData("2026-01-31T00:00:00Z")).toBe("31/01/2026");
  });
});

describe("parseGravidade", () => {
  it("mapeia o texto-base ao enum (default maior)", () => {
    expect(parseGravidade("Maior — elevar a Crítica em risco grave")).toBe("maior");
    expect(parseGravidade("Menor a Maior, conforme impacto")).toBe("menor");
    expect(parseGravidade("Crítica — paralisação imediata")).toBe("critica");
    expect(parseGravidade("critica")).toBe("critica");
    expect(parseGravidade("Observação de melhoria")).toBe("observacao");
    expect(parseGravidade("")).toBe("maior");
    expect(parseGravidade("algo inesperado")).toBe("maior");
  });
});

describe("tentarParse (saída da IA)", () => {
  const jsonOk = JSON.stringify({
    secoes: { requisito: "R", fundamentacao: "F", risco: "Ri", acao: "A" },
    gravidade_sugerida: "Maior",
    risco_complementar_sugerido: " risco ",
    acao_complementar_sugerido: " ação ",
  });

  it("parseia JSON válido e normaliza gravidade/complementos", () => {
    const o = tentarParse(jsonOk)!;
    expect(o.secoes.requisito).toBe("R");
    expect(o.gravidade_sugerida).toBe("maior"); // lowercase
    expect(o.risco_complementar_sugerido).toBe("risco"); // trim
    expect(o.acao_complementar_sugerido).toBe("ação");
  });

  it("tolera cerca markdown e texto em volta", () => {
    const comCerca = "```json\n" + jsonOk + "\n```";
    expect(tentarParse(comCerca)?.secoes.risco).toBe("Ri");
    const comTexto = "Segue o JSON: " + jsonOk + " (fim)";
    expect(tentarParse(comTexto)?.secoes.acao).toBe("A");
  });

  it("retorna null quando faltam seções (→ fallback determinístico)", () => {
    const semRisco = JSON.stringify({ secoes: { requisito: "R", fundamentacao: "F", acao: "A" } });
    expect(tentarParse(semRisco)).toBeNull();
  });

  it("retorna null para não-JSON ou vazio", () => {
    expect(tentarParse("desculpe, não posso")).toBeNull();
    expect(tentarParse("")).toBeNull();
    expect(tentarParse("{ quebrado ")).toBeNull();
  });
});
