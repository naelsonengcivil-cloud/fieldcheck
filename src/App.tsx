import { useState } from "react";
import { Stripe } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { LoginScreen } from "@/app/LoginScreen";
import { CadastroScreen } from "@/app/CadastroScreen";
import { AppShell } from "@/app/AppShell";
import { CriarEmpresaScreen } from "@/app/CriarEmpresaScreen";
import { TelaOperador } from "@/features/operador/TelaOperador";
import { EsqueciSenhaScreen, RedefinirSenhaScreen, LinkExpiradoScreen } from "@/app/RecuperarSenha";

// ============================================================
// Raiz do app: roteia por estado de autenticação (RF01 / M9).
// carregando → splash · deslogado → login/cadastro ·
// sem_perfil → criar empresa (onboarding) · pronto → shell.
// ============================================================

function Splash() {
  return (
    <div style={{ background: T.navy, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
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
  const { status, recoveryMode, recoveryErro, limparRecovery } = useAuth();
  const [authView, setAuthView] = useState<"login" | "cadastro" | "esqueci">("login");

  // Link de recuperação abriu o app → redefinição / erro, independe do status.
  if (recoveryErro) {
    return (
      <LinkExpiradoScreen
        erro={recoveryErro}
        onSolicitar={() => {
          limparRecovery();
          setAuthView("esqueci");
        }}
      />
    );
  }
  if (recoveryMode) return <RedefinirSenhaScreen />;

  switch (status) {
    case "carregando":
      return <Splash />;
    case "deslogado":
      if (authView === "cadastro") return <CadastroScreen onVoltar={() => setAuthView("login")} />;
      if (authView === "esqueci") return <EsqueciSenhaScreen onVoltar={() => setAuthView("login")} />;
      return (
        <LoginScreen
          onCriarConta={() => setAuthView("cadastro")}
          onEsqueci={() => setAuthView("esqueci")}
        />
      );
    case "sem_perfil":
      return <CriarEmpresaScreen />;
    case "operador":
      return <TelaOperador />;
    case "pronto":
      return <AppShell />;
  }
}
