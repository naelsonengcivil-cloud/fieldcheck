import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, Kpi } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db, type LocalInspecao } from "@/lib/db";
import { useAuth } from "@/features/auth/AuthProvider";
import { calcularKpisNc } from "@/lib/ncKpis";
import { dataInspecao } from "@/lib/obraView";
import { exportarRncsXLSX, type LinhaRnc } from "@/lib/exportacoes";
import { buscarRncsPorRespostas } from "@/lib/rncService";
import { corStatus, ncAberta, ROTULO_STATUS } from "@/lib/ncEstado";
import { CRITICIDADES, ROTULO_CRIT, corCriticidade, vencida } from "@/lib/criticidade";
import type { Obra, NcTransicao, StatusEvento, Criticidade } from "@/types/db";

// ============================================================
// Painel de NCs da obra (M16): KPIs do ciclo de tratamento a partir do
// histórico (nc_transicoes) + worklist filtrável por status, com link
// para o detalhe da inspeção para agir. Lê do Dexie (offline).
// ============================================================

type Bucket = "todas" | "abertas" | "aguardando" | "encerradas";

const bucketDoStatus = (s: StatusEvento): Exclude<Bucket, "todas"> =>
  s === "tratada" ? "aguardando" : ncAberta(s) ? "abertas" : "encerradas";

