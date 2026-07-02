import { Botao, Card, Header, Kpi } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Shell autenticado. Home real (obras + KPIs) chega no M6; por ora
// confirma o login resolvido (empresa/papel) e oferece "Sair".
// ============================================================

const PAPEL_LABEL: Record<string, string> = {
  inspetor: "Inspetor",
  gestor: "Gestor",
  admin: "Administrador",
};

export function AppShell() {
  const { perfil, empresa, signOut } = useAuth();

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
      <Header
        titulo="FieldCheck"
        sub={empresa ? `${empresa.nome}` : "Inspeções de campo"}
        right={
          <button
            onClick={() => void signOut()}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT_HEAD,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Sair
          </button>
        }
      />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Botao onClick={() => alert("Fluxo de nova inspeção chega no M5.")}>
          + Nova inspeção
        </Botao>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
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
            Sessão ativa
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            <div>
              <b>{perfil?.nome}</b>
            </div>
            <div style={{ color: T.inkSoft }}>
              {PAPEL_LABEL[perfil?.papel ?? ""] ?? perfil?.papel} · {empresa?.nome}
            </div>
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>
            Login resolvido com empresa e papel (RF01). A Home com obras e KPIs
            reais entra no M6; a execução de inspeção offline no M4–M5.
          </div>
        </Card>
      </div>
    </div>
  );
}
