import type { LocalInspecao, LocalResposta } from "@/lib/db";
import type { Obra } from "@/types/db";

// ============================================================
// Agregações e filtros (RF02/RF07/RF08) — funções puras e testáveis.
// % conformidade = C / (C + NC), N/A não entra no denominador (padrão
// do protótipo).
// ============================================================

export interface Kpis {
  nInspecoes: number;
  conf: number;
  nc: number;
  na: number;
  pct: number;
}

export interface ResumoObra {
  obra: Obra;
  kpis: Kpis;
}

export interface FiltroObra {
  checklistId?: string; // undefined/"" = todos
  inspetorId?: string;
  contratada?: string;
  de?: string; // YYYY-MM-DD
  ate?: string; // YYYY-MM-DD
  soNC?: boolean;
}

/** Agrupa respostas por inspecao_id para consultas O(1). */
export function indexarRespostas(
  respostas: LocalResposta[],
): Map<string, LocalResposta[]> {
  const m = new Map<string, LocalResposta[]>();
  for (const r of respostas) {
    const arr = m.get(r.inspecao_id);
    if (arr) arr.push(r);
    else m.set(r.inspecao_id, [r]);
  }
  return m;
}

function contar(respostas: LocalResposta[]) {
  let conf = 0,
    nc = 0,
    na = 0;
  for (const r of respostas) {
    if (r.resposta === "C") conf++;
    else if (r.resposta === "NC") nc++;
    else if (r.resposta === "NA") na++;
  }
  return { conf, nc, na };
}

export function pctConformidade(conf: number, nc: number): number {
  return conf + nc > 0 ? Math.round((conf / (conf + nc)) * 100) : 100;
}

/** KPIs de um conjunto de inspeções. */
export function kpisDoConjunto(
  inspecoes: LocalInspecao[],
  idx: Map<string, LocalResposta[]>,
): Kpis {
  let conf = 0,
    nc = 0,
    na = 0;
  for (const insp of inspecoes) {
    const c = contar(idx.get(insp.id) ?? []);
    conf += c.conf;
    nc += c.nc;
    na += c.na;
  }
  return { nInspecoes: inspecoes.length, conf, nc, na, pct: pctConformidade(conf, nc) };
}

/** Data (YYYY-MM-DD) usada nos filtros de período. */
export function dataInspecao(insp: LocalInspecao): string {
  return (insp.finalizada_em ?? insp.iniciada_em ?? "").slice(0, 10);
}

/** Aplica os filtros combináveis (RF07). */
export function filtrarInspecoes(
  inspecoes: LocalInspecao[],
  idx: Map<string, LocalResposta[]>,
  filtro: FiltroObra,
): LocalInspecao[] {
  return inspecoes.filter((insp) => {
    if (filtro.checklistId && insp.checklist_id !== filtro.checklistId) return false;
    if (filtro.inspetorId && insp.inspetor_id !== filtro.inspetorId) return false;
    if (filtro.contratada && (insp.contratada ?? "") !== filtro.contratada) return false;
    const d = dataInspecao(insp);
    if (filtro.de && d < filtro.de) return false;
    if (filtro.ate && d > filtro.ate) return false;
    if (filtro.soNC) {
      const temNC = (idx.get(insp.id) ?? []).some((r) => r.resposta === "NC");
      if (!temNC) return false;
    }
    return true;
  });
}

/** Resumo por obra para a Home (RF02): KPIs de cada obra. */
export function resumoPorObra(
  obras: Obra[],
  inspecoes: LocalInspecao[],
  idx: Map<string, LocalResposta[]>,
): ResumoObra[] {
  const porObra = new Map<string, LocalInspecao[]>();
  for (const insp of inspecoes) {
    const arr = porObra.get(insp.obra_id);
    if (arr) arr.push(insp);
    else porObra.set(insp.obra_id, [insp]);
  }
  return obras
    .map((obra) => ({
      obra,
      kpis: kpisDoConjunto(porObra.get(obra.id) ?? [], idx),
    }))
    .sort((a, b) => b.kpis.nInspecoes - a.kpis.nInspecoes);
}

/** KPIs de uma única inspeção (para lista/detalhe). */
export function kpisInspecao(
  insp: LocalInspecao,
  idx: Map<string, LocalResposta[]>,
): Kpis {
  return kpisDoConjunto([insp], idx);
}
