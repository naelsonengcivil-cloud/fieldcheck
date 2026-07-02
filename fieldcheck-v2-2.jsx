import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";

// ============================================================
// FieldCheck v2 — inspeções de campo por obra
// Novidades: obras na home · tela da obra com filtros ·
// gráfico dinâmico do filtro · exportação XLSX / PDF / PNG
// ============================================================

const T = {
  bg: "#F4F4F1", card: "#FFFFFF", ink: "#16181B", inkSoft: "#5A5F66",
  line: "#E2E2DD", yellow: "#F5A800", yellowDark: "#8A5F00",
  green: "#1F8A4C", greenBg: "#E4F3EA", red: "#C6362B", redBg: "#FBE9E7",
  gray: "#6B7178", grayBg: "#EDEEF0", navy: "#1C2733",
};
const FONT_HEAD = "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif";
const FONT_BODY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const CATALOGO = [
  { cod: "ST-01", area: "Segurança do Trabalho", nome: "NR-01 · APR / PT / DDS", itens: [
    "APR disponível na frente de serviço","APR assinada por todos os executantes","APR compatível com a atividade real",
    "DDS realizado e registrado","Permissão de Trabalho emitida","Equipe treinada para a atividade",
    "Trabalhadores formalmente autorizados","Ferramentas inspecionadas","Riscos comunicados à equipe","Medidas de controle implantadas"]},
  { cod: "ST-02", area: "Segurança do Trabalho", nome: "NR-06 · EPI", itens: [
    "Capacete com jugular","Óculos de proteção","Botina de segurança","Vestimenta adequada","Luva correta para a tarefa",
    "Protetor auricular","Protetor solar em uso","Cinturão tipo paraquedista","Estado geral dos EPIs","CA válido","Registro de entrega de EPI"]},
  { cod: "ST-03", area: "Segurança do Trabalho", nome: "NR-10 · Elétrica", itens: [
    "Painéis e circuitos identificados","Bloqueio e etiquetagem (LOTO)","Ausência de tensão verificada","Aterramento temporário instalado",
    "Ferramentas isoladas","Extintor adequado disponível","Área sinalizada e delimitada","Profissionais autorizados",
    "Vestimenta antichama (arco)","Diagramas unifilares disponíveis"]},
  { cod: "ST-08", area: "Segurança do Trabalho", nome: "NR-35 · Trabalho em Altura", itens: [
    "PT específica para altura","Linha de vida certificada","Ancoragem adequada","Cinturão, talabarte e absorvedor",
    "Capacete com jugular","Ferramentas amarradas","Área inferior isolada","Treinamento NR-35 válido",
    "Plano de resgate em altura","Condições climáticas avaliadas"]},
  { cod: "ST-10", area: "Segurança do Trabalho", nome: "Ordem e Limpeza", itens: [
    "Material organizado por frente","Sucata segregada","Madeiras sem pregos expostos","Cabos e mangueiras organizados",
    "Entulho removido","Drenagem desobstruída","Passagens livres","Empilhamento seguro"]},
  { cod: "MA-01", area: "Meio Ambiente", nome: "Gestão de Resíduos", itens: [
    "Separação por classe","Coletores identificados","Bombonas íntegras","Área de resíduos Classe I adequada","MTR emitido","Destinação licenciada"]},
  { cod: "EQ-01", area: "Equipamentos", nome: "Máquinas e Equipamentos", itens: [
    "Checklist diário pré-uso","Ausência de vazamentos","Manutenção preventiva em dia","Alarme de ré funcional",
    "Extintor embarcado","Cinto de segurança em uso","Ferramentas elétricas íntegras"]},
  { cod: "QA-02", area: "Qualidade", nome: "Execução e Controle", itens: [
    "Projeto na última revisão","Execução conforme projeto","Controle dimensional realizado","Ensaios realizados (PIT/ITP)",
    "Instrumentos calibrados","RNCs tratadas","RDO atualizado"]},
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const hojeBR = () => new Date().toLocaleDateString("pt-BR");
const hojeISO = () => new Date().toISOString().slice(0, 10);
const brParaISO = (br) => { const p = (br || "").split("/"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : ""; };
const pctInsp = (d) => { const c = d.conf ?? d.respostas.filter(r=>r.resp==="C").length, n = d.nc ?? d.respostas.filter(r=>r.resp==="NC").length; return c+n>0 ? Math.round(c/(c+n)*100) : 100; };

async function comprimirFoto(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 480, esc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", 0.5));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function entregarArquivo(blob, nome) {
  try {
    const file = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nome });
      return;
    }
  } catch (e) { /* usuário cancelou ou não suportado → download */ }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------- componentes base ----------------
