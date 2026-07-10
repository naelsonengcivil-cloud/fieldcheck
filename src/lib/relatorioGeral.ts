import type { LocalInspecao, LocalResposta, LocalEvento } from "@/lib/db";
import type { Criticidade } from "@/types/db";
import { pctConformidade } from "@/lib/obraView";
import { ncAberta } from "@/lib/ncEstado";
import { CRITICIDADES, vencida } from "@/lib/criticidade";

// ============================================================
// Agregações do Relatório Geral (Marco J) — puras/testáveis. Consolidam
// o recorte "empresa inteira + período": totais por obra e distribuição de
// NCs por criticidade (abertas × encerradas) + vencidas. A UI monta os
// mapas a partir do cache Dexie e passa aqui; sem I/O.
// ============================================================

export interface LinhaObra {
  obraId: string;
  obra: string;
  inspecoes: number;
  pontos: number;
  conformes: number;
  naoConformes: number;
  pct: number;
  ncsAbertas: number;
  ncsEncerradas: number;
}

/** Uma linha por obra do recorte (ordenada por nº de NCs abertas desc). */
export function consolidarPorObra(
  inspecoes: LocalInspecao[],
  respostasPorInspecao: Map<string, LocalResposta[]>,
  eventoPorResposta: Map<string, LocalEvento>,
  nomeObra: (id: string) => string,
): LinhaObra[] {
  const porObra = new Map<string, LinhaObra>();
  for (const insp of inspecoes) {
    let l = porObra.get(insp.obra_id);
    if (!l) {
      l = {
        obraId: insp.obra_id,
        obra: nomeObra(insp.obra_id),
        inspecoes: 0,
        pontos: 0,
        conformes: 0,
        naoConformes: 0,
        pct: 0,
        ncsAbertas: 0,
        ncsEncerradas: 0,
      };
      porObra.set(insp.obra_id, l);
    }
    l.inspecoes++;
    const rs = respostasPorInspecao.get(insp.id) ?? [];
    for (const r of rs) {
      if (r.resposta === "C") l.conformes++;
      else if (r.resposta === "NC") {
        l.naoConformes++;
        const ev = eventoPorResposta.get(r.id);
        if (ev) (ncAberta(ev.status) ? (l.ncsAbertas += 1) : (l.ncsEncerradas += 1));
      }
      l.pontos++;
    }
  }
  for (const l of porObra.values()) l.pct = pctConformidade(l.conformes, l.naoConformes);
  return [...porObra.values()].sort((a, b) => b.ncsAbertas - a.ncsAbertas || b.naoConformes - a.naoConformes);
}

export interface DistribCriticidade {
  criticidade: Criticidade;
  abertas: number;
  encerradas: number;
  total: number;
}

/** NCs por criticidade (abertas × encerradas) sobre os eventos do recorte. */
export function distribuirPorCriticidade(eventos: LocalEvento[]): {
  linhas: DistribCriticidade[];
  semCriticidade: number;
  vencidas: number;
} {
  const base = new Map<Criticidade, DistribCriticidade>(
    CRITICIDADES.map((c) => [c, { criticidade: c, abertas: 0, encerradas: 0, total: 0 }]),
  );
  let semCriticidade = 0;
  let vencidas = 0;
  for (const ev of eventos) {
    if (vencida(ev.prazo, ev.status)) vencidas++;
    if (!ev.criticidade) {
      semCriticidade++;
      continue;
    }
    const l = base.get(ev.criticidade)!;
    l.total++;
    if (ncAberta(ev.status)) l.abertas++;
    else l.encerradas++;
  }
  // Da mais crítica à menos (prioridade de leitura).
  const linhas = [...CRITICIDADES].reverse().map((c) => base.get(c)!);
  return { linhas, semCriticidade, vencidas };
}
