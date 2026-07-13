import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Header, Kpi } from "@/components/ui";
import { T, FONT_HEAD, corPorPct } from "@/theme";
import { db } from "@/lib/db";
import { dataInspecao, kpisDoConjunto } from "@/lib/obraView";
import { calcularKpisNc } from "@/lib/ncKpis";
import { calcularBird } from "@/lib/piramideBird";
import { PiramideBird } from "@/features/seguranca/PiramideBird";
import { consolidarPorObra, distribuirPorCriticidade } from "@/lib/relatorioGeral";
import { rankingContratadas } from "@/lib/reincidencia";
import { ROTULO_CRIT, corCriticidade } from "@/lib/criticidade";
import type { NcTransicao } from "@/types/db";

// ============================================================
// Dashboard executivo in-app (RF13) — gestor/admin. Visão consolidada da
// empresa (sem PDF): KPIs + NCs por criticidade + Pirâmide de Bird + por
// obra + ranking por contratada (Marco B‑e). Lê do cache Dexie (offline),
// com filtro de período. Complementa o Relatório Geral (que é o PDF).
// ============================================================

const brDMA = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function TelaDashboard({ onVoltar }: { onVoltar: () => void }) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const inspAll = useLiveQuery(() => db.inspecoes.toArray(), [], []);
  const respAll = useLiveQuery(() => db.respostas.toArray(), [], []);
  const evAll = useLiveQuery(() => db.eventos.toArray(), [], []);
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);
  const contratadas = useLiveQuery(() => db.contratadas.toArray(), [], []);
  const transicoes = useLiveQuery(() => db.nc_transicoes.toArray(), [], []);
  const ocorrencias = useLiveQuery(() => db.ocorrencias.toArray(), [], []);

  const obraNome = useMemo(() => new Map(obras.map((o) => [o.id, o.nome])), [obras]);
  const contratadaNome = useMemo(() => new Map(contratadas.map((c) => [c.id, c.nome])), [contratadas]);

  const filtradas = useMemo(
    () =>
      inspAll.filter((i) => {
        if (i.status !== "finalizada" || i.arquivada) return false;
        const d = dataInspecao(i);
        if (de && d < de) return false;
        if (ate && d > ate) return false;
        return true;
      }),
    [inspAll, de, ate],
  );
  const idsFiltradas = useMemo(() => new Set(filtradas.map((i) => i.id)), [filtradas]);

  const idx = useMemo(() => {
    const m = new Map<string, typeof respAll>();
    for (const r of respAll) {
      if (!idsFiltradas.has(r.inspecao_id)) continue;
      const arr = m.get(r.inspecao_id) ?? [];
      arr.push(r);
      m.set(r.inspecao_id, arr);
    }
    return m;
  }, [respAll, idsFiltradas]);

  const respIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of respAll) if (idsFiltradas.has(r.inspecao_id)) s.add(r.id);
    return s;
  }, [respAll, idsFiltradas]);

  const eventoPorResposta = useMemo(
    () => new Map(evAll.filter((e) => respIds.has(e.resposta_id)).map((e) => [e.resposta_id, e])),
    [evAll, respIds],
  );
  const eventos = useMemo(() => [...eventoPorResposta.values()], [eventoPorResposta]);
  const itemPorResposta = useMemo(
    () => new Map(respAll.filter((r) => respIds.has(r.id)).map((r) => [r.id, r.item_id])),
    [respAll, respIds],
  );

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

  const abertura = useMemo(() => {
    const m = new Map<string, string>();
    for (const insp of filtradas) {
      for (const r of idx.get(insp.id) ?? []) {
        const ev = eventoPorResposta.get(r.id);
        if (ev && insp.finalizada_em) m.set(ev.id, insp.finalizada_em);
      }
    }
    return m;
  }, [filtradas, idx, eventoPorResposta]);

  const tot = useMemo(() => kpisDoConjunto(filtradas, idx), [filtradas, idx]);
  const kpisNc = useMemo(() => calcularKpisNc(eventos, transPorEvento, abertura), [eventos, transPorEvento, abertura]);
  const distrib = useMemo(() => distribuirPorCriticidade(eventos), [eventos]);
  const porObra = useMemo(
    () => consolidarPorObra(filtradas, idx, eventoPorResposta, (id) => obraNome.get(id) ?? "Obra"),
    [filtradas, idx, eventoPorResposta, obraNome],
  );
  const kpisBird = useMemo(() => {
    const respClass = filtradas.flatMap((i) => idx.get(i.id) ?? []).filter((r) => r.classificacao_st);
    const ocor = ocorrencias.filter((o) => (!de || o.data >= de) && (!ate || o.data <= ate));
    return calcularBird(respClass, ocor);
  }, [filtradas, idx, ocorrencias, de, ate]);
  const ranking = useMemo(
    () => rankingContratadas(eventos, itemPorResposta, transPorEvento, abertura, (id) => contratadaNome.get(id) ?? "Contratada"),
    [eventos, itemPorResposta, transPorEvento, abertura, contratadaNome],
  );

  const maxCrit = Math.max(1, ...distrib.linhas.map((l) => l.total));

  return (
    <div>
      <Header titulo="Dashboard" sub="Visão executiva da empresa" onBack={onVoltar} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* período */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5, color: T.inkSoft }}>
            De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campoData} />
          </label>
          <label style={{ fontSize: 12.5, color: T.inkSoft }}>
            Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campoData} />
          </label>
          {(de || ate) && (
            <button onClick={() => { setDe(""); setAte(""); }} style={{ background: "none", border: "none", color: T.navy, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
              limpar
            </button>
          )}
        </div>

        {/* KPIs */}
        <div className="fc-kpis">
          <Kpi label="Inspeções" valor={tot.nInspecoes} cor={T.navy} />
          <Kpi label="Pontos inspec." valor={tot.pontos} cor={T.navy} />
          <Kpi label="% Conformidade" valor={`${tot.pct}%`} cor={corPorPct(tot.pct)} />
          <Kpi label="NCs (abertas)" valor={`${kpisNc.total} (${kpisNc.abertas})`} cor={kpisNc.abertas ? T.red : T.green} />
          <Kpi label="Vencidas" valor={distrib.vencidas} cor={distrib.vencidas ? T.red : T.green} />
          <Kpi label="Tempo médio" valor={kpisNc.tempoMedioResolucaoDias == null ? "—" : `${kpisNc.tempoMedioResolucaoDias} d`} cor={T.navy} />
        </div>

        <div className="fc-cols-2">
        {/* NCs por criticidade */}
        <Card>
          <Titulo>NCs por criticidade</Titulo>
          {distrib.linhas.map((l) => {
            const cor = corCriticidade(l.criticidade);
            return (
              <div key={l.criticidade} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                <span style={{ width: 66, fontSize: 12.5, fontWeight: 700, color: cor.fg }}>{ROTULO_CRIT[l.criticidade]}</span>
                <div style={{ flex: 1, background: T.line, borderRadius: 6, height: 16, overflow: "hidden" }}>
                  <div style={{ width: `${(l.total / maxCrit) * 100}%`, height: "100%", background: cor.fg, opacity: 0.85 }} />
                </div>
                <span style={{ width: 82, textAlign: "right", fontSize: 12, color: T.inkSoft }}>
                  {l.total} ({l.abertas} ab.)
                </span>
              </div>
            );
          })}
          {distrib.semCriticidade > 0 && (
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 4, fontStyle: "italic" }}>
              {distrib.semCriticidade} sem criticidade definida
            </div>
          )}
        </Card>

        {/* Pirâmide de Bird */}
        <Card>
          <Titulo>Pirâmide de Bird do período</Titulo>
          <div style={{ maxWidth: 420, margin: "0 auto" }}>
            <PiramideBird kpis={kpisBird} />
          </div>
        </Card>
        </div>

        <div className="fc-cols-2">
        {/* Por contratada (B‑e) */}
        <Card>
          <Titulo>Por contratada — reincidência e SLA</Titulo>
          {ranking.length === 0 ? (
            <Vazio texto="Sem NCs vinculadas a contratadas no período." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>{["Contratada", "NC", "Abertas", "Vencidas", "Reincid.", "Tempo méd."].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.contratadaId}>
                      <td style={td}>{r.contratada}</td>
                      <td style={tdC}>{r.ncs}</td>
                      <td style={{ ...tdC, color: r.abertas ? T.red : T.ink, fontWeight: 700 }}>{r.abertas}</td>
                      <td style={{ ...tdC, color: r.vencidas ? T.red : T.ink, fontWeight: 700 }}>{r.vencidas}</td>
                      <td style={{ ...tdC, color: r.reincidencias ? "#E07B39" : T.ink, fontWeight: r.reincidencias ? 700 : 400 }}>{r.reincidencias}</td>
                      <td style={tdC}>{r.tempoMedioDias == null ? "—" : `${r.tempoMedioDias} d`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Por obra */}
        <Card>
          <Titulo>Por obra</Titulo>
          {porObra.length === 0 ? (
            <Vazio texto="Nenhuma inspeção no período." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>{["Obra", "Insp.", "% Conf.", "NC abertas"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {porObra.map((l) => (
                    <tr key={l.obraId}>
                      <td style={td}>{l.obra}</td>
                      <td style={tdC}>{l.inspecoes}</td>
                      <td style={{ ...tdC, fontWeight: 700, color: corPorPct(l.pct) }}>{l.pct}%</td>
                      <td style={{ ...tdC, color: l.ncsAbertas ? T.red : T.ink, fontWeight: 700 }}>{l.ncsAbertas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </div>

        <div style={{ fontSize: 11.5, color: T.inkSoft, textAlign: "center", lineHeight: 1.5 }}>
          Período: {de || ate ? `${de ? brDMA(de) : "início"} — ${ate ? brDMA(ate) : "hoje"}` : "todo o histórico"} ·
          para exportar em PDF/XLSX, use o Relatório Geral.
        </div>
      </div>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>
      {children}
    </div>
  );
}
function Vazio({ texto }: { texto: string }) {
  return <div style={{ fontSize: 13, color: T.inkSoft, padding: "6px 0" }}>{texto}</div>;
}

const campoData = { border: `2px solid ${T.line}`, borderRadius: 8, padding: "6px 8px", fontSize: 13 } as const;
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 12.5 } as const;
const th = { textAlign: "left", padding: "5px 8px", background: "#EFEFEA", color: T.inkSoft, fontFamily: FONT_HEAD, textTransform: "uppercase", fontSize: 11, letterSpacing: 0.3, borderBottom: `1px solid ${T.line}` } as const;
const td = { padding: "6px 8px", borderBottom: `1px solid ${T.line}` } as const;
const tdC = { ...td, textAlign: "center" } as const;
