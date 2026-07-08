import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, Kpi, inputStyle } from "@/components/ui";
import { T, FONT_HEAD, corPorPct } from "@/theme";
import { db, type LocalInspecao } from "@/lib/db";
import {
  indexarRespostas,
  filtrarInspecoes,
  kpisDoConjunto,
  kpisInspecao,
  dataInspecao,
  type FiltroObra,
} from "@/lib/obraView";
import {
  montarDadosExport,
  exportarXLSX,
  gerarPNG,
  type CachesExport,
} from "@/lib/exportacoes";
import { GraficoObra, type ModoGrafico } from "@/features/obra/GraficoObra";
import { RelatorioObra } from "@/features/obra/RelatorioObra";
import { PainelNc } from "@/features/obra/PainelNc";
import { PiramideBird } from "@/features/seguranca/PiramideBird";
import { calcularBird } from "@/lib/piramideBird";
import { ROTULO_MODULO, ROTULO_TIPO } from "@/lib/catalogoDimensoes";
import type { Obra } from "@/types/db";

// ============================================================
// Tela da obra (RF07): filtros combináveis (checklist, inspetor,
// contratada, período, só com NC) que refletem em KPIs e lista.
// Gráficos e exportações entram no M7.
// ============================================================

export function TelaObra({
  obra,
  onBack,
  onVerInspecao,
}: {
  obra: Obra;
  onBack: () => void;
  onVerInspecao: (insp: LocalInspecao) => void;
}) {
  const inspecoesObra = useLiveQuery(
    () => db.inspecoes.where("obra_id").equals(obra.id).toArray(),
    [obra.id],
    [],
  );
  const respostas = useLiveQuery(() => db.respostas.toArray(), [], []);
  const checklists = useLiveQuery(() => db.checklists.toArray(), [], []);
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [], []);
  const itensAll = useLiveQuery(() => db.itens.toArray(), [], []);
  const eventos = useLiveQuery(() => db.eventos.toArray(), [], []);
  const evidencias = useLiveQuery(() => db.evidencias.toArray(), [], []);
  const transicoes = useLiveQuery(() => db.nc_transicoes.toArray(), [], []);
  const contratadas = useLiveQuery(() => db.contratadas.toArray(), [], []);
  const ocorrencias = useLiveQuery(() => db.ocorrencias.toArray(), [], []);

  const [fCk, setFCk] = useState("");
  const [fInsp, setFInsp] = useState("");
  const [fContratada, setFContratada] = useState("");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");
  const [fSoNC, setFSoNC] = useState(false);
  const [fArquivadas, setFArquivadas] = useState(false);
  const [fModulo, setFModulo] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [modoGraf, setModoGraf] = useState<ModoGrafico>("nc");
  const [relatorio, setRelatorio] = useState(false);
  const [painel, setPainel] = useState(false);
  const [pngPreview, setPngPreview] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const finalizadas = useMemo(
    () => inspecoesObra.filter((i) => i.status === "finalizada"),
    [inspecoesObra],
  );
  const idx = useMemo(() => indexarRespostas(respostas), [respostas]);
  const ckMap = useMemo(
    () => new Map(checklists.map((c) => [c.id, c])),
    [checklists],
  );
  const usrMap = useMemo(
    () => new Map(usuarios.map((u) => [u.id, u.nome])),
    [usuarios],
  );

  // Opções de filtro derivadas das inspeções da obra.
  const checklistsPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => i.checklist_id))],
    [finalizadas],
  );
  const inspetoresPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => i.inspetor_id))],
    [finalizadas],
  );
  const contratadasPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => i.contratada).filter(Boolean))] as string[],
    [finalizadas],
  );

  const nArquivadas = useMemo(() => finalizadas.filter((i) => i.arquivada).length, [finalizadas]);

  const filtro: FiltroObra = {
    checklistId: fCk || undefined,
    inspetorId: fInsp || undefined,
    contratada: fContratada || undefined,
    de: fDe || undefined,
    ate: fAte || undefined,
    soNC: fSoNC,
    arquivadas: fArquivadas ? "incluir" : "ocultar",
  };
  const filtradas = useMemo(
    () =>
      filtrarInspecoes(finalizadas, idx, filtro)
        .filter((i) => !fModulo || ckMap.get(i.checklist_id)?.modulo === fModulo)
        .filter((i) => !fTipo || ckMap.get(i.checklist_id)?.tipo === fTipo)
        .sort((a, b) => dataInspecao(b).localeCompare(dataInspecao(a))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finalizadas, idx, fCk, fInsp, fContratada, fDe, fAte, fSoNC, fArquivadas, fModulo, fTipo, ckMap],
  );
  const modulosPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => ckMap.get(i.checklist_id)?.modulo).filter(Boolean))] as string[],
    [finalizadas, ckMap],
  );
  const tiposPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => ckMap.get(i.checklist_id)?.tipo).filter(Boolean))] as string[],
    [finalizadas, ckMap],
  );
  const kpis = kpisDoConjunto(filtradas, idx);

  const itemMap = useMemo(() => new Map(itensAll.map((i) => [i.id, i])), [itensAll]);
  const eventoMap = useMemo(
    () => new Map(eventos.map((e) => [e.resposta_id, e])),
    [eventos],
  );
  const respComFoto = useMemo(
    () => new Set(evidencias.map((e) => e.resposta_id).filter(Boolean) as string[]),
    [evidencias],
  );
  const transicoesPorEvento = useMemo(() => {
    const m = new Map<string, typeof transicoes>();
    for (const t of transicoes) {
      const arr = m.get(t.evento_id) ?? [];
      arr.push(t);
      m.set(t.evento_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    return m;
  }, [transicoes]);
  const contratadaMap = useMemo(
    () => new Map(contratadas.map((c) => [c.id, c.nome])),
    [contratadas],
  );
  // Pirâmide de Bird do recorte (respeita checklist/inspetor/período; ST-01..14
  // consolidadas pela classificação nas respostas + ocorrências da obra/período).
  const kpisBird = useMemo(() => {
    const respClass = filtradas.flatMap((insp) => idx.get(insp.id) ?? []).filter((r) => r.classificacao_st);
    const ocorRecorte = ocorrencias.filter(
      (o) => o.obra_id === obra.id && (!fDe || o.data >= fDe) && (!fAte || o.data <= fAte),
    );
    return calcularBird(respClass, ocorRecorte);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, idx, ocorrencias, obra.id, fDe, fAte]);

  const filtroDesc = useMemo(
    () =>
      [
        fCk ? `Checklist ${ckMap.get(fCk)?.codigo ?? fCk}` : "Todos os checklists",
        fModulo ? `Módulo ${ROTULO_MODULO[fModulo as keyof typeof ROTULO_MODULO] ?? fModulo}` : null,
        fTipo ? `Tipo ${ROTULO_TIPO[fTipo as keyof typeof ROTULO_TIPO] ?? fTipo}` : null,
        fInsp ? `Inspetor ${usrMap.get(fInsp) ?? fInsp}` : null,
        fContratada ? `Contratada ${fContratada}` : null,
        fDe ? `de ${fDe.split("-").reverse().join("/")}` : null,
        fAte ? `até ${fAte.split("-").reverse().join("/")}` : null,
        fSoNC ? "somente com NC" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fCk, fModulo, fTipo, fInsp, fContratada, fDe, fAte, fSoNC, ckMap, usrMap],
  );

  const caches: CachesExport = {
    ckMap,
    usrMap,
    itemMap,
    eventoMap,
    respComFoto,
    obraNome: obra.nome,
    transicoesPorEvento,
    contratadaMap,
  };

  async function baixarExcel() {
    const dados = montarDadosExport(filtradas, idx, caches);
    await exportarXLSX(dados, obra.nome, filtroDesc, new Date().toLocaleString("pt-BR"));
  }
  async function compartilharPNG() {
    const dataUrl = await gerarPNG(svgRef.current);
    if (dataUrl) setPngPreview(dataUrl);
  }

  if (painel) {
    return (
      <PainelNc obra={obra} onVerInspecao={onVerInspecao} onVoltar={() => setPainel(false)} />
    );
  }

  if (relatorio) {
    return (
      <RelatorioObra
        obraNome={obra.nome}
        filtroDesc={filtroDesc}
        filtradas={filtradas}
        idx={idx}
        ckMap={ckMap}
        usrMap={usrMap}
        itemMap={itemMap}
        eventoMap={eventoMap}
        transicoesPorEvento={transicoesPorEvento}
        kpisBird={kpisBird}
        modo={modoGraf}
        onVoltar={() => setRelatorio(false)}
      />
    );
  }

  const nomeCk = (id: string) => ckMap.get(id)?.codigo ?? "—";
  const labelCk = (id: string) => {
    const c = ckMap.get(id);
    return c ? `${c.codigo} · ${c.nome}` : "Checklist";
  };

  return (
    <div>
      <Header
        titulo={obra.nome}
        sub={`${finalizadas.length} inspeções na obra`}
        onBack={onBack}
      />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 15,
              textTransform: "uppercase",
              color: T.inkSoft,
              marginBottom: 10,
            }}
          >
            Filtros
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={fCk} onChange={(e) => setFCk(e.target.value)} style={inputStyle}>
              <option value="">Todos os checklists</option>
              {checklistsPresentes.map((id) => (
                <option key={id} value={id}>
                  {nomeCk(id)}
                </option>
              ))}
            </select>
            <select value={fInsp} onChange={(e) => setFInsp(e.target.value)} style={inputStyle}>
              <option value="">Todos os inspetores</option>
              {inspetoresPresentes.map((id) => (
                <option key={id} value={id}>
                  {usrMap.get(id) ?? "—"}
                </option>
              ))}
            </select>
            {modulosPresentes.length > 1 && (
              <select value={fModulo} onChange={(e) => setFModulo(e.target.value)} style={inputStyle}>
                <option value="">Todos os módulos</option>
                {modulosPresentes.map((m) => (
                  <option key={m} value={m}>{ROTULO_MODULO[m as keyof typeof ROTULO_MODULO] ?? m}</option>
                ))}
              </select>
            )}
            {tiposPresentes.length > 1 && (
              <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={inputStyle}>
                <option value="">Todos os tipos</option>
                {tiposPresentes.map((t) => (
                  <option key={t} value={t}>{ROTULO_TIPO[t as keyof typeof ROTULO_TIPO] ?? t}</option>
                ))}
              </select>
            )}
            {contratadasPresentes.length > 0 && (
              <select
                value={fContratada}
                onChange={(e) => setFContratada(e.target.value)}
                style={{ ...inputStyle, gridColumn: "1 / -1" }}
              >
                <option value="">Todas as contratadas</option>
                {contratadasPresentes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={fDe}
              onChange={(e) => setFDe(e.target.value)}
              style={inputStyle}
              aria-label="Data inicial"
            />
            <input
              type="date"
              value={fAte}
              onChange={(e) => setFAte(e.target.value)}
              style={inputStyle}
              aria-label="Data final"
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              fontSize: 14.5,
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={fSoNC}
              onChange={(e) => setFSoNC(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Somente inspeções com NC
          </label>
          {nArquivadas > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 14.5, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={fArquivadas}
                onChange={(e) => setFArquivadas(e.target.checked)}
                style={{ width: 20, height: 20 }}
              />
              Mostrar arquivadas ({nArquivadas})
            </label>
          )}
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Kpi
            label="% Conform."
            valor={filtradas.length ? `${kpis.pct}%` : "—"}
            cor={filtradas.length ? corPorPct(kpis.pct) : T.inkSoft}
          />
          <Kpi label="Inspeções" valor={filtradas.length} cor={T.navy} />
          <Kpi label="Pontos inspec." valor={kpis.pontos} cor={T.navy} />
          <Kpi label="NCs" valor={kpis.nc} cor={kpis.nc ? T.red : T.green} />
        </div>

        <Botao variante="fantasma" onClick={() => setPainel(true)}>
          🚩 Painel de NCs — tratamento
        </Botao>

        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {(
              [
                ["nc", "NCs por checklist"],
                ["conf", "Conformidade"],
              ] as [ModoGrafico, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setModoGraf(v)}
                style={{
                  padding: "10px 4px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 14,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  border: modoGraf === v ? `2px solid ${T.yellow}` : `2px solid ${T.line}`,
                  background: modoGraf === v ? "#FFF4D6" : "#fff",
                  color: modoGraf === v ? T.yellowDark : T.inkSoft,
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <GraficoObra modo={modoGraf} filtradas={filtradas} idx={idx} ckMap={ckMap} svgRef={svgRef} />
        </Card>

        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>
            Pirâmide de Bird — segurança
          </div>
          <PiramideBird kpis={kpisBird} />
        </Card>

        <Card>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 15,
              textTransform: "uppercase",
              color: T.inkSoft,
              marginBottom: 10,
            }}
          >
            Compartilhar / Exportar
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Botao variante="fantasma" style={{ fontSize: 14, padding: "12px 6px" }} onClick={() => void baixarExcel()}>
              📊 Excel
            </Botao>
            <Botao variante="fantasma" style={{ fontSize: 14, padding: "12px 6px" }} onClick={() => setRelatorio(true)}>
              📄 Relatório
            </Botao>
            <Botao variante="fantasma" style={{ fontSize: 14, padding: "12px 6px" }} onClick={() => void compartilharPNG()}>
              🖼 Gráfico
            </Botao>
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8 }}>
            Exporta o filtro atual ({filtradas.length} inspeções): planilha (3 abas),
            relatório em PDF com fotos e imagem do gráfico.
          </div>
        </Card>

        {pngPreview && (
          <div
            onClick={() => setPngPreview(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.85)",
              zIndex: 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <img src={pngPreview} alt="Gráfico exportado" style={{ width: "100%", maxWidth: 640, borderRadius: 10 }} />
            <div style={{ color: "#fff", marginTop: 14, fontSize: 14.5, textAlign: "center", fontWeight: 600 }}>
              Toque e segure na imagem para salvar ou compartilhar.
              <br />
              <span style={{ opacity: 0.7, fontWeight: 400 }}>Toque fora da imagem para fechar.</span>
            </div>
          </div>
        )}

        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 16,
            textTransform: "uppercase",
            color: T.inkSoft,
          }}
        >
          Inspeções ({filtradas.length})
        </div>

        {filtradas.map((insp) => {
          const k = kpisInspecao(insp, idx);
          return (
            <button
              key={insp.id}
              onClick={() => onVerInspecao(insp)}
              style={{
                textAlign: "left",
                background: T.card,
                border: `1px solid ${T.line}`,
                borderRadius: 14,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                width: "100%",
              }}
            >
              <div
                style={{
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 20,
                  color: corPorPct(k.pct),
                  width: 58,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {k.pct}%
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>
                  {labelCk(insp.checklist_id)}
                </div>
                <div style={{ fontSize: 12.5, color: T.inkSoft }}>
                  {dataInspecao(insp).split("-").reverse().join("/")} ·{" "}
                  {usrMap.get(insp.inspetor_id) ?? "—"} · {k.nc} NC
                  {insp.arquivada && (
                    <span style={{ color: T.gray, fontWeight: 700 }}> · arquivada</span>
                  )}
                  {insp.sync !== "sincronizado" && (
                    <span style={{ color: T.yellowDark, fontWeight: 700 }}> · pendente</span>
                  )}
                </div>
              </div>
              <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
            </button>
          );
        })}

        {filtradas.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: T.inkSoft,
              padding: 20,
              fontSize: 14,
            }}
          >
            Nenhuma inspeção corresponde ao filtro.
          </div>
        )}
      </div>
    </div>
  );
}
