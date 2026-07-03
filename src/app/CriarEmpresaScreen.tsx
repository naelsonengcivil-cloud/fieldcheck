import { useState, type CSSProperties } from "react";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Onboarding do 1º usuário (M9): sessão válida sem empresa vinculada.
// Cria a empresa (trial) e vincula como admin. Pré-preenche com os
// dados guardados no cadastro (fluxo com confirmação de e-mail).
// ============================================================

const PENDENTE = "fc_pending_empresa";

function lerPendente(): { nomeEmpresa: string; nome: string } {
  try {
    const raw = localStorage.getItem(PENDENTE);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignora */
  }
  return { nomeEmpresa: "", nome: "" };
}

const campo: CSSProperties = {
  border: `2px solid ${T.line}`,
  borderRadius: 12,
  padding: 14,
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
};

export function CriarEmpresaScreen() {
  const { session, criarEmpresaComAdmin, signOut } = useAuth();
  const pend = lerPendente();
  const [nomeEmpresa, setNomeEmpresa] = useState(pend.nomeEmpresa);
  const [nome, setNome] = useState(pend.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar() {
    if (!nomeEmpresa.trim() || !nome.trim()) {
      setErro("Informe o nome da empresa e o seu nome.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const res = await criarEmpresaComAdmin(nomeEmpresa.trim(), nome.trim());
    setEnviando(false);
    if (res.error) {
      setErro(res.error);
      return;
    }
    localStorage.removeItem(PENDENTE);
    // sucesso: recarregarPerfil já rodou → app vai para o shell.
  }

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
      <Header titulo="Bem-vindo!" sub="Configure sua empresa" />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 17,
              textTransform: "uppercase",
              color: T.inkSoft,
              marginBottom: 8,
            }}
          >
            Criar sua empresa
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.6 }}>
            O login de <b>{session?.user.email}</b> ainda não está vinculado a uma
            empresa. Crie a sua para começar — inclui teste gratuito de 14 dias.
          </div>
        </Card>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft }}>Nome da empresa</span>
          <input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex.: Construtora Silva" style={campo} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft }}>Seu nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do administrador" style={campo} />
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

        <Botao onClick={() => void criar()} disabled={enviando}>
          {enviando ? "Criando…" : "Criar empresa e entrar"}
        </Botao>
        <Botao variante="fantasma" onClick={() => void signOut()}>
          Sair
        </Botao>
      </div>
    </div>
  );
}
