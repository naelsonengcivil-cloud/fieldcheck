import type { Ref } from "react";
import { T, FONT_HEAD, FONT_BODY } from "@/theme";
import type { LocalInspecao, LocalResposta } from "@/lib/db";
import type { Checklist } from "@/types/db";
import { pctConformidade, dataInspecao } from "@/lib/obraView";

// ============================================================
// Gráfico da obra (RF08) — SVG exportável (base do PNG do M7).
// Dois modos: NCs por checklist · % conformidade por inspeção.
// Reage ao conjunto filtrado. Portado do protótipo validado.
// ============================================================

export type ModoGrafico = "nc" | "conf";

interface Barra {
  k: string;
  v: number;
  cor: string;
}

function montarBarras(
  modo: ModoGrafico,
  filtradas: LocalInspecao[],
  idx: Map<string, LocalResposta[]>,
  ckMap: Map<string, Checklist>,
): Barra[] {
  if (modo === "nc") {
    const porCk: Record<string, number> = {};
    for (const insp of filtradas) {
      const cod = ckMap.get(insp.checklist_id)?.codigo ?? "—";
      const ncs = (idx.get(insp.id) ?? []).filter((r) => r.resposta === "NC").length;
      porCk[cod] = (porCk[cod] ?? 0) + ncs;
    }
    return Object.entries(porCk).map(([k, v]) => ({ k, v, cor: T.red }));
  }
  return [...filtradas]
    .sort((a, b) => dataInspecao(a).localeCompare(dataInspecao(b)))
    .map((insp) => {
      const rs = idx.get(insp.id) ?? [];
      const c = rs.filter((r) => r.resposta === "C").length;
      const nc = rs.filter((r) => r.resposta === "NC").length;
      const pct = pctConformidade(c, nc);
      const cod = ckMap.get(insp.checklist_id)?.codigo ?? "—";
      const dia = dataInspecao(insp).split("-").reverse().join("/").slice(0, 5);
      return {
        k: `${cod} ${dia}`,
        v: pct,
        cor: pct >= 95 ? T.green : pct >= 80 ? T.yellow : T.red,
      };
    });
}

export function GraficoObra({
  modo,
  filtradas,
  idx,
  ckMap,
  svgRef,
}: {
  modo: ModoGrafico;
  filtradas: LocalInspecao[];
  idx: Map<string, LocalResposta[]>;
  ckMap: Map<string, Checklist>;
  svgRef?: Ref<SVGSVGElement>;
}) {
  const W = 640,
    H = 320,
    PADL = 44,
    PADB = 58,
    PADT = 34;
  const barras = montarBarras(modo, filtradas, idx, ckMap);
  const maxV = modo === "nc" ? Math.max(1, ...barras.map((b) => b.v)) : 100;
  const bw = barras.length ? Math.min(70, (W - PADL - 16) / barras.length - 10) : 0;
  const titulo =
    modo === "nc" ? "Não conformidades por checklist" : "% de conformidade por inspeção";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", background: "#fff", borderRadius: 10 }}
    >
      <text
        x={W / 2}
        y={20}
        textAnchor="middle"
        fontFamily={FONT_HEAD}
        fontWeight="700"
        fontSize="17"
        fill={T.ink}
        style={{ textTransform: "uppercase" }}
      >
        {titulo}
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = PADT + (H - PADT - PADB) * (1 - f);
        return (
          <g key={f}>
            <line x1={PADL} x2={W - 10} y1={y} y2={y} stroke={T.line} strokeWidth="1" />
            <text
              x={PADL - 6}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill={T.inkSoft}
              fontFamily={FONT_BODY}
            >
              {Math.round(maxV * f)}
              {modo === "nc" ? "" : "%"}
            </text>
          </g>
        );
      })}
      {barras.map((b, i) => {
        const passo = (W - PADL - 16) / Math.max(1, barras.length);
        const x = PADL + 8 + i * passo + (passo - bw) / 2;
        const h = (H - PADT - PADB) * (b.v / maxV);
        const y = H - PADB - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={Math.max(2, h)} rx="4" fill={b.cor} />
            <text
              x={x + bw / 2}
              y={y - 5}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill={T.ink}
              fontFamily={FONT_BODY}
            >
              {b.v}
              {modo === "nc" ? "" : "%"}
            </text>
            <text
              x={x + bw / 2}
              y={H - PADB + 14}
              textAnchor="middle"
              fontSize="10.5"
              fill={T.inkSoft}
              fontFamily={FONT_BODY}
              transform={
                barras.length > 6
                  ? `rotate(-35 ${x + bw / 2} ${H - PADB + 14})`
                  : undefined
              }
            >
              {b.k}
            </text>
          </g>
        );
      })}
      {barras.length === 0 && (
        <text
          x={W / 2}
          y={H / 2}
          textAnchor="middle"
          fontSize="14"
          fill={T.inkSoft}
          fontFamily={FONT_BODY}
        >
          Sem dados para o filtro selecionado
        </text>
      )}
    </svg>
  );
}
