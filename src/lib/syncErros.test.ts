import { describe, it, expect } from "vitest";
import { codigoPg, traduzErroSync, rotuloOperacao } from "@/lib/syncErros";
import { extrairErroSync, ehTransitorio } from "@/lib/sync";

describe("codigoPg", () => {
  it("extrai o código do Postgres do prefixo", () => {
    expect(codigoPg("23514: viola check")).toBe("23514");
    expect(codigoPg("sem codigo")).toBeNull();
    expect(codigoPg(null)).toBeNull();
  });
});

describe("traduzErroSync", () => {
  it("401/JWT → sessão expirada", () => {
    expect(traduzErroSync(401, "JWT expired").amigavel).toMatch(/sess[aã]o expirada/i);
  });
  it("23514 → incompatível/suporte", () => {
    expect(traduzErroSync(400, "23514: check").amigavel).toMatch(/contate o suporte/i);
  });
  it("23505 → duplicado", () => {
    expect(traduzErroSync(409, "23505: dup").amigavel).toMatch(/duplicado/i);
  });
  it("413 → arquivo grande", () => {
    expect(traduzErroSync(413, "Payload too large").amigavel).toMatch(/grande demais/i);
  });
  it("5xx/rede → temporário", () => {
    expect(traduzErroSync(503, "bad gateway").amigavel).toMatch(/tempor[aá]ria/i);
    expect(traduzErroSync(null, "network error").amigavel).toMatch(/tempor[aá]ria/i);
  });
  it("mostra o técnico (HTTP + PG)", () => {
    expect(traduzErroSync(400, "23514: x").tecnico).toContain("PG 23514");
    expect(traduzErroSync(400, "23514: x").tecnico).toContain("HTTP 400");
  });
});

describe("rotuloOperacao", () => {
  it("cada tabela tem rótulo", () => {
    expect(rotuloOperacao("evidencias").label).toMatch(/foto/i);
    expect(rotuloOperacao("ocorrencias").label).toMatch(/desvio/i);
  });
});

describe("extrairErroSync + ehTransitorio", () => {
  it("erro do Postgres (com código) é permanente", () => {
    const d = extrairErroSync(Object.assign(new Error("check"), { codigo: "23514" }));
    expect(d.codigo).toBe("23514");
    expect(ehTransitorio(d)).toBe(false);
  });
  it("sem status (rede/timeout) é transitório", () => {
    expect(ehTransitorio({ status: null, codigo: null, mensagem: "network" })).toBe(true);
  });
  it("5xx e 429 transitórios; 400/403 permanentes", () => {
    expect(ehTransitorio({ status: 503, codigo: null, mensagem: "" })).toBe(true);
    expect(ehTransitorio({ status: 429, codigo: null, mensagem: "" })).toBe(true);
    expect(ehTransitorio({ status: 400, codigo: null, mensagem: "" })).toBe(false);
    expect(ehTransitorio({ status: 403, codigo: null, mensagem: "" })).toBe(false);
  });
  it("lê status/code de um erro cru", () => {
    const d = extrairErroSync(Object.assign(new Error("x"), { status: 413 }));
    expect(d.status).toBe(413);
  });
});