const Stripe = () => (
  <div style={{ height: 8, background: `repeating-linear-gradient(-45deg, ${T.yellow} 0 14px, ${T.ink} 14px 28px)` }} />
);
const Header = ({ titulo, sub, onBack, right }) => (
  <div style={{ background: T.navy, color: "#fff" }} className="no-print">
    <Stripe />
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
      {onBack && <button onClick={onBack} aria-label="Voltar" style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", width: 40, height: 40, borderRadius: 10, fontSize: 20, cursor: "pointer", flexShrink: 0 }}>←</button>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 22, lineHeight: 1.05, letterSpacing: 0.3, textTransform: "uppercase" }}>{titulo}</div>
        {sub && <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  </div>
);
const Botao = ({ children, onClick, variante = "primario", style = {}, disabled }) => {
  const base = {
    primario: { background: T.yellow, color: T.ink, border: "none" },
    fantasma: { background: "#fff", color: T.ink, border: `2px solid ${T.line}` },
    escuro: { background: T.navy, color: "#fff", border: "none" },
  }[variante];
  return <button onClick={onClick} disabled={disabled} style={{ ...base, opacity: disabled ? 0.45 : 1, fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, fontSize: 16, padding: "14px 18px", borderRadius: 12, cursor: disabled ? "default" : "pointer", width: "100%", ...style }}>{children}</button>;
};
const Card = ({ children, style = {} }) => (
  <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, ...style }}>{children}</div>
);
const Kpi = ({ label, valor, cor }) => (
  <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "13px 6px", textAlign: "center" }}>
    <div style={{ fontFamily: FONT_HEAD, fontSize: 27, fontWeight: 700, color: cor }}>{valor}</div>
    <div style={{ fontSize: 11, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
  </div>
);
const sel = { border: `2px solid ${T.line}`, borderRadius: 10, padding: "10px 8px", fontSize: 14, background: "#fff", width: "100%", boxSizing: "border-box" };

// ---------------- gráfico SVG (exportável) ----------------
function GraficoObra({ modo, inspFiltradas, svgRef }) {
  const W = 640, H = 320, PADL = 44, PADB = 58, PADT = 34;
  let barras = [];
  if (modo === "nc") {
    const porCk = {};
    inspFiltradas.forEach(d => { porCk[d.cod] = (porCk[d.cod] || 0) + d.respostas.filter(r => r.resp === "NC").length; });
    barras = Object.entries(porCk).map(([k, v]) => ({ k, v, cor: T.red }));
  } else {
    barras = [...inspFiltradas].sort((a, b) => (a.iso || brParaISO(a.data)).localeCompare(b.iso || brParaISO(b.data)))
      .map(d => ({ k: `${d.cod} ${d.data.slice(0, 5)}`, v: pctInsp(d), cor: pctInsp(d) >= 95 ? T.green : pctInsp(d) >= 80 ? T.yellow : T.red }));
  }
  const maxV = modo === "nc" ? Math.max(1, ...barras.map(b => b.v)) : 100;
  const bw = barras.length ? Math.min(70, (W - PADL - 16) / barras.length - 10) : 0;
  const titulo = modo === "nc" ? "Não conformidades por checklist" : "% de conformidade por inspeção";
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: "#fff", borderRadius: 10 }}>
      <text x={W / 2} y={20} textAnchor="middle" fontFamily={FONT_HEAD} fontWeight="700" fontSize="17" fill={T.ink} style={{ textTransform: "uppercase" }}>{titulo}</text>
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = PADT + (H - PADT - PADB) * (1 - f);
        return (<g key={f}>
          <line x1={PADL} x2={W - 10} y1={y} y2={y} stroke={T.line} strokeWidth="1" />
          <text x={PADL - 6} y={y + 4} textAnchor="end" fontSize="11" fill={T.inkSoft} fontFamily={FONT_BODY}>{Math.round(maxV * f)}{modo === "nc" ? "" : "%"}</text>
        </g>);
      })}
      {barras.map((b, i) => {
        const x = PADL + 8 + i * ((W - PADL - 16) / Math.max(1, barras.length)) + (((W - PADL - 16) / Math.max(1, barras.length)) - bw) / 2;
        const h = (H - PADT - PADB) * (b.v / maxV);
        const y = H - PADB - h;
        return (<g key={i}>
          <rect x={x} y={y} width={bw} height={Math.max(2, h)} rx="4" fill={b.cor} />
          <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="12" fontWeight="700" fill={T.ink} fontFamily={FONT_BODY}>{b.v}{modo === "nc" ? "" : "%"}</text>
          <text x={x + bw / 2} y={H - PADB + 14} textAnchor="middle" fontSize="10.5" fill={T.inkSoft} fontFamily={FONT_BODY}
            transform={barras.length > 6 ? `rotate(-35 ${x + bw / 2} ${H - PADB + 14})` : undefined}>{b.k}</text>
        </g>);
      })}
      {barras.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="14" fill={T.inkSoft} fontFamily={FONT_BODY}>Sem dados para o filtro selecionado</text>}
    </svg>
  );
}

