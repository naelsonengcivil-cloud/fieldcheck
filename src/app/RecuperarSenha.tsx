import { useState, type CSSProperties, type ReactNode } from "react";
import { Botao, Stripe } from "@/components/ui";
import { T, FONT_HEAD, FONT_BODY } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Recuperação de senha (Marco H): "Esqueci minha senha" (envia e-mail de
// reset) e a tela de redefinição (quando o link do e-mail abre o app —
// evento PASSWORD_RECOVERY). Design system do protótipo.
// ============================================================

const campo: CSSProperties = {
  border: `2px solid ${T.line}`,
  borderRadius: 12,
  padding: 14,
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
};
const rotulo: CSSProperties = { fontSize: 13, fontWeight: 600, color: T.inkSoft };
const alerta: CSSProperties = {
  background: T.redBg,
  color: T.red,
  border: `1px solid ${T.red}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
};

function Casca({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONT_BODY, background: T.bg, minHeight: "100vh", maxWidth: 520, margin: "0 auto", color: T.ink, display: "flex", flexDirection: "column" }}>
      <div style={{ background: T.navy, color: "#fff" }}>
        <Stripe />
        <div style={{ padding: "28px 20px 24px" }}>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 34, letterSpacing: 0.5, textTransform: "uppercase", lineHeight: 1 }}>FieldCheck</div>
          <div style={{ fontSize: 13.5, opacity: 0.75, marginTop: 6 }}>{titulo}</div>
        </div>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>{children}</div>
    </div>
  );
}

const linkBtn: CSSProperties = { background: "none", border: "none", color: T.yellowDark, fontWeight: 700, fontSize: 14, cursor: "pointer", padding: 4 };

/** "Esqueci minha senha" — envia o e-mail de redefinição. */
export function EsqueciSenhaScreen({ onVoltar }: { onVoltar: () => void }) {
  const { enviarResetSenha } = useAuth();
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    if (!email.trim()) return setErro("Informe o seu e-mail.");
    setEnviando(true);
    setErro(null);
    const { error } = await enviarResetSenha(email);
    setEnviando(false);
    if (error) setErro(error);
    else setEnviado(true);
  }

  if (enviado) {
    return (
      <Casca titulo="Recuperar senha">
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
          Se houver uma conta para <b>{email}</b>, enviamos um link para redefinir a
          senha. Verifique a caixa de entrada (e o spam).
        </div>
        <Botao variante="fantasma" onClick={onVoltar}>Voltar ao login</Botao>
      </Casca>
    );
  }

  return (
    <Casca titulo="Recuperar senha">
      <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 14.5, color: T.inkSoft, lineHeight: 1.5 }}>
          Digite o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>E-mail</span>
          <input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" style={campo} />
        </label>
        {erro && <div role="alert" style={alerta}>{erro}</div>}
        <Botao type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar link de redefinição"}</Botao>
        <button type="button" onClick={onVoltar} style={linkBtn}>Voltar ao login</button>
      </form>
    </Casca>
  );
}

/** Redefinição de senha (o link do e-mail abriu o app com sessão de recovery). */
export function RedefinirSenhaScreen() {
  const { redefinirSenha, signOut } = useAuth();
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (senha.length < 6) return setErro("A senha precisa ter ao menos 6 caracteres.");
    if (senha !== conf) return setErro("As senhas não coincidem.");
    setSalvando(true);
    setErro(null);
    const { error } = await redefinirSenha(senha);
    setSalvando(false);
    if (error) setErro(error);
    // sucesso: recoveryMode zera → o app segue autenticado.
  }

  return (
    <Casca titulo="Definir nova senha">
      <form onSubmit={(e) => { e.preventDefault(); void salvar(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 14.5, color: T.inkSoft, lineHeight: 1.5 }}>Crie uma nova senha para a sua conta.</div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>Nova senha</span>
          <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" style={campo} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>Confirmar senha</span>
          <input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="Repita a senha" style={campo} />
        </label>
        {erro && <div role="alert" style={alerta}>{erro}</div>}
        <Botao type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar nova senha"}</Botao>
        <button type="button" onClick={() => void signOut()} style={linkBtn}>Cancelar e sair</button>
      </form>
    </Casca>
  );
}
