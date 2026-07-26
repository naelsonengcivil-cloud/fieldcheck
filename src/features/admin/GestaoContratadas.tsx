import { useCallback, useEffect, useMemo, useState } from "react";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Contratada } from "@/types/db";

// ============================================================
// Gestão de contratadas (Marco B2 / M17) — admin/gestor. Cadastra as
// empresas executoras da empresa cliente; a executora (papel) fica
// vinculada a uma delas e só trata as NCs das suas frentes. Excluir só
// se não houver inspeções nem usuários vinculados (senão, desative).
// ============================================================

export function GestaoContratadas({ onBack }: { onBack: () => void }) {
  const { perfil } = useAuth();
  const [contratadas, setContratadas] = useState<Contratada[]>([]);
  const [usoInsp, setUsoInsp] = useState<Map<string, number>>(new Map());
  const [usoUser, setUsoUser] = useState<Map<string, number>>(new Map());
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [confirmar, setConfirmar] = useState<{ texto: string; onSim: () => void } | null>(null);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [c, i, u] = await Promise.all([
      supabase.from("contratadas").select("id, empresa_id, nome, cnpj, ativa").order("nome"),
      supabase.from("inspecoes").select("contratada_id").is("excluido_em", null),
      supabase.from("usuarios").select("contratada_id"),
    ]);
    setContratadas((c.data as Contratada[]) ?? []);
    const conta = (rows: { contratada_id: string | null }[] | null) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) if (r.contratada_id) m.set(r.contratada_id, (m.get(r.contratada_id) ?? 0) + 1);
      return m;
    };
    setUsoInsp(conta(i.data as { contratada_id: string | null }[]));
    setUsoUser(conta(u.data as { contratada_id: string | null }[]));
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mostrar(msg: string, ok: boolean) {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 3500);
  }

  const ativas = useMemo(() => contratadas.filter((c) => c.ativa).length, [contratadas]);

  async function criar() {
    if (!nome.trim()) return mostrar("Informe o nome da contratada.", false);
    if (!perfil) return;
    setSalvando(true);
    const { error } = await supabase.from("contratadas").insert({
      empresa_id: perfil.empresa_id,
      nome: nome.trim(),
      cnpj: cnpj.trim() || null,
    });
    setSalvando(false);
    if (error) return mostrar(traduz(error.message), false);
    setNome("");
    setCnpj("");
    mostrar("Contratada cadastrada.", true);
    void carregar();
  }

  async function salvarEdicao(id: string) {
    if (!editNome.trim()) return mostrar("Nome não pode ficar vazio.", false);
    const { error } = await supabase
      .from("contratadas")
      .update({ nome: editNome.trim(), cnpj: editCnpj.trim() || null })
      .eq("id", id);
    if (error) return mostrar(traduz(error.message), false);
    setEditando(null);
    mostrar("Contratada atualizada.", true);
    void carregar();
  }

  async function alternarAtiva(c: Contratada) {
    const { error } = await supabase.from("contratadas").update({ ativa: !c.ativa }).eq("id", c.id);
    if (error) mostrar(traduz(error.message), false);
    else {
      mostrar(c.ativa ? "Contratada desativada." : "Contratada ativada.", true);
      void carregar();
    }
  }

  function pedirExcluir(c: Contratada) {
    const nInsp = usoInsp.get(c.id) ?? 0;
    const nUser = usoUser.get(c.id) ?? 0;
    if (nInsp > 0 || nUser > 0) {
      return mostrar(
        `"${c.nome}" tem ${nInsp} inspeção(ões) e ${nUser} usuário(s) vinculados — desative em vez de excluir.`,
        false,
      );
    }
    setConfirmar({
      texto: `Excluir a contratada "${c.nome}"? Esta ação é permanente.`,
      onSim: async () => {
        const { error } = await supabase.from("contratadas").delete().eq("id", c.id);
        if (error) mostrar(traduz(error.message), false);
        else {
          mostrar("Contratada excluída.", true);
          void carregar();
        }
      },
    });
  }

  return (
    <div>
      <Header titulo="Contratadas" sub="Empresas executoras da sua empresa" onBack={onBack} />
      {aviso && (
        <div
          role="status"
          style={{ padding: "10px 14px", background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}
        >
          {aviso.msg}
        </div>
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={titulo}>Nova contratada</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da contratada" style={{ ...inputStyle, fontSize: 15 }} />
            <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="CNPJ (opcional)" style={{ ...inputStyle, fontSize: 15 }} />
            <Botao onClick={() => void criar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Cadastrar"}
            </Botao>
          </div>
        </Card>

        <div style={{ fontSize: 12.5, color: T.inkSoft }}>{ativas} ativa(s) de {contratadas.length}</div>

        {contratadas.map((c) => {
          const emEdicao = editando === c.id;
          return (
            <Card key={c.id} style={c.ativa ? {} : { opacity: 0.6 }}>
              {emEdicao ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={editNome} onChange={(e) => setEditNome(e.target.value)} style={{ ...inputStyle, fontSize: 15 }} />
                  <input value={editCnpj} onChange={(e) => setEditCnpj(e.target.value)} placeholder="CNPJ" style={{ ...inputStyle, fontSize: 15 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Botao onClick={() => void salvarEdicao(c.id)} style={{ fontSize: 14 }}>Salvar</Botao>
                    <Botao variante="fantasma" onClick={() => setEditando(null)} style={{ fontSize: 14 }}>Cancelar</Botao>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{c.nome}</div>
                      <div style={{ fontSize: 12.5, color: T.inkSoft }}>
                        {c.cnpj || "sem CNPJ"} · {usoInsp.get(c.id) ?? 0} insp · {usoUser.get(c.id) ?? 0} usuário(s)
                      </div>
                    </div>
                    {!c.ativa && <span style={selo}>inativa</span>}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    <button
                      onClick={() => { setEditando(c.id); setEditNome(c.nome); setEditCnpj(c.cnpj ?? ""); }}
                      style={acaoBtn(T.navy)}
                    >
                      Editar
                    </button>
                    <button onClick={() => void alternarAtiva(c)} style={acaoBtn(T.yellowDark)}>
                      {c.ativa ? "Desativar" : "Ativar"}
                    </button>
                    <button onClick={() => pedirExcluir(c)} style={acaoBtn(T.red)}>
                      Excluir
                    </button>
                  </div>
                </>
              )}
            </Card>
          );
        })}
        {contratadas.length === 0 && (
          <div style={{ textAlign: "center", color: T.inkSoft, padding: 20, fontSize: 14 }}>
            Nenhuma contratada cadastrada.
          </div>
        )}
      </div>

      {confirmar && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setConfirmar(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "18px 18px 0 0", padding: 18, width: "100%", maxWidth: 520 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, marginBottom: 14 }}>{confirmar.texto}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Botao onClick={() => { const fn = confirmar.onSim; setConfirmar(null); void fn(); }}>Confirmar</Botao>
              <Botao variante="fantasma" onClick={() => setConfirmar(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function traduz(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("violates foreign key") || m.includes("still referenced"))
    return "Contratada com vínculos — desative em vez de excluir.";
  if (m.includes("row-level security") || m.includes("permission"))
    return "Apenas gestor ou administrador gerencia contratadas.";
  return "Não foi possível concluir. Tente novamente.";
}

const titulo = { fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft } as const;
const acaoBtn = (cor: string) =>
  ({ background: "none", border: `1px solid ${cor}`, color: cor, fontWeight: 700, fontSize: 12.5, cursor: "pointer", borderRadius: 8, padding: "6px 10px" }) as const;
const selo = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: T.red,
  border: `1px solid ${T.red}`,
  borderRadius: 6,
  padding: "2px 6px",
  flexShrink: 0,
} as const;
