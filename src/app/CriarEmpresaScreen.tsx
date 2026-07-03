import { useEffect, useState, type CSSProperties } from "react";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Papel } from "@/types/db";

// ============================================================
// Onboarding do usuário autenticado sem empresa (M9/M10):
//  - se há convite pendente para o e-mail → aceitar (entra na empresa);
//  - senão → criar a própria empresa (trial).
// ============================================================

const PENDENTE = "fc_pending_empresa";
const PAPEL_LABEL: Record<string, string> = {
  inspetor: "Inspetor",
  gestor: "Gestor",
  admin: "Administrador",
};

interface ConvitePendente {
  empresa_id: string;
  empresa_nome: string;
  papel: Papel;
}

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
const alerta: CSSProperties = {
  background: T.redBg,
  color: T.red,
  border: `1px solid ${T.red}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
};
const rotulo: CSSProperties = { fontSize: 13, fontWeight: 600, color: T.inkSoft };

export function CriarEmpresaScreen() {
  const { session, criarEmpresaComAdmin, aceitarConvite, signOut } = useAuth();
  const pend = lerPendente();
  const [nomeEmpresa, setNomeEmpresa] = useState(pend.nomeEmpresa);
  const [nome, setNome] = useState(pend.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [convite, setConvite] = useState<ConvitePendente | null>(null);
  const [buscando, setBuscando] = useState(true);
  const [forcarCriar, setForcarCriar] = useState(false);

  // Detecta convite pendente para o e-mail logado.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabase.rpc("meu_convite_pendente");
      if (!vivo) return;
      const c = Array.isArray(data) && data.length ? (data[0] as ConvitePendente) : null;
      setConvite(c);
      setBuscando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

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
  }

  async function aceitar() {
    if (!nome.trim()) {
      setErro("Informe o seu nome.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const res = await aceitarConvite(nome.trim());
    setEnviando(false);
    if (res.error) {
      setErro(res.error);
      return;
    }
    localStorage.removeItem(PENDENTE);
  }

  const mostrarConvite = convite && !forcarCriar;

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
      <Header titulo="Bem-vindo!" sub={mostrarConvite ? "Você tem um convite" : "Configure sua empresa"} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {buscando ? (
          <div style={{ color: T.inkSoft, fontSize: 14, padding: 8 }}>Verificando convites…</div>
        ) : mostrarConvite ? (
          <>
            <Card style={{ borderColor: T.yellow, background: "#FFF8E6" }}>
              <div style={{ ...(titulo as CSSProperties), color: T.yellowDark }}>Convite recebido</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 8 }}>
                Você foi convidado para <b>{convite!.empresa_nome}</b> como{" "}
                <b>{PAPEL_LABEL[convite!.papel] ?? convite!.papel}</b>.
              </div>
            </Card>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={rotulo}>Seu nome</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como você aparece na equipe" style={campo} />
            </label>
            {erro && <div role="alert" style={alerta}>{erro}</div>}
            <Botao onClick={() => void aceitar()} disabled={enviando}>
              {enviando ? "Entrando…" : "Aceitar convite e entrar"}
            </Botao>
            <button type="button" onClick={() => setForcarCriar(true)} style={linkBtn}>
              Prefiro criar minha própria empresa
            </button>
          </>
        ) : (
          <>
            <Card>
              <div style={titulo}>Criar sua empresa</div>
              <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.6, marginTop: 8 }}>
                O login de <b>{session?.user.email}</b> ainda não está vinculado a
                uma empresa. Crie a sua — inclui teste gratuito de 14 dias.
              </div>
            </Card>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={rotulo}>Nome da empresa</span>
              <input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} placeholder="Ex.: Construtora Silva" style={campo} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={rotulo}>Seu nome</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do administrador" style={campo} />
            </label>
            {erro && <div role="alert" style={alerta}>{erro}</div>}
            <Botao onClick={() => void criar()} disabled={enviando}>
              {enviando ? "Criando…" : "Criar empresa e entrar"}
            </Botao>
            {convite && (
              <button type="button" onClick={() => setForcarCriar(false)} style={linkBtn}>
                Voltar ao convite recebido
              </button>
            )}
          </>
        )}
        <Botao variante="fantasma" onClick={() => void signOut()}>
          Sair
        </Botao>
      </div>
    </div>
  );
}

const titulo = {
  fontFamily: FONT_HEAD,
  fontWeight: 700,
  fontSize: 17,
  textTransform: "uppercase",
  color: T.inkSoft,
} as const;
const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: T.yellowDark,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  padding: 4,
};
