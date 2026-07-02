import { Stripe } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { LoginScreen } from "@/app/LoginScreen";
import { AppShell } from "@/app/AppShell";
import { SemPerfilScreen } from "@/app/SemPerfilScreen";

// ============================================================
// Raiz do app: roteia por estado de autenticação (RF01).
// carregando → splash · deslogado → login · sem_perfil → aviso ·
// pronto → shell autenticado (Home real a partir do M6).
// ============================================================

function Splash() {
  return (
    <div
      style={{
        background: T.navy,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stripe />
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: FONT_HEAD,
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          opacity: 0.9,
        }}
      >
        FieldCheck
      </div>
    </div>
  );
}

export function App() {
  const { status } = useAuth();

  switch (status) {
    case "carregando":
      return <Splash />;
    case "deslogado":
      return <LoginScreen />;
    case "sem_perfil":
      return <SemPerfilScreen />;
    case "pronto":
      return <AppShell />;
  }
}
