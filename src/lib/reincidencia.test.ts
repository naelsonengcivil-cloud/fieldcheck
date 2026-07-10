import { describe, it, expect } from "vitest";
import type { LocalEvento } from "@/lib/db";
import type { NcTransicao } from "@/types/db";
import { rankingContratadas } from "@/lib/reincidencia";

// Reincidência e desempenho por contratada (Marco B‑e) — puro.

function ev(
  id: string,
  resposta_id: string,
  contratada_id: string | null,
  status: LocalEvento["status"],
  prazo: string | null,
): LocalEvento {
  return {
    id, resposta_id, empresa_id: "e", obra_id: "o", responsavel: null, prazo,
    status, tratamento: null, contratada_id, updated_at: "x", sync: "sincronizado",
  };
}

const nome = (id: string) => ({ cA: "Montadora A", cB: "Montadora B" }[id] ?? id);

describe("rankingContratadas", () => {
  it("agrupa por contratada, conta abertas/vencidas/encerradas e ignora NC sem contratada", () => {
    const eventos = [
      ev("e1", "r1", "cA", "aberto", "2020-01-01"), // aberta + vencida
      ev("e2", "r2", "cA", "aprovada", null), // encerrada
      ev("e3", "r3", "cB", "aberto", null), // aberta
      ev("e4", "r4", null, "aberto", null), // sem contratada → ignorada
    ];
    const itemPorResposta = new Map([["r1", "i1"], ["r2", "i2"], ["r3", "i9"]]);
    const r = rankingContratadas(eventos, itemPorResposta, new Map(), new Map(), nome, "2026-07-10");

    expect(r.map((x) => x.contratadaId)).toEqual(["cA", "cB"]); // cA tem +NCs/abertas? empate abertas=1; cA vencidas=1 → à frente
    const a = r.find((x) => x.contratadaId === "cA")!;
    expect(a.contratada).toBe("Montadora A");
    expect(a.ncs).toBe(2);
    expect(a.abertas).toBe(1);
    expect(a.vencidas).toBe(1);
    expect(a.encerradas).toBe(1);
    // cA vem antes de cB (mesmo nº de abertas, mas cA tem vencida)
    expect(r[0].contratadaId).toBe("cA");
  });

  it("conta reincidência: itens com ≥2 NCs para a mesma contratada", () => {
    const eventos = [
      ev("e1", "r1", "cA", "aberto", null), // item i1
      ev("e2", "r2", "cA", "aprovada", null), // item i1 (reincidiu)
      ev("e3", "r3", "cA", "aberto", null), // item i2 (só 1)
    ];
    const itemPorResposta = new Map([["r1", "i1"], ["r2", "i1"], ["r3", "i2"]]);
    const r = rankingContratadas(eventos, itemPorResposta, new Map(), new Map(), nome, "2026-07-10");
    const a = r.find((x) => x.contratadaId === "cA")!;
    expect(a.reincidencias).toBe(1); // só i1 tem ≥2
    expect(a.ncs).toBe(3);
  });

  it("calcula tempo médio de resolução (abertura → aprovação)", () => {
    const eventos = [ev("e1", "r1", "cA", "aprovada", null)];
    const transicoes = new Map<string, NcTransicao[]>([
      ["e1", [{
        id: "t1", evento_id: "e1", empresa_id: "e", de_status: "tratada",
        para_status: "aprovada", ator_id: null, ator_nome: null, comentario: null,
        criado_em: "2026-07-05T00:00:00Z",
      }]],
    ]);
    const abertura = new Map([["e1", "2026-07-01T00:00:00Z"]]);
    const r = rankingContratadas(eventos, new Map([["r1", "i1"]]), transicoes, abertura, nome, "2026-07-10");
    expect(r[0].tempoMedioDias).toBe(4);
  });

  it("sem NCs com contratada → lista vazia", () => {
    const r = rankingContratadas([ev("e1", "r1", null, "aberto", null)], new Map(), new Map(), new Map(), nome);
    expect(r).toEqual([]);
  });
});
