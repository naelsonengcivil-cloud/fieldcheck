import { describe, it, expect } from "vitest";
import type { LocalInspecao, LocalResposta, LocalEvento } from "@/lib/db";
import { consolidarPorObra, distribuirPorCriticidade } from "@/lib/relatorioGeral";

// Agregações do Relatório Geral (Marco J) — puras.

function insp(id: string, obra_id: string): LocalInspecao {
  return {
    id, empresa_id: "e", obra_id, checklist_id: "ck", inspetor_id: "u",
    frente: null, contratada: null, iniciada_em: "2026-07-01T09:00:00Z",
    finalizada_em: "2026-07-01T10:00:00Z", data_inspecao: null, registrado_em: null, lat: null, lng: null,
    status: "finalizada", origem_offline: true, arquivada: false, sync: "sincronizado",
  };
}
function resp(id: string, inspecao_id: string, r: LocalResposta["resposta"]): LocalResposta {
  return { id, inspecao_id, item_id: "it", resposta: r, observacao: null, criado_em: "x", sync: "sincronizado" };
}
function ev(resposta_id: string, obra_id: string, status: LocalEvento["status"], criticidade: LocalEvento["criticidade"], prazo: string | null): LocalEvento {
  return {
    id: `ev-${resposta_id}`, resposta_id, empresa_id: "e", obra_id, responsavel: null,
    prazo, criticidade, status, tratamento: null, updated_at: "x", sync: "sincronizado",
  };
}

describe("consolidarPorObra", () => {
  it("agrupa por obra e conta NCs abertas × encerradas", () => {
    const inspecoes = [insp("i1", "oA"), insp("i2", "oA"), insp("i3", "oB")];
    const idx = new Map<string, LocalResposta[]>([
      ["i1", [resp("r1", "i1", "C"), resp("r2", "i1", "NC")]],
      ["i2", [resp("r3", "i2", "NC"), resp("r4", "i2", "NA")]],
      ["i3", [resp("r5", "i3", "C")]],
    ]);
    const evMap = new Map<string, LocalEvento>([
      ["r2", ev("r2", "oA", "aberto", "alta", null)],
      ["r3", ev("r3", "oA", "aprovada", "baixa", null)],
    ]);
    const linhas = consolidarPorObra(inspecoes, idx, evMap, (id) => (id === "oA" ? "Obra A" : "Obra B"));

    const a = linhas.find((l) => l.obraId === "oA")!;
    expect(a.obra).toBe("Obra A");
    expect(a.inspecoes).toBe(2);
    expect(a.pontos).toBe(4);
    expect(a.naoConformes).toBe(2);
    expect(a.ncsAbertas).toBe(1);
    expect(a.ncsEncerradas).toBe(1);
    expect(a.conformes).toBe(1);
    // Obra A (com NC aberta) vem antes de Obra B (sem NC).
    expect(linhas[0].obraId).toBe("oA");
  });
});

describe("distribuirPorCriticidade", () => {
  it("separa abertas/encerradas por criticidade e conta vencidas + sem criticidade", () => {
    const eventos = [
      ev("r1", "o", "aberto", "critica", "2020-01-01"), // aberta + vencida
      ev("r2", "o", "aprovada", "critica", "2020-01-01"), // encerrada, não conta vencida
      ev("r3", "o", "aberto", "media", null),
      ev("r4", "o", "aberto", null, "2020-01-01"), // sem criticidade + vencida
    ];
    const d = distribuirPorCriticidade(eventos);
    const critica = d.linhas.find((l) => l.criticidade === "critica")!;
    expect(critica.abertas).toBe(1);
    expect(critica.encerradas).toBe(1);
    expect(critica.total).toBe(2);
    expect(d.semCriticidade).toBe(1);
    expect(d.vencidas).toBe(2); // r1 e r4
    // Ordem: da mais crítica à menos.
    expect(d.linhas[0].criticidade).toBe("critica");
    expect(d.linhas[3].criticidade).toBe("baixa");
  });
});
