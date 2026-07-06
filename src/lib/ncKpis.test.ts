import { describe, it, expect } from "vitest";
import type { LocalEvento } from "@/lib/db";
import type { NcTransicao, StatusEvento } from "@/types/db";
import { calcularKpisNc } from "@/lib/ncKpis";

function ev(id: string, status: StatusEvento): LocalEvento {
  return {
    id,
    resposta_id: `r-${id}`,
    empresa_id: "e",
    obra_id: "o",
    responsavel: null,
    prazo: null,
    status,
    tratamento: null,
    updated_at: "2026-06-01T00:00:00Z",
    sync: "sincronizado",
  };
}
function tr(evento_id: string, para: StatusEvento, criado_em: string): NcTransicao {
  return {
    id: `${evento_id}-${para}-${criado_em}`,
    evento_id,
    empresa_id: "e",
    de_status: null,
    para_status: para,
    ator_id: null,
    ator_nome: "X",
    comentario: null,
    criado_em,
  };
}

describe("calcularKpisNc", () => {
  const eventos = [
    ev("e1", "aprovada"),
    ev("e2", "aprovada"),
    ev("e3", "tratada"),
    ev("e4", "aberto"),
  ];
  const transicoes = new Map<string, NcTransicao[]>([
    ["e1", [tr("e1", "tratada", "2026-06-01T00:00:00Z"), tr("e1", "aprovada", "2026-06-03T00:00:00Z")]],
    ["e2", [
      tr("e2", "tratada", "2026-06-01T00:00:00Z"),
      tr("e2", "reaberta", "2026-06-02T00:00:00Z"),
      tr("e2", "tratada", "2026-06-03T00:00:00Z"),
      tr("e2", "aprovada", "2026-06-05T00:00:00Z"),
    ]],
    ["e3", [tr("e3", "tratada", "2026-06-01T00:00:00Z")]],
  ]);
  const abertura = new Map<string, string>([
    ["e1", "2026-06-01T00:00:00Z"], // aprovada +2d
    ["e2", "2026-06-01T00:00:00Z"], // aprovada +4d
  ]);

  const k = calcularKpisNc(eventos, transicoes, abertura);

  it("distribui por status", () => {
    expect(k.total).toBe(4);
    expect(k.abertas).toBe(1); // e4
    expect(k.aguardandoAprovacao).toBe(1); // e3
    expect(k.encerradas).toBe(2); // e1, e2
  });
  it("conta retrabalho e taxa de reprovação", () => {
    expect(k.reabertasAlgumaVez).toBe(1); // e2
    expect(k.taxaReprovacao).toBeCloseTo(1 / 3); // 1 reprov / (2 aprov + 1 reprov)
  });
  it("média de resolução em dias (só encerradas)", () => {
    expect(k.tempoMedioResolucaoDias).toBe(3); // (2 + 4) / 2
  });

  it("sem decisões nem resoluções → nulls", () => {
    const vazio = calcularKpisNc([ev("x", "aberto")], new Map(), new Map());
    expect(vazio.taxaReprovacao).toBeNull();
    expect(vazio.tempoMedioResolucaoDias).toBeNull();
    expect(vazio.abertas).toBe(1);
  });
});