// ---------------- exportações ----------------
function exportarXLSX(obra, inspFiltradas, filtroDesc) {
  const wsInsp = XLSX.utils.json_to_sheet(inspFiltradas.map(d => ({
    Data: d.data, Checklist: d.cod, Nome: d.nome, "Área": d.area, Obra: d.frente, Inspetor: d.inspetor,
    Itens: d.respostas.length, Conformes: d.respostas.filter(r => r.resp === "C").length,
    "Não Conformes": d.respostas.filter(r => r.resp === "NC").length,
    "N/A": d.respostas.filter(r => r.resp === "NA").length, "% Conformidade": pctInsp(d) + "%",
  })));
  const eventos = inspFiltradas.flatMap(d => d.respostas.filter(r => r.resp === "NC").map(r => ({
    Data: d.data, Checklist: d.cod, Obra: d.frente, Item: r.item, "Observação": r.obs,
    "Responsável": r.responsavel || "", Prazo: r.prazo ? r.prazo.split("-").reverse().join("/") : "",
    "Evidência Foto": r.foto ? "Sim" : "Não", Inspetor: d.inspetor,
  })));
  const wsEv = XLSX.utils.json_to_sheet(eventos.length ? eventos : [{ Info: "Nenhuma NC no filtro" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsInsp, "Inspecoes");
  XLSX.utils.book_append_sheet(wb, wsEv, "Eventos_NC");
  const meta = XLSX.utils.aoa_to_sheet([["Obra", obra], ["Filtro", filtroDesc], ["Gerado em", new Date().toLocaleString("pt-BR")], ["Origem", "FieldCheck (protótipo)"]]);
  XLSX.utils.book_append_sheet(wb, meta, "Info");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  entregarArquivo(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `Inspecoes_${obra.replace(/\s+/g, "_")}_${hojeISO()}.xlsx`);
}

function gerarPNG(svgEl) {
  return new Promise((resolve) => {
    if (!svgEl) return resolve(null);
    const xml = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = 1280; cv.height = 640;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      resolve(cv.toDataURL("image/png"));
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  });
}

function gerarTSV(inspFiltradas) {
  const linhas = [["Data", "Checklist", "Nome", "Área", "Obra", "Inspetor", "Conformes", "Não Conformes", "N/A", "% Conformidade"].join("\t")];
  inspFiltradas.forEach(d => linhas.push([d.data, d.cod, d.nome, d.area, d.frente, d.inspetor,
    d.respostas.filter(r => r.resp === "C").length, d.respostas.filter(r => r.resp === "NC").length,
    d.respostas.filter(r => r.resp === "NA").length, pctInsp(d) + "%"].join("\t")));
  linhas.push(""); linhas.push(["Data", "Checklist", "Item", "Observação", "Responsável", "Prazo", "Evidência"].join("\t"));
  inspFiltradas.forEach(d => d.respostas.filter(r => r.resp === "NC").forEach(r =>
    linhas.push([d.data, d.cod, r.item, (r.obs || "").replace(/\t|\n/g, " "), r.responsavel || "",
      r.prazo ? r.prazo.split("-").reverse().join("/") : "", r.foto ? "Sim" : "Não"].join("\t"))));
  return linhas.join("\n");
}

// ---------------- tela: obra ----------------
function TelaObra({ obra, detalhes, onBack, onVer }) {
  const [fCk, setFCk] = useState("todos");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");
  const [fSoNC, setFSoNC] = useState(false);
  const [fInsp, setFInsp] = useState("todos");
  const [modoGraf, setModoGraf] = useState("nc");
  const [relatorio, setRelatorio] = useState(false);
  const [pngPreview, setPngPreview] = useState(null);
  const [modalDados, setModalDados] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const svgRef = useRef(null);
  const tsvRef = useRef(null);

  const daObra = detalhes.filter(d => d.frente === obra);
  const inspetores = [...new Set(daObra.map(d => d.inspetor).filter(x => x && x !== "—"))];
  const filtradas = useMemo(() => daObra.filter(d => {
    const iso = d.iso || brParaISO(d.data);
    if (fCk !== "todos" && d.cod !== fCk) return false;
    if (fInsp !== "todos" && d.inspetor !== fInsp) return false;
    if (fDe && iso < fDe) return false;
    if (fAte && iso > fAte) return false;
    if (fSoNC && !d.respostas.some(r => r.resp === "NC")) return false;
    return true;
  }), [daObra, fCk, fDe, fAte, fSoNC, fInsp]);

  const totC = filtradas.reduce((s, d) => s + d.respostas.filter(r => r.resp === "C").length, 0);
  const totNC = filtradas.reduce((s, d) => s + d.respostas.filter(r => r.resp === "NC").length, 0);
  const pct = totC + totNC > 0 ? Math.round(totC / (totC + totNC) * 100) : 0;
  const filtroDesc = [
    fCk !== "todos" ? `Checklist ${fCk}` : "Todos os checklists",
    fInsp !== "todos" ? `Inspetor ${fInsp}` : null,
    fDe ? `de ${fDe.split("-").reverse().join("/")}` : null,
    fAte ? `até ${fAte.split("-").reverse().join("/")}` : null,
    fSoNC ? "somente com NC" : null,
  ].filter(Boolean).join(" · ");

  useEffect(() => {
    if (relatorio) {
      const volta = () => setRelatorio(false);
      window.addEventListener("afterprint", volta);
      return () => window.removeEventListener("afterprint", volta);
    }
  }, [relatorio]);

  if (relatorio) {
    const eventos = filtradas.flatMap(d => d.respostas.filter(r => r.resp === "NC").map(r => ({ ...r, cod: d.cod, data: d.data })));
    return (
      <div style={{ padding: 24, fontFamily: FONT_BODY, color: "#111", background: "#fff", minHeight: "100vh" }}>
        <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Botao onClick={() => { try { window.print(); } catch (e) {} }} style={{ width: "auto" }}>Imprimir / Salvar PDF</Botao>
          <Botao variante="fantasma" onClick={() => setRelatorio(false)} style={{ width: "auto" }}>Voltar</Botao>
        </div>
        <div className="no-print" style={{ fontSize: 12.5, color: "#777", marginBottom: 14 }}>
          Se a janela de impressão não abrir (bloqueio do ambiente de protótipo), capture a tela deste relatório — no app publicado, o PDF é gerado e compartilhado nativamente.
        </div>
        <div style={{ borderBottom: "4px solid #16181B", paddingBottom: 10, marginBottom: 14 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 26, fontWeight: 700, textTransform: "uppercase" }}>Relatório de Inspeções — {obra}</div>
          <div style={{ fontSize: 12.5, color: "#555" }}>Filtro: {filtroDesc} · Gerado em {new Date().toLocaleString("pt-BR")} · FieldCheck</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 16 }}>
          <thead><tr>{["Data", "Checklist", "Inspetor", "Conf.", "NC", "N/A", "% Conform."].map(h =>
            <th key={h} style={{ border: "1px solid #999", padding: "6px 8px", background: "#EFEFEA", textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{filtradas.map((d, i) => (
            <tr key={i}>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{d.data}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{d.cod} · {d.nome}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{d.inspetor}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{d.respostas.filter(r => r.resp === "C").length}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px", color: T.red, fontWeight: 700 }}>{d.respostas.filter(r => r.resp === "NC").length}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px" }}>{d.respostas.filter(r => r.resp === "NA").length}</td>
              <td style={{ border: "1px solid #bbb", padding: "5px 8px", fontWeight: 700 }}>{pctInsp(d)}%</td>
            </tr>))}
          </tbody>
        </table>
        <div style={{ maxWidth: 620, margin: "0 auto 18px" }}>
          <GraficoObra modo={modoGraf} inspFiltradas={filtradas} svgRef={null} />
        </div>
        {eventos.length > 0 && <>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 18, fontWeight: 700, textTransform: "uppercase", margin: "10px 0 8px", color: T.red }}>Não conformidades ({eventos.length})</div>
          {eventos.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 12, borderTop: "1px solid #ccc", padding: "8px 0", breakInside: "avoid" }}>
              {e.foto && <img src={e.foto} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 6 }} />}
              <div style={{ fontSize: 12.5 }}>
                <b>{e.cod} · {e.item}</b> <span style={{ color: "#555" }}>({e.data})</span>
                <div>{e.obs}</div>
                <div style={{ color: "#555" }}>{e.responsavel ? "Responsável: " + e.responsavel : ""} {e.prazo ? " · Prazo: " + e.prazo.split("-").reverse().join("/") : ""}</div>
              </div>
            </div>))}
        </>}
      </div>
    );
  }

  return (
    <div>
      <Header titulo={obra} sub={`${daObra.length} inspeções na obra`} onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>Filtros</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={fCk} onChange={e => setFCk(e.target.value)} style={sel}>
              <option value="todos">Todos os checklists</option>
              {[...new Set(daObra.map(d => d.cod))].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fInsp} onChange={e => setFInsp(e.target.value)} style={sel}>
              <option value="todos">Todos os inspetores</option>
              {inspetores.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <input type="date" value={fDe} onChange={e => setFDe(e.target.value)} style={sel} aria-label="Data inicial" />
            <input type="date" value={fAte} onChange={e => setFAte(e.target.value)} style={sel} aria-label="Data final" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 14.5, fontWeight: 600 }}>
            <input type="checkbox" checked={fSoNC} onChange={e => setFSoNC(e.target.checked)} style={{ width: 20, height: 20 }} />
            Somente inspeções com NC
          </label>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi label="% Conform." valor={filtradas.length ? pct + "%" : "—"} cor={pct >= 95 ? T.green : pct >= 80 ? T.yellowDark : T.red} />
          <Kpi label="Inspeções" valor={filtradas.length} cor={T.navy} />
          <Kpi label="NCs" valor={totNC} cor={totNC ? T.red : T.green} />
        </div>

        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[["nc", "NCs por checklist"], ["conf", "Conformidade"]].map(([v, l]) => (
              <button key={v} onClick={() => setModoGraf(v)} style={{
                padding: "10px 4px", borderRadius: 10, cursor: "pointer", fontFamily: FONT_HEAD, fontWeight: 700,
                fontSize: 14, textTransform: "uppercase", letterSpacing: 0.4,
                border: modoGraf === v ? `2px solid ${T.yellow}` : `2px solid ${T.line}`,
                background: modoGraf === v ? "#FFF4D6" : "#fff", color: modoGraf === v ? T.yellowDark : T.inkSoft }}>{l}</button>
            ))}
          </div>
          <GraficoObra modo={modoGraf} inspFiltradas={filtradas} svgRef={svgRef} />
        </Card>

        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>Compartilhar / Exportar</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Botao variante="fantasma" style={{ fontSize: 14, padding: "12px 6px" }} onClick={() => { exportarXLSX(obra, filtradas, filtroDesc); setModalDados(true); }}>📊 Excel</Botao>
            <Botao variante="fantasma" style={{ fontSize: 14, padding: "12px 6px" }} onClick={() => setRelatorio(true)}>📄 Relatório</Botao>
            <Botao variante="fantasma" style={{ fontSize: 14, padding: "12px 6px" }} onClick={async () => setPngPreview(await gerarPNG(svgRef.current))}>🖼 Gráfico</Botao>
          </div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 8 }}>
            Exporta o filtro atual ({filtradas.length} inspeções). Neste protótipo o ambiente bloqueia downloads; por isso o gráfico abre para você salvar a imagem, e os dados podem ser copiados e colados no Excel. No app publicado, os arquivos .xlsx e .pdf são gerados e compartilhados normalmente.
          </div>
        </Card>

        {pngPreview && (
          <div onClick={() => setPngPreview(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <img src={pngPreview} alt="Gráfico exportado" style={{ width: "100%", maxWidth: 640, borderRadius: 10 }} />
            <div style={{ color: "#fff", marginTop: 14, fontSize: 14.5, textAlign: "center", fontWeight: 600 }}>
              Toque e segure na imagem para salvar ou compartilhar.<br />
              <span style={{ opacity: 0.7, fontWeight: 400 }}>Toque fora da imagem para fechar.</span>
            </div>
          </div>
        )}

        {modalDados && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setModalDados(false)}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "18px 18px 0 0", padding: 16, width: "100%", maxWidth: 520 }}>
              <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", marginBottom: 6 }}>Dados para o Excel</div>
              <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 10 }}>
                Se o arquivo .xlsx não foi baixado (bloqueio do protótipo), copie os dados abaixo e cole direto numa planilha — as colunas já entram separadas.
              </div>
              <textarea ref={tsvRef} readOnly value={gerarTSV(filtradas)} rows={6}
                style={{ width: "100%", boxSizing: "border-box", border: `2px solid ${T.line}`, borderRadius: 10, padding: 10, fontSize: 11, fontFamily: "monospace" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <Botao onClick={async () => {
                  try { await navigator.clipboard.writeText(gerarTSV(filtradas)); setCopiado(true); }
                  catch (e) { if (tsvRef.current) { tsvRef.current.focus(); tsvRef.current.select(); try { document.execCommand("copy"); setCopiado(true); } catch (e2) {} } }
                  setTimeout(() => setCopiado(false), 2500);
                }}>{copiado ? "Copiado ✓" : "Copiar dados"}</Botao>
                <Botao variante="fantasma" onClick={() => setModalDados(false)}>Fechar</Botao>
              </div>
            </div>
          </div>
        )}

        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 16, textTransform: "uppercase", color: T.inkSoft }}>Inspeções ({filtradas.length})</div>
        {filtradas.map(d => (
          <button key={d.id} onClick={() => onVer(d)} style={{ textAlign: "left", background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", width: "100%" }}>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 20, color: pctInsp(d) >= 95 ? T.green : pctInsp(d) >= 80 ? T.yellowDark : T.red, width: 58, textAlign: "center", flexShrink: 0 }}>{pctInsp(d)}%</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>{d.cod} · {d.nome}</div>
              <div style={{ fontSize: 12.5, color: T.inkSoft }}>{d.data} · {d.inspetor} · {d.respostas.filter(r => r.resp === "NC").length} NC</div>
            </div>
            <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
          </button>
        ))}
        {filtradas.length === 0 && <div style={{ textAlign: "center", color: T.inkSoft, padding: 20, fontSize: 14 }}>Nenhuma inspeção corresponde ao filtro.</div>}
      </div>
    </div>
  );
}