export function PainelNc({
  obra,
  onVerInspecao,
  onVoltar,
}: {
  obra: Obra;
  onVerInspecao: (insp: LocalInspecao) => void;
  onVoltar: () => void;
}) {
  // eventos_nc não é indexado por obra_id no Dexie → lê tudo e filtra em memória.
  const eventosAll = useLiveQuery(() => db.eventos.toArray(), [], []);
  const eventos = useMemo(
    () => eventosAll.filter((e) => e.obra_id === obra.id),
    [eventosAll, obra.id],
  );
  const respostas = useLiveQuery(() => db.respostas.toArray(), [], []);
  const itens = useLiveQuery(() => db.itens.toArray(), [], []);
  const inspecoes = useLiveQuery(() => db.inspecoes.toArray(), [], []);
  const transicoes = useLiveQuery(() => db.nc_transicoes.toArray(), [], []);

  const { empresa } = useAuth();
  const [bucket, setBucket] = useState<Bucket>("todas");
  const [crit, setCrit] = useState<Criticidade | "todas">("todas");
  const [exportando, setExportando] = useState(false);

  const respMap = useMemo(() => new Map(respostas.map((r) => [r.id, r])), [respostas]);
  const itemMap = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const inspMap = useMemo(() => new Map(inspecoes.map((i) => [i.id, i])), [inspecoes]);
  const transPorEvento = useMemo(() => {
    const m = new Map<string, NcTransicao[]>();
    for (const t of transicoes) {
      const arr = m.get(t.evento_id) ?? [];
      arr.push(t);
      m.set(t.evento_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    return m;
  }, [transicoes]);

  // NCs da obra cuja inspeção existe e não está arquivada (fora de KPIs/listas).
  const linhas = useMemo(() => {
    return eventos
      .map((ev) => {
        const resp = respMap.get(ev.resposta_id);
        const insp = resp ? inspMap.get(resp.inspecao_id) : undefined;
        return { ev, resp, insp };
      })
      .filter((l): l is { ev: (typeof eventos)[number]; resp: NonNullable<typeof l.resp>; insp: LocalInspecao } =>
        Boolean(l.resp && l.insp && !l.insp!.arquivada),
      )
      .sort((a, b) => (b.insp.finalizada_em ?? "").localeCompare(a.insp.finalizada_em ?? ""));
  }, [eventos, respMap, inspMap]);

  // Exportação em lote das RNCs das NCs desta obra (melhoria 3).
  async function exportarRncs() {
    setExportando(true);
    try {
      const ids = linhas.map((l) => l.resp.id);
      const map = await buscarRncsPorRespostas(ids);
      const textoPorResp = new Map(
        linhas.map((l) => [l.resp.id, itemMap.get(l.resp.item_id)?.texto ?? l.resp.observacao ?? "NC"]),
      );
      const rncs: LinhaRnc[] = [...map.values()].map((rnc) => ({
        rnc,
        obra: obra.nome,
        itemTexto: textoPorResp.get(rnc.resposta_item_id) ?? "",
      }));
      await exportarRncsXLSX(rncs, empresa?.nome ?? "FieldCheck", new Date().toLocaleString("pt-BR"));
    } finally {
      setExportando(false);
    }
  }

  const kpis = useMemo(() => {
    const evs = linhas.map((l) => l.ev);
    const abertura = new Map<string, string>();
    for (const l of linhas) if (l.insp.finalizada_em) abertura.set(l.ev.id, l.insp.finalizada_em);
    return calcularKpisNc(evs, transPorEvento, abertura);
  }, [linhas, transPorEvento]);

  const visiveis = useMemo(
    () =>
      linhas.filter(
        (l) =>
          (bucket === "todas" || bucketDoStatus(l.ev.status) === bucket) &&
          (crit === "todas" || l.ev.criticidade === crit),
      ),
    [linhas, bucket, crit],
  );

  // Vencidas: prazo estourado e NC ainda não encerrada (destaque de risco).
  const vencidas = useMemo(() => linhas.filter((l) => vencida(l.ev.prazo, l.ev.status)).length, [linhas]);
  // Contagem por criticidade (só NCs abertas, para o filtro).
  const porCrit = useMemo(() => {
    const m = new Map<Criticidade, number>();
    for (const l of linhas) if (l.ev.criticidade) m.set(l.ev.criticidade, (m.get(l.ev.criticidade) ?? 0) + 1);
    return m;
  }, [linhas]);

  const tabs: [Bucket, string, number][] = [
    ["todas", "Todas", kpis.total],
    ["abertas", "Abertas", kpis.abertas],
    ["aguardando", "Aguardando", kpis.aguardandoAprovacao],
    ["encerradas", "Encerradas", kpis.encerradas],
  ];

  return (
    <div>
      <Header titulo="NCs da obra" sub={obra.nome} onBack={onVoltar} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi label="Abertas" valor={kpis.abertas} cor={kpis.abertas ? T.red : T.green} />
          <Kpi label="Aguardando" valor={kpis.aguardandoAprovacao} cor={kpis.aguardandoAprovacao ? T.yellowDark : T.inkSoft} />
          <Kpi label="Encerradas" valor={kpis.encerradas} cor={T.green} />
        </div>

        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>
            Qualidade do tratamento
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, textAlign: "center" }}>
            <Metrica valor={String(kpis.reabertasAlgumaVez)} label="Reabertas" />
            <Metrica
              valor={kpis.taxaReprovacao === null ? "—" : `${Math.round(kpis.taxaReprovacao * 100)}%`}
              label="Taxa reprovação"
            />
            <Metrica
              valor={kpis.tempoMedioResolucaoDias === null ? "—" : `${kpis.tempoMedioResolucaoDias} d`}
              label="Tempo médio"
            />
          </div>
        </Card>

        <Botao variante="fantasma" onClick={() => void exportarRncs()} disabled={exportando} style={{ width: "auto" }}>
          {exportando ? "Exportando…" : "📊 Exportar RNCs (xlsx)"}
        </Botao>

        {/* filtro por bucket */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
          {tabs.map(([b, label, n]) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              style={{
                padding: "9px 2px",
                borderRadius: 10,
                cursor: "pointer",
                fontFamily: FONT_HEAD,
                fontWeight: 700,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                border: bucket === b ? `2px solid ${T.yellow}` : `2px solid ${T.line}`,
                background: bucket === b ? "#FFF4D6" : "#fff",
                color: bucket === b ? T.yellowDark : T.inkSoft,
              }}
            >
              {label} ({n})
            </button>
          ))}
        </div>

        {/* filtro por criticidade */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6 }}>
          {(["todas", ...CRITICIDADES] as (Criticidade | "todas")[]).map((c) => {
            const sel = crit === c;
            const cc = c === "todas" ? { fg: T.inkSoft, bg: "#FFF4D6" } : corCriticidade(c);
            const n = c === "todas" ? linhas.length : porCrit.get(c) ?? 0;
            return (
              <button
                key={c}
                onClick={() => setCrit(c)}
                style={{
                  padding: "8px 2px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 11.5,
                  fontWeight: 700,
                  border: sel ? `2px solid ${cc.fg}` : `2px solid ${T.line}`,
                  background: sel ? cc.bg : "#fff",
                  color: sel ? cc.fg : T.inkSoft,
                  lineHeight: 1.1,
                }}
              >
                {c === "todas" ? "Todas" : ROTULO_CRIT[c]}
                <br />
                <span style={{ fontSize: 10, opacity: 0.8 }}>({n})</span>
              </button>
            );
          })}
        </div>

        {vencidas > 0 && (
          <div
            style={{
              background: T.redBg,
              color: T.red,
              border: `1px solid ${T.red}`,
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            ⏰ {vencidas} NC{vencidas > 1 ? "s" : ""} com prazo vencido
          </div>
        )}

        {visiveis.map(({ ev, resp, insp }) => {
          const cor = corStatus(ev.status);
          const item = itemMap.get(resp.item_id);
          return (
            <button
              key={ev.id}
              onClick={() => onVerInspecao(insp)}
              style={{
                textAlign: "left",
                background: T.card,
                border: `1px solid ${T.line}`,
                borderLeft: `5px solid ${cor.fg}`,
                borderRadius: 12,
                padding: 12,
                cursor: "pointer",
                width: "100%",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>
                  {item?.texto ?? resp.observacao ?? "NC"}
                </div>
                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <span
                    style={{
                      fontFamily: FONT_HEAD,
                      fontWeight: 700,
                      fontSize: 11.5,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                      color: cor.fg,
                      background: cor.bg,
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                  >
                    {ROTULO_STATUS[ev.status]}
                  </span>
                  {ev.criticidade && (
                    <span
                      style={{
                        fontFamily: FONT_HEAD,
                        fontWeight: 700,
                        fontSize: 11.5,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        color: corCriticidade(ev.criticidade).fg,
                        background: corCriticidade(ev.criticidade).bg,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {ROTULO_CRIT[ev.criticidade]}
                    </span>
                  )}
                  {vencida(ev.prazo, ev.status) && (
                    <span
                      style={{
                        fontFamily: FONT_HEAD,
                        fontWeight: 700,
                        fontSize: 11.5,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        color: "#fff",
                        background: T.red,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      ⏰ Vencida
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4 }}>
                  {`📌 origem ${dataInspecao(insp).split("-").reverse().join("/")}`}
                  {ev.responsavel && ` · 👤 ${ev.responsavel}`}
                  {ev.prazo && ` · 📅 ${ev.prazo.split("-").reverse().join("/")}`}
                </div>
              </div>
              <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
            </button>
          );
        })}

        {visiveis.length === 0 && (
          <div style={{ textAlign: "center", color: T.inkSoft, padding: 20, fontSize: 14 }}>
            {linhas.length === 0 ? "Nenhuma NC registrada nesta obra." : "Nenhuma NC neste filtro."}
          </div>
        )}
      </div>
    </div>
  );
}

function Metrica({ valor, label }: { valor: string; label: string }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, color: T.navy }}>{valor}</div>
      <div style={{ fontSize: 11, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
    </div>
  );
}
