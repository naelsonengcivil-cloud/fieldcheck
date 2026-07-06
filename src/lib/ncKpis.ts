import type { LocalEvento } from "@/lib/db";
import type { NcTransicao } from "@/types/db";
import { ncAberta } from "@/lib/ncEstado";

// ============================================================
// KPIs do ciclo de tratamento de NC (Marco B1 / M16) — puros, a partir
// do estado atual (eventos_nc) + histórico (nc_transicoes). Sem I/O:
// a UI monta os mapas a partir do cache Dexie e passa aqui.
// ============================================================

export interface KpisNc {
  total: number;
  abertas: number;             // aguardam tratamento (aberto | reaberta)
  aguardandoAprovacao: number; // tratada (na mão do gestor)
  encerradas: number;          // aprovada | fechado
  reabertasAlgumaVez: number;  // passaram por ao menos uma reprovação
  /** reprovações ÷ (aprovações + reprovações); null se nunca houve decisão. */
  taxaReprovacao: number | null;
  /** média de dias entre a abertura da NC e a aprovação (só encerradas); null se nenhuma. */
  tempoMedioResolucaoDias: number | null;
}

const DIA_MS = 86_400_000;

/**
 * @param eventos              eventos_nc da empresa/obra (estado atual)
 * @param transicoesPorEvento  evento_id → transições (ordenadas por data)
 * @param aberturaPorEvento    evento_id → ISO da abertura (inspecao.finalizada_em)
 */
export function calcularKpisNc(
  eventos: LocalEvento[],
  transicoesPorEvento: Map<string, NcTransicao[]>,
  aberturaPorEvento: Map<string, string>,
): KpisNc {
  let abertas = 0;
  let aguardandoAprovacao = 0;
  let encerradas = 0;
  let reabertasAlgumaVez = 0;
  let aprovacoes = 0;
  let reprovacoes = 0;
  const resolucoes: number[] = [];

  for (const ev of eventos) {
    if (ev.status === "tratada") aguardandoAprovacao++;
    else if (ncAberta(ev.status)) abertas++;
    else encerradas++;

    const trs = transicoesPorEvento.get(ev.id) ?? [];
    let reprovadaAqui = false;
    let aprovadaEm: string | null = null;
    for (const t of trs) {
      if (t.para_status === "reaberta") {
        reprovacoes++;
        reprovadaAqui = true;
      } else if (t.para_status === "aprovada") {
        aprovacoes++;
        aprovadaEm = t.criado_em;
      }
    }
    if (reprovadaAqui) reabertasAlgumaVez++;

    const abertura = aberturaPorEvento.get(ev.id);
    if (aprovadaEm && abertura) {
      const dias = (Date.parse(aprovadaEm) - Date.parse(abertura)) / DIA_MS;
      if (Number.isFinite(dias) && dias >= 0) resolucoes.push(dias);
    }
  }

  const decisoes = aprovacoes + reprovacoes;
  const media = resolucoes.length
    ? resolucoes.reduce((a, b) => a + b, 0) / resolucoes.length
    : null;

  return {
    total: eventos.length,
    abertas,
    aguardandoAprovacao,
    encerradas,
    reabertasAlgumaVez,
    taxaReprovacao: decisoes ? reprovacoes / decisoes : null,
    tempoMedioResolucaoDias: media === null ? null : Math.round(media * 10) / 10,
  };
}