// ---------------- tela: detalhe (somente leitura) ----------------
function TelaDetalhe({ insp, onBack }) {
  return (
    <div>
      <Header titulo={insp.cod} sub={`${insp.nome} · ${insp.frente} · ${insp.data} · ${insp.inspetor}`} onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {insp.respostas.map((r, i) => (
          <div key={i} style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.line}`,
            borderLeft: `5px solid ${r.resp === "C" ? T.green : r.resp === "NC" ? T.red : T.gray}`, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{r.item}</span>
              <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, color: r.resp === "C" ? T.green : r.resp === "NC" ? T.red : T.gray }}>
                {r.resp === "C" ? "CONF." : r.resp === "NC" ? "NC" : "N/A"}</span>
            </div>
            {r.resp === "NC" && (
              <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                {r.foto && <img src={r.foto} alt="Evidência" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                <div style={{ fontSize: 13, color: T.inkSoft }}>
                  {r.obs}<br />{r.responsavel && "👤 " + r.responsavel} {r.prazo && " · 📅 " + r.prazo.split("-").reverse().join("/")}
                </div>
              </div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- telas de execução (iguais à v1) ----------------
function TelaExecucao({ insp, setInsp, onFinalizar, onBack }) {
  const fileRefs = useRef({});
  const setResp = (i, campo, valor) => setInsp(prev => { const r = [...prev.respostas]; r[i] = { ...r[i], [campo]: valor }; return { ...prev, respostas: r }; });
  const respondidos = insp.respostas.filter(r => r.resp).length;
  const total = insp.respostas.length;
  const ncSemObs = insp.respostas.some(r => r.resp === "NC" && !r.obs);
  return (
    <div>
      <Header titulo={insp.cod} sub={`${insp.nome} · ${insp.frente}`} onBack={onBack}
        right={<div style={{ fontFamily: FONT_HEAD, fontSize: 20, fontWeight: 700, color: T.yellow }}>{respondidos}/{total}</div>} />
      <div style={{ height: 5, background: T.line }}><div style={{ height: 5, width: (respondidos / total * 100) + "%", background: T.yellow, transition: "width .25s" }} /></div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 120 }}>
        {insp.respostas.map((r, i) => (
          <div key={i} style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.line}`, borderLeft: `5px solid ${r.resp === "C" ? T.green : r.resp === "NC" ? T.red : r.resp === "NA" ? T.gray : T.line}`, padding: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, color: T.inkSoft, fontSize: 15 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.35 }}>{r.item}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
              {[["C", "Conforme", T.green, T.greenBg], ["NC", "Não conf.", T.red, T.redBg], ["NA", "N/A", T.gray, T.grayBg]].map(([v, lbl, cor, corBg]) => (
                <button key={v} onClick={() => setResp(i, "resp", r.resp === v ? "" : v)} style={{ padding: "13px 4px", borderRadius: 10, cursor: "pointer", fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", border: r.resp === v ? `2px solid ${cor}` : `2px solid ${T.line}`, background: r.resp === v ? corBg : "#fff", color: r.resp === v ? cor : T.inkSoft }}>{lbl}</button>))}
            </div>
            {r.resp === "NC" && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <textarea value={r.obs || ""} onChange={e => setResp(i, "obs", e.target.value)} placeholder="Descreva o desvio (obrigatório)…" rows={2}
                  style={{ width: "100%", boxSizing: "border-box", border: `2px solid ${r.obs ? T.line : T.red}`, borderRadius: 10, padding: 10, fontSize: 14.5, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={r.responsavel || ""} onChange={e => setResp(i, "responsavel", e.target.value)} placeholder="Responsável" style={{ flex: 1, border: `2px solid ${T.line}`, borderRadius: 10, padding: 10, fontSize: 14.5, minWidth: 0 }} />
                  <input type="date" value={r.prazo || ""} onChange={e => setResp(i, "prazo", e.target.value)} style={{ flex: 1, border: `2px solid ${T.line}`, borderRadius: 10, padding: 10, fontSize: 14, minWidth: 0 }} />
                </div>
                <input ref={el => (fileRefs.current[i] = el)} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                  onChange={async e => { const f = e.target.files && e.target.files[0]; if (f) setResp(i, "foto", await comprimirFoto(f)); }} />
                {r.foto ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <img src={r.foto} alt="Evidência" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: `2px solid ${T.line}` }} />
                    <button onClick={() => setResp(i, "foto", "")} style={{ background: "none", border: "none", color: T.red, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Remover foto</button>
                  </div>
                ) : (
                  <button onClick={() => fileRefs.current[i] && fileRefs.current[i].click()} style={{ border: `2px dashed ${T.yellowDark}`, background: "#FFF8E6", color: T.yellowDark, borderRadius: 10, padding: "12px 10px", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}>📷 Registrar evidência fotográfica</button>
                )}
              </div>)}
          </div>))}
      </div>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "12px 14px 18px", background: "linear-gradient(transparent, rgba(244,244,241,0.96) 30%)" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <Botao variante="escuro" disabled={respondidos < total || ncSemObs} onClick={onFinalizar}>
            {respondidos < total ? `Faltam ${total - respondidos} itens` : ncSemObs ? "Descreva as NCs para finalizar" : "Finalizar inspeção ✓"}
          </Botao>
        </div>
      </div>
    </div>
  );
}

function TelaResumo({ insp, onSalvar, onBack, salvando }) {
  const ncs = insp.respostas.filter(r => r.resp === "NC");
  const conf = insp.respostas.filter(r => r.resp === "C").length;
  const na = insp.respostas.filter(r => r.resp === "NA").length;
  const pct = conf + ncs.length > 0 ? Math.round(conf / (conf + ncs.length) * 100) : 100;
  return (
    <div>
      <Header titulo="Resumo" sub={`${insp.cod} · ${insp.frente} · ${insp.data}`} onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi label="Conformidade" valor={pct + "%"} cor={pct >= 95 ? T.green : pct >= 80 ? T.yellowDark : T.red} />
          <Kpi label="Não conform." valor={ncs.length} cor={ncs.length ? T.red : T.green} />
          <Kpi label="N/A" valor={na} cor={T.gray} />
        </div>
        {ncs.length > 0 && (
          <Card>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", color: T.red, marginBottom: 10 }}>Eventos gerados ({ncs.length})</div>
            {ncs.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
                {r.foto && <img src={r.foto} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.item}</div>
                  <div style={{ fontSize: 13.5, color: T.inkSoft }}>{r.obs}</div>
                </div>
              </div>))}
          </Card>)}
        <Botao onClick={onSalvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar e sincronizar"}</Botao>
      </div>
    </div>
  );
}

// ---------------- app ----------------
export default function FieldCheck() {
  const [tela, setTela] = useState("home");
  const [indice, setIndice] = useState([]);
  const [detalhes, setDetalhes] = useState([]);
  const [insp, setInsp] = useState(null);
  const [obraSel, setObraSel] = useState(null);
  const [verInsp, setVerInsp] = useState(null);
  const [frente, setFrente] = useState("");
  const [inspetor, setInspetor] = useState("");
  const [ckSel, setCkSel] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const mostrarAviso = (msg, tipo) => {
    setAviso({ msg, tipo });
    setTimeout(() => setAviso(null), tipo === "erro" ? 6000 : 2500);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("insp_index");
        if (r && r.value) {
          const idx = JSON.parse(r.value);
          setIndice(idx);
          const full = [];
          for (const m of idx.slice(0, 50)) {
            try { const d = await window.storage.get("insp_" + m.id); if (d && d.value) full.push(JSON.parse(d.value)); } catch (e) {}
          }
          setDetalhes(full);
        }
      } catch (e) { /* sem dados ainda */ }
    })();
  }, []);

  const obras = useMemo(() => {
    const m = {};
    detalhes.forEach(d => {
      if (!m[d.frente]) m[d.frente] = { nome: d.frente, n: 0, c: 0, nc: 0 };
      m[d.frente].n++;
      m[d.frente].c += d.respostas.filter(r => r.resp === "C").length;
      m[d.frente].nc += d.respostas.filter(r => r.resp === "NC").length;
    });
    return Object.values(m).sort((a, b) => b.n - a.n);
  }, [detalhes]);

  const iniciar = () => {
    const ck = CATALOGO.find(c => c.cod === ckSel);
    setInsp({ id: uid(), cod: ck.cod, nome: ck.nome, area: ck.area,
      frente: frente.trim() || "Obra não informada", inspetor: inspetor.trim() || "—",
      data: hojeBR(), iso: hojeISO(),
      respostas: ck.itens.map(item => ({ item, resp: "", obs: "", foto: "", responsavel: "", prazo: "" })) });
    setTela("run");
  };

  const finalizarSalvar = async () => {
    setSalvando(true);
    const conf = insp.respostas.filter(r => r.resp === "C").length;
    const nc = insp.respostas.filter(r => r.resp === "NC").length;
    const na = insp.respostas.filter(r => r.resp === "NA").length;
    const completo = { ...insp, conf, nc, na };
    const novoIdx = [{ id: completo.id, cod: completo.cod, nome: completo.nome, frente: completo.frente, data: completo.data, iso: completo.iso, conf, nc, na }, ...indice.filter(i => i.id !== completo.id)];

    // 1) A tela é atualizada SEMPRE, independentemente do armazenamento
    setIndice(novoIdx);
    setDetalhes(prev => [completo, ...prev.filter(d => d.id !== completo.id)]);
    setTela("home"); setInsp(null); setCkSel(null); setFrente(""); setInspetor("");
    setSalvando(false);

    // 2) Persistência em segundo plano (fila de sincronização do protótipo)
    try {
      if (!window.storage) throw new Error("storage indisponível");
      await window.storage.set("insp_" + completo.id, JSON.stringify(completo));
      await window.storage.set("insp_index", JSON.stringify(novoIdx));
      mostrarAviso("Inspeção salva ✓", "ok");
    } catch (e) {
      console.error("Falha ao persistir", e);
      mostrarAviso("Registrada nesta sessão, mas sem persistência — exporte antes de fechar", "erro");
    }
  };

  return (
    <div style={{ fontFamily: FONT_BODY, background: T.bg, minHeight: "100vh", maxWidth: 520, margin: "0 auto", color: T.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap');
        input:focus, textarea:focus, select:focus, button:focus-visible { outline: 3px solid ${T.yellow}; outline-offset: 1px; }
        @media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>

      {aviso && (
        <div className="no-print" role="status" style={{
          position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 50,
          maxWidth: 460, width: "calc(100% - 28px)", padding: "12px 16px", borderRadius: 12,
          background: aviso.tipo === "ok" ? T.green : T.red, color: "#fff",
          fontWeight: 700, fontSize: 14, textAlign: "center", boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}>
          {aviso.msg}
        </div>
      )}

      {tela === "home" && (
        <div>
          <Header titulo="FieldCheck" sub="Inspeções de campo · G5 Engenharia" />
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <Botao onClick={() => setTela("new")}>+ Nova inspeção</Botao>

            <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 16, textTransform: "uppercase", color: T.inkSoft, marginTop: 4 }}>Obras ({obras.length})</div>
            {obras.length === 0 && (
              <div style={{ background: T.card, border: `2px dashed ${T.line}`, borderRadius: 14, padding: 26, textAlign: "center", color: T.inkSoft, fontSize: 14.5 }}>
                As obras aparecem aqui automaticamente<br />a partir da primeira inspeção registrada.
              </div>)}
            {obras.map(o => {
              const pct = o.c + o.nc > 0 ? Math.round(o.c / (o.c + o.nc) * 100) : 100;
              return (
                <button key={o.nome} onClick={() => { setObraSel(o.nome); setTela("obra"); }} style={{
                  textAlign: "left", background: T.card, border: `1px solid ${T.line}`, borderLeft: `6px solid ${T.yellow}`,
                  borderRadius: 14, padding: 16, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 19, textTransform: "uppercase", color: T.ink }}>{o.nome}</div>
                    <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{o.n} inspeções · {o.nc} NC · {pct}% conformidade</div>
                  </div>
                  <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 24, color: pct >= 95 ? T.green : pct >= 80 ? T.yellowDark : T.red }}>{pct}%</div>
                  <span style={{ color: T.inkSoft, fontSize: 20 }}>›</span>
                </button>);
            })}
          </div>
        </div>
      )}

      {tela === "new" && (
        <div>
          <Header titulo="Nova inspeção" sub="Selecione o checklist e a obra" onBack={() => setTela("home")} />
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <input list="obras-list" value={frente} onChange={e => setFrente(e.target.value)} placeholder="Obra / frente (ex.: UFV Diamantina I)" style={{ border: `2px solid ${T.line}`, borderRadius: 12, padding: 13, fontSize: 15 }} />
            <datalist id="obras-list">{obras.map(o => <option key={o.nome} value={o.nome} />)}</datalist>
            <input value={inspetor} onChange={e => setInspetor(e.target.value)} placeholder="Inspetor" style={{ border: `2px solid ${T.line}`, borderRadius: 12, padding: 13, fontSize: 15 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CATALOGO.map(c => (
                <button key={c.cod} onClick={() => setCkSel(c.cod)} style={{ textAlign: "left", background: ckSel === c.cod ? "#FFF4D6" : T.card, border: ckSel === c.cod ? `2px solid ${T.yellow}` : `1px solid ${T.line}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                  <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 16, color: T.navy, width: 52, flexShrink: 0 }}>{c.cod}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 14.5 }}>{c.nome}</span>
                    <span style={{ fontSize: 12.5, color: T.inkSoft }}>{c.area} · {c.itens.length} itens</span>
                  </span>
                  {ckSel === c.cod && <span style={{ color: T.yellowDark, fontWeight: 700 }}>✓</span>}
                </button>))}
            </div>
            <Botao onClick={iniciar} disabled={!ckSel}>Iniciar inspeção →</Botao>
          </div>
        </div>
      )}

      {tela === "obra" && obraSel && (
        <TelaObra obra={obraSel} detalhes={detalhes} onBack={() => setTela("home")} onVer={(d) => { setVerInsp(d); setTela("detalhe"); }} />
      )}

      {tela === "detalhe" && verInsp && <TelaDetalhe insp={verInsp} onBack={() => setTela("obra")} />}

      {tela === "run" && insp && <TelaExecucao insp={insp} setInsp={setInsp} onBack={() => setTela("new")} onFinalizar={() => setTela("resumo")} />}

      {tela === "resumo" && insp && <TelaResumo insp={insp} onBack={() => setTela("run")} onSalvar={finalizarSalvar} salvando={salvando} />}
    </div>
  );
}
