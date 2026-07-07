import { T, FONT_HEAD } from "@/theme";
import type { KpisBird, ChaveBird } from "@/lib/piramideBird";

// ============================================================
// Pirâmide de Bird (SVG exportável, Marco A2). 4 níveis empilhados com
// as contagens reais do período + leitura interpretativa e alerta de
// subnotificação da base.
// ============================================================

const COR: Record<ChaveBird, string> = {
  base: T.navy,
  dano_material: T.yellowDark,
  acidente_sem_afastamento: "#E07B39",
  acidente_com_afastamento: T.red,
};

// Geometria: pirâmide em x[20,340], apex no topo, base embaixo.
const APEX_X = 180;
const X0 = 20, X1 = 340; // limites da base
const Y_TOP = 16, Y_BASE = 208;
const larguraEm = (y: number) => ((X1 - X0) * (y - Y_TOP)) / (Y_BASE - Y_TOP);

export function PiramideBird({
  kpis,
  svgRef,
}: {
  kpis: KpisBird;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  // niveis vem base→topo; desenhamos de baixo (base) para cima (com afastamento).
  const bandas = kpis.niveis.map((n, i) => {
    const yBot = Y_BASE - i * ((Y_BASE - Y_TOP) / 4);
    const yTop = yBot - (Y_BASE - Y_TOP) / 4;
    const wTop = larguraEm(yTop), wBot = larguraEm(yBot);
    const pts = [
      [APEX_X - wTop / 2, yTop],
      [APEX_X + wTop / 2, yTop],
      [APEX_X + wBot / 2, yBot],
      [APEX_X - wBot / 2, yBot],
    ]
      .map((p) => p.join(","))
      .join(" ");
    return { nivel: n, pts, yMid: (yTop + yBot) / 2 };
  });

  return (
    <div>
      <svg ref={svgRef} viewBox="0 0 360 224" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 460, display: "block", margin: "0 auto" }}>
        <rect x="0" y="0" width="360" height="224" fill="#fff" />
        {bandas.map(({ nivel, pts, yMid }) => (
          <g key={nivel.chave}>
            <polygon points={pts} fill={COR[nivel.chave]} stroke="#fff" strokeWidth="2" />
            <text x={APEX_X} y={yMid + 6} textAnchor="middle" fontFamily={FONT_HEAD} fontWeight="700" fontSize="18" fill="#fff">
              {nivel.count}
            </text>
          </g>
        ))}
      </svg>

      {/* legenda */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {[...kpis.niveis].reverse().map((n) => (
          <div key={n.chave} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: COR[n.chave], flexShrink: 0 }} />
            <span style={{ flex: 1, color: T.ink }}>{n.rotulo}</span>
            <span style={{ fontWeight: 700, color: T.ink }}>{n.count}</span>
            <span style={{ color: T.inkSoft, fontSize: 11 }}>ref {n.ref}</span>
          </div>
        ))}
      </div>

      {/* leitura interpretativa */}
      <div
        style={{
          marginTop: 10,
          fontSize: 12.5,
          lineHeight: 1.5,
          borderRadius: 10,
          padding: "10px 12px",
          background: kpis.subnotificacao ? T.redBg : T.grayBg,
          color: kpis.subnotificacao ? T.red : T.inkSoft,
          fontWeight: kpis.subnotificacao ? 600 : 400,
        }}
      >
        {kpis.subnotificacao ? "⚠️ " : ""}
        {kpis.leitura}
      </div>
    </div>
  );
}
