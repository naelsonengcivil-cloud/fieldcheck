import { FONT_HEAD } from "@/theme";

// ============================================================
// Cabeçalho + rodapé padrão dos relatórios (Marco J). O logo do cliente
// (bucket público 'logos') e o nome da empresa dominam o topo; o inspetor
// responsável (ou os do recorte) aparece em destaque. A marca FieldCheck
// fica no rodapé, discreta e subordinada à do cliente. Usado no relatório
// por obra e no Geral. Impressão: window.print() → "Salvar como PDF".
// ============================================================

/** Marca discreta rodapé — fixa, repete em cada página impressa. */
export function RodapeFieldCheck() {
  return (
    <div
      className="fc-rodape"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "4px 24px",
        borderTop: "1px solid #ddd",
        background: "#fff",
        fontSize: 9.5,
        color: "#999",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>Gerado por FieldCheck — fieldcheck.app</span>
      <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, letterSpacing: 0.5 }}>FIELDCHECK</span>
    </div>
  );
}

export function CabecalhoRelatorio({
  empresaNome,
  logoUrl,
  titulo,
  subtitulo,
  inspetores,
  metaLinha,
}: {
  empresaNome: string;
  logoUrl?: string | null;
  titulo: string;
  subtitulo?: string;
  /** Inspetor(es) do recorte — um na inspeção, vários na obra/geral. */
  inspetores?: string[];
  /** Linha de metadados (filtro · totais · gerado em). */
  metaLinha?: string;
}) {
  const insp = (inspetores ?? []).filter(Boolean);
  const rotuloInsp =
    insp.length === 0
      ? null
      : insp.length === 1
        ? `Inspetor responsável: ${insp[0]}`
        : `Inspetores: ${insp.join(", ")}`;

  return (
    <div style={{ borderBottom: "4px solid #16181B", paddingBottom: 10, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt={empresaNome}
            crossOrigin="anonymous"
            style={{ maxHeight: 56, maxWidth: 180, objectFit: "contain", flexShrink: 0 }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 700, textTransform: "uppercase", lineHeight: 1.1 }}>
            {empresaNome}
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 15, fontWeight: 700, color: "#444", textTransform: "uppercase" }}>
            {titulo}
          </div>
        </div>
      </div>

      {subtitulo && <div style={{ fontSize: 13, color: "#333", marginTop: 8, fontWeight: 600 }}>{subtitulo}</div>}
      {rotuloInsp && <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>{rotuloInsp}</div>}
      {metaLinha && <div style={{ fontSize: 11.5, color: "#777", marginTop: 3 }}>{metaLinha}</div>}
    </div>
  );
}
