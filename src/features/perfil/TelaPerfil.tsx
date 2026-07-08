import { useState } from "react";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";

// ============================================================
// Perfil / conta (Marco H): dados do usuário + troca de senha do próprio
// usuário logado (updateUser via redefinirSenha do AuthProvider).
// ============================================================

const PAPEL_LABEL: Record<string, string> = {
  inspetor: "Inspetor",
  gestor: "Gestor",
  admin: "Administrador",
  executora: "Executora",
};

export function TelaPerfil({ onBack }: { onBack: () => void }) {
  const { perfil, empresa, session, redefinirSenha } = useAuth();
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);

  async function alterar() {
    if (senha.length < 6) return setAviso({ msg: "A senha precisa ter ao menos 6 caracteres.", ok: false });
    if (senha !== conf) return setAviso({ msg: "As senhas não coincidem.", ok: false });
    setSalvando(true);
    const { error } = await redefinirSenha(senha);
    setSalvando(false);
    if (error) setAviso({ msg: error, ok: false });
    else {
      setSenha("");
      setConf("");
      setAviso({ msg: "Senha alterada com sucesso.", ok: true });
    }
  }

  return (
    <div>
      <Header titulo="Perfil" sub="Sua conta" onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{perfil?.nome ?? "—"}</div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>{session?.user.email}</div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
            {perfil ? PAPEL_LABEL[perfil.papel] ?? perfil.papel : "—"}
            {empresa ? ` · ${empresa.nome}` : ""}
          </div>
        </Card>

        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>
            Alterar senha
          </div>
          {aviso && (
            <div style={{ background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>
              {aviso.msg}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha (mín. 6)" style={{ ...inputStyle, fontSize: 15 }} />
            <input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="Confirmar nova senha" style={{ ...inputStyle, fontSize: 15 }} />
            <Botao onClick={() => void alterar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar nova senha"}</Botao>
          </div>
        </Card>
      </div>
    </div>
  );
}
