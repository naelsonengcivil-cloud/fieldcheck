import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Header } from "@/components/ui";
import { T, FONT_HEAD, FONT_BODY, corPorPct } from "@/theme";
import { db, type LocalInspecao } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { dataInspecao, kpisDoConjunto } from "@/lib/obraView";
import { calcularKpisNc } from "@/lib/ncKpis";
import { calcularBird } from "@/lib/piramideBird";
import { PiramideBird } from "@/features/seguranca/PiramideBird";
import { CabecalhoRelatorio, RodapeFieldCheck } from "@/features/relatorio/CabecalhoRelatorio";
import { consolidarPorObra, distribuirPorCriticidade } from "@/lib/relatorioGeral";
import { ROTULO_CRIT, corCriticidade, vencida } from "@/lib/criticidade";
import { ROTULO_STATUS } from "@/lib/ncEstado";
import { exportarConsolidadoXLSX } from "@/lib/exportacoes";
import type { NcTransicao } from "@/types/db";

// ============================================================
// Relatório Geral da empresa (Marco J · f/g) — gestor/admin, recorte
// = empresa inteira + período. Capa + sumário executivo + distribuição de
// NCs por criticidade + pirâmide de Bird + tabela por obra + anexo de NCs
// críticas/vencidas. Lê do cache Dexie (offline). Print → PDF; XLSX de dados.
// ============================================================

