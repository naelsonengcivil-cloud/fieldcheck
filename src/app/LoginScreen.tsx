import { useState, type CSSProperties } from "react";
import { Botao, Stripe } from "@/components/ui";
import { T, FONT_HEAD, FONT_BODY } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { APP_VERSION_LABEL } from "@/version";

// ============================================================
// Tela de login (RF01). E-mail/senha; erro em pt-BR; estados de
// carregamento. Design system do protótipo (navy + faixa zebrada).
// ============================================================

const campo: CSSProperties = {
  border: `2px solid ${T.line}`,
  borderRadius: 12,
  padding: 14,
  fontSize: 16, // >=16px evita zoom automático no iOS
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
};

export function LoginScreen({ onCriarConta, onEsqueci }: { onCriarConta?: () => void; onEsqueci?: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const { error } = await signIn(email, senha);
    setEnviando(false);
    if (error) setErro(error);
    // sucesso: onAuthStateChange leva o app para o shell autenticado.
  }

  return (
    <div
      style={{
        fontFamily: FONT_BODY,
        background: T.bg,
        minHeight: "100vh",
        maxWidth: 520,
        margin: "0 auto",
        color: T.ink,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ background: T.navy, color: "#fff" }}>
        <Stripe />
        <div style={{ padding: "28px 20px 24px" }}>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 34,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            FieldCheck
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 13.5, opacity: 0.75 }}>
              Inspeções de campo em obras
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.3,
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
            >
              {APP_VERSION_LABEL}
            </span>
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void entrar();
        }}
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          flex: 1,
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 18,
            textTransform: "uppercase",
            color: T.inkSoft,
            marginTop: 6,
          }}
        >
          Entrar na sua conta
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft }}>
            E-mail
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            style={campo}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft }}>
            Senha
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            style={campo}
          />
        </label>

        {erro && (
          <div
            role="alert"
            style={{
              background: T.redBg,
              color: T.red,
              border: `1px solid ${T.red}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {erro}
          </div>
        )}

        <Botao type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Botao>

        {onEsqueci && (
          <button
            type="button"
            onClick={onEsqueci}
            style={{ background: "none", border: "none", color: T.inkSoft, fontWeight: 600, fontSize: 13.5, cursor: "pointer", padding: 4, textDecoration: "underline" }}
          >
            Esqueci minha senha
          </button>
        )}

        {onCriarConta && (
          <button
            type="button"
            onClick={onCriarConta}
            style={{
              background: "none",
              border: "none",
              color: T.yellowDark,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              padding: 4,
            }}
          >
            Não tem conta? Criar empresa (teste grátis)
          </button>
        )}

        <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4, lineHeight: 1.5 }}>
          Já é usuário de uma empresa? Use o e-mail e a senha fornecidos pelo
          administrador da sua conta.
        </div>
      </form>
    </div>
  );
}
