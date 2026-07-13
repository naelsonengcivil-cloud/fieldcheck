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
      { resposta: "NC", observacao: "Cabo exposto no painel 3", criticidade: "alta", prazo: "2026-07-20" },
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

  it("bloqueia NC de ST sem classificação (Bird)", () => {
    const respostas: RespostaAvaliavel[] = [
      { resposta: "C", exigeClassificacaoST: true },
      { resposta: "NC", observacao: "EPI ausente", exigeClassificacaoST: true, classificacao_st: null },
    ];
    const r = avaliarFinalizacao(respostas, 2);
    expect(r.ok).toBe(false);
    expect(r.ncSemClassificacao).toBe(1);
    expect(r.motivo).toBe("Classifique as NCs de segurança (Bird)");
  });

  it("permite finalizar NC de ST classificada; não exige em checklist não-ST", () => {
    const st = avaliarFinalizacao(
      [{ resposta: "NC", observacao: "EPI ausente", exigeClassificacaoST: true, classificacao_st: "ato_inseguro", criticidade: "critica", prazo: "2026-07-10" }],
      1,
    );
    expect(st.ok).toBe(true);
    const naoSt = avaliarFinalizacao(
      [{ resposta: "NC", observacao: "trinca na viga", criticidade: "media", prazo: "2026-07-16" }], // sem exigeClassificacaoST
      1,
    );
    expect(naoSt.ok).toBe(true);
  });

  it("bloqueia NC sem criticidade (Marco I)", () => {
    const r = avaliarFinalizacao(
      [{ resposta: "NC", observacao: "trinca na viga", prazo: "2026-07-16" }],
      1,
    );
    expect(r.ok).toBe(false);
    expect(r.ncSemCriticidade).toBe(1);
    expect(r.motivo).toBe("Defina a criticidade das NCs");
  });

  it("bloqueia NC sem prazo (Marco I)", () => {
    const r = avaliarFinalizacao(
      [{ resposta: "NC", observacao: "trinca na viga", criticidade: "media" }],
      1,
    );
    expect(r.ok).toBe(false);
    expect(r.ncSemPrazo).toBe(1);
    expect(r.motivo).toBe("Defina o prazo das NCs");
  });

  it("classificação 'na' exige justificativa (melhoria 2)", () => {
    const base = { resposta: "NC" as const, observacao: "item documental", exigeClassificacaoST: true, classificacao_st: "na", criticidade: "media", prazo: "2026-07-20" };
    const semJust = avaliarFinalizacao([base], 1);
    expect(semJust.ok).toBe(false);
    expect(semJust.ncNaSemJustificativa).toBe(1);
    expect(semJust.motivo).toBe("Justifique a classificação N/A");

    const comJust = avaliarFinalizacao(
      [{ ...base, classificacao_st_justificativa: "Requisito documental, sem exposição de risco físico" }],
      1,
    );
    expect(comJust.ok).toBe(true);
    expect(comJust.ncNaSemJustificativa).toBe(0);
  });
});
