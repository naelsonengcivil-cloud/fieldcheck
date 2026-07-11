import { useEffect, useState } from "react";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { ativarPush, type ResultadoPush } from "@/lib/push";

const ERRO_PUSH: Record<Exclude<ResultadoPush, { ok: true }>["motivo"], string> = {
  permissao: "Permissão de notificação negada nas configurações do dispositivo.",
  sem_suporte: "Este navegador/dispositivo não suporta notificações push.",
  sem_config: "Web push ainda não configurado neste ambiente.",
  erro: "Não foi possível ativar. Tente novamente.",
};

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
  // Notificações push (RF12/M6): preferência do usuário + ativação do dispositivo.
  const [prefPush, setPrefPush] = useState(true);
  const [statusDisp, setStatusDisp] = useState<string | null>(null);
  const [ativando, setAtivando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!perfil?.id) return;
      // Leitura tolerante: bases pré-0026 não têm a coluna → mantém default true.
      const { data } = await supabase
        .from("usuarios")
        .select("notif_push")
        .eq("id", perfil.id)
        .maybeSingle();
      if (vivo && data) setPrefPush((data as { notif_push?: boolean }).notif_push !== false);
    })();
    return () => {
      vivo = false;
    };
  }, [perfil?.id]);

  async function alternarPref(valor: boolean) {
    setPrefPush(valor); // otimista
    const { error } = await supabase.rpc("definir_pref_push", { p_ativo: valor });
    if (error) setPrefPush(!valor); // reverte se falhar
  }

  async function ativarDispositivo() {
    setAtivando(true);
    setStatusDisp(null);
    const r = await ativarPush(true);
    setStatusDisp(r.ok ? "Notificações ativadas neste dispositivo ✓" : ERRO_PUSH[r.motivo]);
    setAtivando(false);
  }

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

        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft, marginBottom: 10 }}>
            Notificações
          </div>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
            <span style={{ fontSize: 14, color: T.ink }}>
              Receber avisos de NC (atribuída, prazo, aprovação)
            </span>
            <input
              type="checkbox"
              checked={prefPush}
              onChange={(e) => void alternarPref(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: T.green, cursor: "pointer", flexShrink: 0 }}
            />
          </label>
          <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 12, paddingTop: 12 }}>
            <Botao variante="fantasma" onClick={() => void ativarDispositivo()} disabled={ativando || !prefPush}>
              {ativando ? "Ativando…" : "Ativar notificações neste dispositivo"}
            </Botao>
            {statusDisp && (
              <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 8 }}>{statusDisp}</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
