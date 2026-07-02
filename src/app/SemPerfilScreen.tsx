import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Sessão válida, porém sem linha em `usuarios` (conta autenticada
// mas não vinculada a uma empresa). Orienta e permite sair.
// ============================================================

export function SemPerfilScreen() {
  const { session, signOut } = useAuth();
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
      <Header titulo="Conta sem empresa" />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 18,
              textTransform: "uppercase",
              color: T.red,
              marginBottom: 8,
            }}
          >
            Acesso não vinculado
          </div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            O login de <b>{session?.user.email}</b> foi autenticado, mas ainda não
            está vinculado a nenhuma empresa. Peça ao administrador da sua conta
            para provisionar seu usuário.
          </div>
        </Card>
        <Botao variante="fantasma" onClick={() => void signOut()}>
          Sair
        </Botao>
      </div>
    </div>
  );
}
