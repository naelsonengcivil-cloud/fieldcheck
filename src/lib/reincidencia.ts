import type { LocalEvento } from "@/lib/db";
import type { NcTransicao } from "@/types/db";
import { ncAberta } from "@/lib/ncEstado";
import { vencida } from "@/lib/criticidade";
import { calcularKpisNc } from "@/lib/ncKpis";

// ============================================================
// Reincidência e desempenho por contratada (Marco B‑e) — puro/testável.
// "Reincidência" = itens de verificação com ≥2 NCs para a mesma contratada
// (mesma falha repetida). Alimenta o dashboard executivo (RF13) e a
// priorização/cobrança das contratadas.
// ============================================================

export interface RankingContratada {
  contratadaId: string;
  contratada: string;
  ncs: number;
  abertas: number;
  vencidas: number;
  encerradas: number;
  reincidencias: number; // nº de itens com ≥2 NCs
  tempoMedioDias: number | null; // média de dias abertura→aprovação (encerradas)
}

/**
 * @param eventos               eventos_nc (estado atual) — usa evento.contratada_id
 * @param itemPorResposta       resposta_id → item_id (para agrupar reincidência)
 * @param transicoesPorEvento   evento_id → transições ordenadas
 * @param aberturaPorEvento     evento_id → ISO da abertura (inspecao.finalizada_em)
 * @param nomeContratada        id → nome de exibição
 */
export function rankingContratadas(
  eventos: LocalEvento[],
  itemPorResposta: Map<string, string>,
  transicoesPorEvento: Map<string, NcTransicao[]>,
  aberturaPorEvento: Map<string, string>,
  nomeContratada: (id: string) => string,
  hoje: string = new Date().toISOString().slice(0, 10),
): RankingContratada[] {
  // Agrupa eventos por contratada (ignora NCs sem contratada vinculada).
  const porContratada = new Map<string, LocalEvento[]>();
  for (const ev of eventos) {
    const cid = ev.contratada_id;
    if (!cid) continue;
    const arr = porContratada.get(cid) ?? [];
    arr.push(ev);
    porContratada.set(cid, arr);
  }

  const linhas: RankingContratada[] = [];
  for (const [cid, evs] of porContratada) {
    let abertas = 0;
    let vencidasN = 0;
    let encerradas = 0;
    // Reincidência: conta itens que aparecem em ≥2 NCs desta contratada.
    const porItem = new Map<string, number>();
    for (const ev of evs) {
      if (ncAberta(ev.status)) abertas++;
      else encerradas++;
      if (vencida(ev.prazo, ev.status, hoje)) vencidasN++;
      const itemId = itemPorResposta.get(ev.resposta_id);
      if (itemId) porItem.set(itemId, (porItem.get(itemId) ?? 0) + 1);
    }
    let reincidencias = 0;
    for (const n of porItem.values()) if (n >= 2) reincidencias++;

    const kpis = calcularKpisNc(evs, transicoesPorEvento, aberturaPorEvento);

    linhas.push({
      contratadaId: cid,
      contratada: nomeContratada(cid),
      ncs: evs.length,
      abertas,
      vencidas: vencidasN,
      encerradas,
      reincidencias,
      tempoMedioDias: kpis.tempoMedioResolucaoDias,
    });
  }

  // Prioriza quem tem mais problema em aberto: abertas → vencidas → reincidências → total.
  return linhas.sort(
    (a, b) =>
      b.abertas - a.abertas ||
      b.vencidas - a.vencidas ||
      b.reincidencias - a.reincidencias ||
      b.ncs - a.ncs,
  );
}
