import { useCallback, useEffect, useState } from "react";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Contratada, Convite, Papel, Usuario } from "@/types/db";

// ============================================================
// Gestão de usuários (RF14 / M10) — só para admin. Lista usuários da
// empresa, convida por e-mail (papel), altera papel e ativa/desativa.
// M17: papel 'executora' vinculado a uma contratada.
// Dados frescos do Supabase (não do cache offline).
// ============================================================

const PAPEIS: Papel[] = ["inspetor", "gestor", "admin", "executora"];
const PAPEL_LABEL: Record<Papel, string> = {
  inspetor: "Inspetor",
  gestor: "Gestor",
  admin: "Administrador",
  executora: "Executora",
};

export function GestaoUsuarios({ onBack }: { onBack: () => void }) {
  const { perfil } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [contratadas, setContratadas] = useState<Contratada[]>([]);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("inspetor");
  const [contratadaId, setContratadaId] = useState("");
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [convidando, setConvidando] = useState(false);

  const carregar = useCallback(async () => {
    const [u, c, ct] = await Promise.all([
      supabase.from("usuarios").select("id, empresa_id, nome, papel, ativo, contratada_id").order("nome"),
      supabase
        .from("convites")
        .select("id, empresa_id, email, papel, contratada_id, status, criado_em, expira_em")
        .eq("status", "pendente")
        .order("criado_em", { ascending: false }),
      supabase.from("contratadas").select("id, empresa_id, nome, cnpj, ativa").eq("ativa", true).order("nome"),
    ]);
    setUsuarios((u.data as Usuario[]) ?? []);
    setConvites((c.data as Convite[]) ?? []);
    setContratadas((ct.data as Contratada[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mostrar(msg: string, ok: boolean) {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 3500);
  }

  async function convidar() {
    if (!email.trim()) {
      mostrar("Informe o e-mail.", false);
      return;
    }
    if (papel === "executora" && !contratadaId) {
      mostrar("Selecione a contratada da executora.", false);
      return;
    }
    setConvidando(true);
    const { error } = await supabase.rpc("convidar_usuario", {
      p_email: email.trim(),
      p_papel: papel,
      p_contratada_id: papel === "executora" ? contratadaId : null,
    });
    setConvidando(false);
    if (error) {
      mostrar(traduz(error.message), false);
      return;
    }
    setEmail("");
    setContratadaId("");
    mostrar("Convite criado. O usuário entra ao se cadastrar com esse e-mail.", true);
    void carregar();
  }

  async function alterarContratada(id: string, novo: string) {
    const { error } = await supabase.from("usuarios").update({ contratada_id: novo || null }).eq("id", id);
    if (error) mostrar(traduz(error.message), false);
    else {
      mostrar("Contratada do usuário atualizada.", true);
      void carregar();
    }
  }

  const nomeContratada = (id: string | null | undefined) =>
    id ? (contratadas.find((c) => c.id === id)?.nome ?? "—") : "—";

  async function alterarPapel(id: string, novo: Papel) {
    const { error } = await supabase.from("usuarios").update({ papel: novo }).eq("id", id);
    if (error) mostrar(traduz(error.message), false);
    else {
      mostrar("Papel atualizado.", true);
      void carregar();
    }
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    const { error } = await supabase.from("usuarios").update({ ativo }).eq("id", id);
    if (error) mostrar(traduz(error.message), false);
    else {
      mostrar(ativo ? "Usuário ativado." : "Usuário desativado.", true);
      void carregar();
    }
  }

  async function cancelarConvite(id: string) {
    const { error } = await supabase.from("convites").update({ status: "cancelado" }).eq("id", id);
    if (error) mostrar(traduz(error.message), false);
    else {
      mostrar("Convite cancelado.", true);
      void carregar();
    }
  }

  return (
    <div>
      <Header titulo="Usuários" sub="Gerencie sua equipe" onBack={onBack} />
      {aviso && (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            background: aviso.ok ? T.greenBg : T.redBg,
            color: aviso.ok ? T.green : T.red,
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {aviso.msg}
        </div>
      )}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Convidar */}
        <Card>
          <div style={titulo}>Convidar usuário</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com"
              style={{ ...inputStyle, fontSize: 15 }}
            />
            <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)} style={inputStyle}>
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {PAPEL_LABEL[p]}
                </option>
              ))}
            </select>
            {papel === "executora" && (
              contratadas.length > 0 ? (
                <select value={contratadaId} onChange={(e) => setContratadaId(e.target.value)} style={inputStyle}>
                  <option value="">Selecione a contratada…</option>
                  {contratadas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 12.5, color: T.red, fontWeight: 600 }}>
                  Cadastre uma contratada antes (Gerenciar contratadas).
                </div>
              )
            )}
            <Botao onClick={() => void convidar()} disabled={convidando}>
              {convidando ? "Convidando…" : "Enviar convite"}
            </Botao>
            <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}>
              O convidado deve se cadastrar (tela "Criar conta") com este mesmo
              e-mail; o vínculo à empresa é automático.
            </div>
          </div>
        </Card>

        {/* Convites pendentes */}
        {convites.length > 0 && (
          <Card>
            <div style={titulo}>Convites pendentes ({convites.length})</div>
            {convites.map((c) => (
              <div key={c.id} style={linha}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.email}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.inkSoft }}>
                    {PAPEL_LABEL[c.papel]}
                    {c.papel === "executora" && ` · ${nomeContratada(c.contratada_id)}`}
                  </div>
                </div>
                <button onClick={() => void cancelarConvite(c.id)} style={btnLink(T.red)}>
                  Cancelar
                </button>
              </div>
            ))}
          </Card>
        )}

        {/* Usuários */}
        <Card>
          <div style={titulo}>Equipe ({usuarios.length})</div>
          {carregando && <div style={{ color: T.inkSoft, fontSize: 14, padding: 8 }}>Carregando…</div>}
          {usuarios.map((u) => {
            const ehVoce = u.id === perfil?.id;
            return (
              <div key={u.id} style={{ ...linha, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                    {u.nome} {ehVoce && <span style={{ color: T.inkSoft, fontWeight: 400 }}>(você)</span>}
                    {!u.ativo && <span style={{ color: T.red, fontWeight: 700 }}> · inativo</span>}
                  </div>
                  {u.papel === "executora" && (
                    <div style={{ fontSize: 12, color: T.inkSoft }}>
                      Contratada: {nomeContratada(u.contratada_id)}
                    </div>
                  )}
                </div>
                <select
                  value={u.papel}
                  disabled={ehVoce}
                  onChange={(e) => void alterarPapel(u.id, e.target.value as Papel)}
                  style={{ ...inputStyle, width: "auto", fontSize: 13, padding: "6px 8px" }}
                >
                  {PAPEIS.map((p) => (
                    <option key={p} value={p}>
                      {PAPEL_LABEL[p]}
                    </option>
                  ))}
                </select>
                {!ehVoce && (
                  <button onClick={() => void alternarAtivo(u.id, !u.ativo)} style={btnLink(u.ativo ? T.red : T.green)}>
                    {u.ativo ? "Desativar" : "Ativar"}
                  </button>
                )}
                {u.papel === "executora" && !ehVoce && contratadas.length > 0 && (
                  <select
                    value={u.contratada_id ?? ""}
                    onChange={(e) => void alterarContratada(u.id, e.target.value)}
                    style={{ ...inputStyle, width: "100%", fontSize: 13, padding: "6px 8px" }}
                  >
                    <option value="">— sem contratada —</option>
                    {contratadas.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

function traduz(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("já é usuário")) return "Esse e-mail já é usuário da empresa.";
  if (m.includes("administradores")) return "Apenas administradores podem convidar.";
  if (m.includes("papel inválido")) return "Papel inválido.";
  if (m.includes("contratada")) return "Selecione uma contratada válida para a executora.";
  return "Não foi possível concluir. Tente novamente.";
}

const titulo = {
  fontFamily: FONT_HEAD,
  fontWeight: 700,
  fontSize: 15,
  textTransform: "uppercase",
  color: T.inkSoft,
} as const;
const linha = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 0",
  borderTop: `1px solid ${T.line}`,
} as const;
const btnLink = (cor: string) =>
  ({
    background: "none",
    border: "none",
    color: cor,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
  }) as const;