const brDMA = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function RelatorioGeral({ onVoltar }: { onVoltar: () => void }) {
  const { empresa } = useAuth();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [imprimindo, setImprimindo] = useState(false);

  const inspAll = useLiveQuery(() => db.inspecoes.toArray(), [], []);
  const respAll = useLiveQuery(() => db.respostas.toArray(), [], []);
  const evAll = useLiveQuery(() => db.eventos.toArray(), [], []);
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);
  const checklists = useLiveQuery(() => db.checklists.toArray(), [], []);
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [], []);
  const transicoes = useLiveQuery(() => db.nc_transicoes.toArray(), [], []);
  const ocorrencias = useLiveQuery(() => db.ocorrencias.toArray(), [], []);

  const obraNome = useMemo(() => new Map(obras.map((o) => [o.id, o.nome])), [obras]);
  const ckMap = useMemo(() => new Map(checklists.map((c) => [c.id, c])), [checklists]);
  const usrMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nome])), [usuarios]);

  // Recorte: finalizadas, não arquivadas, dentro do período.
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

  const respIdsFiltradas = useMemo(() => {
    const s = new Set<string>();
    for (const r of respAll) if (idsFiltradas.has(r.inspecao_id)) s.add(r.id);
    return s;
  }, [respAll, idsFiltradas]);

  const eventoPorResposta = useMemo(
    () => new Map(evAll.filter((e) => respIdsFiltradas.has(e.resposta_id)).map((e) => [e.resposta_id, e])),
    [evAll, respIdsFiltradas],
  );
  const eventosRecorte = useMemo(() => [...eventoPorResposta.values()], [eventoPorResposta]);

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

  // KPIs consolidados.
  const tot = useMemo(() => kpisDoConjunto(filtradas, idx), [filtradas, idx]);
  const kpisNc = useMemo(() => {
    const abertura = new Map<string, string>();
    for (const insp of filtradas) {
      for (const r of idx.get(insp.id) ?? []) {
        const ev = eventoPorResposta.get(r.id);
        if (ev && insp.finalizada_em) abertura.set(ev.id, insp.finalizada_em);
      }
    }
    return calcularKpisNc(eventosRecorte, transPorEvento, abertura);
  }, [filtradas, idx, eventoPorResposta, eventosRecorte, transPorEvento]);

  const porObra = useMemo(
    () => consolidarPorObra(filtradas, idx, eventoPorResposta, (id) => obraNome.get(id) ?? "Obra"),
    [filtradas, idx, eventoPorResposta, obraNome],
  );
  const distrib = useMemo(() => distribuirPorCriticidade(eventosRecorte), [eventosRecorte]);

  const kpisBird = useMemo(() => {
    const respClass = filtradas.flatMap((i) => idx.get(i.id) ?? []).filter((r) => r.classificacao_st);
    const ocor = ocorrencias.filter((o) => (!de || o.data >= de) && (!ate || o.data <= ate));
    return calcularBird(respClass, ocor);
  }, [filtradas, idx, ocorrencias, de, ate]);

  const inspetores = useMemo(
    () => [...new Set(filtradas.map((i) => usrMap.get(i.inspetor_id)).filter(Boolean) as string[])],
    [filtradas, usrMap],
  );

  // NCs críticas ou vencidas (anexo), da mais recente à mais antiga.
  const anexo = useMemo(() => {
    const respMap = new Map(respAll.map((r) => [r.id, r]));
    const inspMap = new Map(filtradas.map((i) => [i.id, i]));
    return eventosRecorte
      .filter((ev) => ev.criticidade === "critica" || vencida(ev.prazo, ev.status))
      .map((ev) => {
        const r = respMap.get(ev.resposta_id);
        const insp = r ? inspMap.get(r.inspecao_id) : undefined;
        return { ev, r, insp };
      })
      .filter((x): x is { ev: (typeof eventosRecorte)[number]; r: NonNullable<typeof x.r>; insp: LocalInspecao } => Boolean(x.r && x.insp))
      .sort((a, b) => (b.insp.finalizada_em ?? "").localeCompare(a.insp.finalizada_em ?? ""));
  }, [eventosRecorte, respAll, filtradas]);

  // Fotos do anexo (blob local → objectURL; url servidor → signed URL).
  const [fotos, setFotos] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let vivo = true;
    const criados: string[] = [];
    (async () => {
      const ids = anexo.map((x) => x.r.id);
      const map: Record<string, string[]> = {};
      const add = (rid: string, url: string) => ((map[rid] ??= []).push(url));
      if (ids.length) {
        const evs = await db.evidencias.where("resposta_id").anyOf(ids).toArray();
        for (const ev of evs) {
          if (!ev.resposta_id) continue;
          if (ev.blob) {
            const u = URL.createObjectURL(ev.blob);
            criados.push(u);
            add(ev.resposta_id, u);
          } else if (ev.url) {
            const { data } = await supabase.storage.from("evidencias").createSignedUrl(ev.url, 3600);
            if (data?.signedUrl) add(ev.resposta_id, data.signedUrl);
          }
        }
      }
      if (vivo) setFotos(map);
    })();
    return () => {
      vivo = false;
      criados.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [anexo]);

  const periodoTxt = de || ate ? `${de ? brDMA(de) : "início"} — ${ate ? brDMA(ate) : "hoje"}` : "Todo o período";
  const geradoEm = new Date().toLocaleString("pt-BR");

  const itens = useLiveQuery(() => db.itens.toArray(), [], []);
  const itemMap = useMemo(() => new Map(itens.map((i) => [i.id, i.texto])), [itens]);
  const itemTexto = (id: string) => itemMap.get(id) ?? "";

  async function exportarXlsx() {
    await exportarConsolidadoXLSX(
      { empresaNome: empresa?.nome ?? "FieldCheck", periodo: periodoTxt, geradoEm },
      porObra,
      distrib,
      { total: tot.nInspecoes, pontos: tot.pontos, pct: tot.pct, ncTotal: kpisNc.total, ncAbertas: kpisNc.abertas, tempoMedio: kpisNc.tempoMedioResolucaoDias },
    );
  }

  return (
    <div style={{ padding: "20px 22px 56px", fontFamily: FONT_BODY, color: "#111", background: "#fff", minHeight: "100vh" }}>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <Header titulo="Relatório Geral" sub={empresa?.nome ?? ""} onBack={onVoltar} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12 }}>
          <label style={{ fontSize: 13, color: T.inkSoft }}>
            De{" "}
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campoData} />
          </label>
          <label style={{ fontSize: 13, color: T.inkSoft }}>
            Até{" "}
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campoData} />
          </label>
          <Botao
            style={{ width: "auto" }}
            disabled={imprimindo}
            onClick={() => {
              setImprimindo(true);
              try {
                window.print();
              } catch {
                /* sem impressão */
              }
              setImprimindo(false);
            }}
          >
            Imprimir / Salvar PDF
          </Botao>
          <Botao variante="fantasma" style={{ width: "auto" }} onClick={() => void exportarXlsx()}>
            Exportar XLSX
          </Botao>
        </div>
      </div>

      <CabecalhoRelatorio
        empresaNome={empresa?.nome ?? "FieldCheck"}
        logoUrl={empresa?.logo_url}
        titulo="Relatório Geral de Inspeções"
        subtitulo={`Período: ${periodoTxt}`}
        inspetores={inspetores}
        metaLinha={`Obras: ${porObra.length} · Inspeções: ${tot.nInspecoes} · Pontos: ${tot.pontos} · Gerado em ${geradoEm}`}
      />

      {/* Sumário executivo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <Bloco titulo="Inspeções" valor={String(tot.nInspecoes)} />
        <Bloco titulo="Pontos inspecionados" valor={String(tot.pontos)} />
        <Bloco titulo="% Conformidade" valor={`${tot.pct}%`} cor={corPorPct(tot.pct)} />
        <Bloco titulo="NCs (abertas)" valor={`${kpisNc.total} (${kpisNc.abertas})`} cor={kpisNc.abertas ? T.red : T.green} />
        <Bloco titulo="Vencidas" valor={String(distrib.vencidas)} cor={distrib.vencidas ? T.red : T.green} />
        <Bloco titulo="Encerradas" valor={String(kpisNc.encerradas)} cor={T.green} />
        <Bloco titulo="Tempo médio de fechamento" valor={kpisNc.tempoMedioResolucaoDias === null ? "—" : `${kpisNc.tempoMedioResolucaoDias} d`} />
        <Bloco titulo="Reprovação" valor={kpisNc.taxaReprovacao === null ? "—" : `${Math.round(kpisNc.taxaReprovacao * 100)}%`} />
      </div>

      {/* NCs por criticidade */}
      <SecaoTitulo>NCs por criticidade</SecaoTitulo>
      <table style={tabela}>
        <thead>
          <tr>
            {["Criticidade", "Abertas", "Encerradas", "Total"].map((h) => (
              <th key={h} style={thc}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {distrib.linhas.map((l) => {
            const cor = corCriticidade(l.criticidade);
            return (
              <tr key={l.criticidade}>
                <td style={td}>
                  <span style={{ fontWeight: 700, color: cor.fg, background: cor.bg, padding: "2px 8px", borderRadius: 999 }}>
                    {ROTULO_CRIT[l.criticidade]}
                  </span>
                </td>
                <td style={{ ...td, fontWeight: 700, color: l.abertas ? T.red : "#333" }}>{l.abertas}</td>
                <td style={td}>{l.encerradas}</td>
                <td style={td}>{l.total}</td>
              </tr>
            );
          })}
          {distrib.semCriticidade > 0 && (
            <tr>
              <td style={{ ...td, color: T.inkSoft, fontStyle: "italic" }}>sem criticidade</td>
              <td style={td} colSpan={3}>{distrib.semCriticidade}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pirâmide de Bird */}
      <div style={{ breakInside: "avoid", margin: "8px 0 16px" }}>
        <SecaoTitulo>Pirâmide de Bird do período</SecaoTitulo>
        <div style={{ maxWidth: 460, margin: "0 auto" }}>
          <PiramideBird kpis={kpisBird} />
        </div>
      </div>

      {/* Tabela por obra */}
      <SecaoTitulo>Consolidado por obra</SecaoTitulo>
      <table style={tabela}>
        <thead>
          <tr>
            {["Obra", "Insp.", "Pontos", "Conf.", "NC", "% Conf.", "NC abertas", "NC encerradas"].map((h) => (
              <th key={h} style={thc}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {porObra.map((l) => (
            <tr key={l.obraId}>
              <td style={td}>{l.obra}</td>
              <td style={td}>{l.inspecoes}</td>
              <td style={td}>{l.pontos}</td>
              <td style={td}>{l.conformes}</td>
              <td style={{ ...td, color: T.red, fontWeight: 700 }}>{l.naoConformes}</td>
              <td style={{ ...td, fontWeight: 700, color: corPorPct(l.pct) }}>{l.pct}%</td>
              <td style={{ ...td, fontWeight: 700, color: l.ncsAbertas ? T.red : "#333" }}>{l.ncsAbertas}</td>
              <td style={td}>{l.ncsEncerradas}</td>
            </tr>
          ))}
          {porObra.length === 0 && (
            <tr>
              <td style={{ ...td, textAlign: "center", color: T.inkSoft }} colSpan={8}>
                Nenhuma inspeção no período selecionado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Anexo — NCs críticas e vencidas */}
      {anexo.length > 0 && (
        <>
          <SecaoTitulo cor={T.red}>Anexo — NCs críticas e vencidas ({anexo.length})</SecaoTitulo>
          {anexo.map(({ ev, r, insp }) => (
            <div key={ev.id} style={{ display: "flex", gap: 12, borderTop: "1px solid #ccc", padding: "8px 0", breakInside: "avoid" }}>
              {(fotos[r.id] ?? []).map((u, k) => (
                <img key={k} src={u} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 6 }} />
              ))}
              <div style={{ fontSize: 12.5 }}>
                <b>
                  {obraNome.get(ev.obra_id) ?? "Obra"} · {ckMap.get(insp.checklist_id)?.codigo} · {itemTexto(r.item_id)}
                </b>
                <div>{r.observacao}</div>
                {r.classificacao_st === "na" && r.classificacao_st_justificativa && (
                  <div style={{ color: "#555", fontStyle: "italic" }}>
                    N/A (fora da pirâmide) — {r.classificacao_st_justificativa}
                  </div>
                )}
                <div style={{ color: "#555", marginTop: 2 }}>
                  {ev.criticidade && (
                    <b style={{ color: corCriticidade(ev.criticidade).fg }}>{ROTULO_CRIT[ev.criticidade].toUpperCase()}</b>
                  )}
                  {` · origem ${brDMA(dataInspecao(insp))}`}
                  {ev.prazo && ` · prazo ${brDMA(ev.prazo)}`}
                  {vencida(ev.prazo, ev.status) && <b style={{ color: T.red }}> · VENCIDA</b>}
                  {` · ${ROTULO_STATUS[ev.status]}`}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <RodapeFieldCheck />
    </div>
  );
}

function Bloco({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "8px 10px", breakInside: "avoid" }}>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: cor ?? T.navy }}>{valor}</div>
      <div style={{ fontSize: 10.5, color: "#666", textTransform: "uppercase", letterSpacing: 0.3 }}>{titulo}</div>
    </div>
  );
}

function SecaoTitulo({ children, cor }: { children: React.ReactNode; cor?: string }) {
  return (
    <div style={{ fontFamily: FONT_HEAD, fontSize: 17, fontWeight: 700, textTransform: "uppercase", margin: "12px 0 8px", color: cor ?? "#16181B" }}>
      {children}
    </div>
  );
}

const campoData = { border: `2px solid ${T.line}`, borderRadius: 8, padding: "6px 8px", fontSize: 13 } as const;
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 16 } as const;
const thc = { border: "1px solid #999", padding: "6px 8px", background: "#EFEFEA", textAlign: "left" } as const;
const td = { border: "1px solid #bbb", padding: "5px 8px" } as const;
