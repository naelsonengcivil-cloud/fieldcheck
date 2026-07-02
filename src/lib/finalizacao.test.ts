import { describe, it, expect } from "vitest";
import { avaliarFinalizacao, type RespostaAvaliavel } from "@/lib/finalizacao";

// Regra de finalização (RF05): 100% respondido E toda NC com observação.

describe("avaliarFinalizacao", () => {
  it("bloqueia quando faltam itens respondidos", () => {
    const respostas: RespostaAvaliavel[] = [
      { resposta: "C" },
      { resposta: "" }, // não respondido
      { resposta: "NA" },
    ];
    const r = avaliarFinalizacao(respostas, 3);
    expect(r.ok).toBe(false);
    expect(r.faltamItens).toBe(1);
    expect(r.motivo).toBe("Faltam 1 item");
  });

  it("bloqueia NC sem observação mesmo com tudo respondido", () => {
    const respostas: RespostaAvaliavel[] = [
      { resposta: "C" },
      { resposta: "NC", observacao: "   " }, // só espaços = sem observação
    ];
    const r = avaliarFinalizacao(respostas, 2);
    expect(r.ok).toBe(false);
    expect(r.ncSemObservacao).toBe(1);
    expect(r.motivo).toBe("Descreva as NCs para finalizar");
  });

  it("permite finalizar com NCs devidamente descritas", () => {
    const respostas: RespostaAvaliavel[] = [
      { resposta: "C" },
      { resposta: "NC", observacao: "Cabo exposto no painel 3" },
      { resposta: "NA" },
    ];
    const r = avaliarFinalizacao(respostas, 3);
    expect(r.ok).toBe(true);
    expect(r.faltamItens).toBe(0);
    expect(r.ncSemObservacao).toBe(0);
  });

  it("conta corretamente múltiplos itens faltando (plural)", () => {
    const r = avaliarFinalizacao([{ resposta: "C" }], 4);
    expect(r.motivo).toBe("Faltam 3 itens");
  });

  it("checklist vazio de respostas com total > 0 não finaliza", () => {
    const r = avaliarFinalizacao([], 5);
    expect(r.ok).toBe(false);
    expect(r.faltamItens).toBe(5);
  });
});
