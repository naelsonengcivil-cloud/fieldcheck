import { Botao, Card, Header, Kpi } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";

// ============================================================
// M0 — shell de fundação. Valida o design system e o boot do PWA.
// As telas reais (Home/Obra/Execução) chegam nos marcos M3–M7.
// ============================================================

export function App() {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: T.bg,
        minHeight: "100vh",
        maxWidth: 520,
        margin: "0 auto",
        color: T.ink,
      }}
    >
      <Header titulo="FieldCheck" sub="Inspeções de campo · fundação (M0)" />
      <div
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Botao onClick={() => alert("Fluxo de nova inspeção chega no M5.")}>
          + Nova inspeção
        </Botao>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
          }}
        >
          <Kpi label="Inspeções" valor="—" cor={T.navy} />
          <Kpi label="NCs" valor="—" cor={T.green} />
          <Kpi label="% Conform." valor="—" cor={T.green} />
        </div>

        <Card>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 16,
              textTransform: "uppercase",
              color: T.inkSoft,
              marginBottom: 6,
            }}
          >
            Fundação pronta
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5 }}>
            React + Vite + TypeScript com PWA (service worker registrado),
            TanStack Query, cliente Supabase e o design system do protótipo
            (faixa zebrada, Barlow Condensed, paleta de sinalização).
          </div>
        </Card>
      </div>
    </div>
  );
}
