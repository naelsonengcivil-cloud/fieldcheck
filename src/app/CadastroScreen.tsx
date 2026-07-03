import { useState, type CSSProperties } from "react";
import { Botao, Stripe } from "@/components/ui";
import { T, FONT_HEAD, FONT_BODY } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Cadastro autônomo (M9): cria conta + empresa (trial 14 dias) e
// vira admin. Se o projeto exigir confirmação de e-mail, orienta o
// usuário a confirmar e concluir no primeiro login.
// ============================================================

const PENDENTE = "fc_pending_empresa";

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

export function CadastroScreen({ onVoltar }: { onVoltar: () => void }) {
  const { signUp, criarEmpresaComAdmin } = useAuth();
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function cadastrar() {
    if (!nomeEmpresa.trim() || !nome.trim() || !email.trim() || !senha) {
      setErro("Preencha todos os campos.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const { error, precisaConfirmar } = await signUp(email, senha);
    if (error) {
      setEnviando(false);
      setErro(error);
      return;
    }
    if (precisaConfirmar) {
      // Guarda os dados para concluir a criação após confirmar o e-mail.
      localStorage.setItem(
        PENDENTE,
        JSON.stringify({ nomeEmpresa: nomeEmpresa.trim(), nome: nome.trim() }),
      );
      setEnviando(false);
      setConfirmar(true);
      return;
    }
    // Já logado ⇒ cria empresa + admin agora.
    const res = await criarEmpresaComAdmin(nomeEmpresa.trim(), nome.trim());
    setEnviando(false);
    if (res.error) setErro(res.error);
    // sucesso: o app navega para o shell autenticado.
  }

  if (confirmar) {
    return (
      <Casca titulo="Confirme seu e-mail">
        <div style={{ fontSize: 15, lineHeight: 1.6 }}>
          Enviamos um link de confirmação para <b>{email}</b>. Confirme e faça
          login — a sua empresa será criada automaticamente no primeiro acesso.
        </div>
        <Botao variante="fantasma" onClick={onVoltar}>
          Ir para o login
        </Botao>
      </Casca>
    );
  }

  return (
    <Casca titulo="Criar conta">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void cadastrar();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <Campo label="Nome da empresa" valor={nomeEmpresa} set={setNomeEmpresa} placeholder="Ex.: Construtora Silva" />
        <Campo label="Seu nome" valor={nome} set={setNome} placeholder="Nome do administrador" />
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>E-mail</span>
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
          <span style={rotulo}>Senha</span>
          <input
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            style={campo}
          />
        </label>

        {erro && (
          <div role="alert" style={alerta}>
            {erro}
          </div>
        )}

        <Botao type="submit" disabled={enviando}>
          {enviando ? "Criando…" : "Criar conta e empresa"}
        </Botao>
        <button type="button" onClick={onVoltar} style={linkBtn}>
          Já tenho conta — entrar
        </button>
        <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
          Ao criar a conta você inicia um teste gratuito de 14 dias. FieldCheck é
          um produto da Alpha Inspeções e Auditoria.
        </div>
      </form>
    </Casca>
  );
}

function Campo({
  label,
  valor,
  set,
  placeholder,
}: {
  label: string;
  valor: string;
  set: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={rotulo}>{label}</span>
      <input value={valor} onChange={(e) => set(e.target.value)} placeholder={placeholder} style={campo} />
    </label>
  );
}

const alerta: CSSProperties = {
  background: T.redBg,
  color: T.red,
  border: `1px solid ${T.red}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
};
const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: T.yellowDark,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  padding: 4,
};

function Casca({ titulo, children }: { titulo: string; children: React.ReactNode }) {
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
          <div style={{ fontSize: 13.5, opacity: 0.75, marginTop: 6 }}>{titulo}</div>
        </div>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}
