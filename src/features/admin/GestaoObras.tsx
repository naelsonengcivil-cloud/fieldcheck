import { useCallback, useEffect, useMemo, useState } from "react";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { ROTULO_STATUS, transicoesPermitidas } from "@/lib/obraStatus";
import { definirKitDaObra } from "@/lib/kitService";
import type { Obra, StatusObra, Kit } from "@/types/db";

// ============================================================
// Gestão de obras (Marco A / M13) — só admin. Criar, editar (nome/
// cliente), mudar status (com confirmação) e excluir (só se sem
// inspeções). Filtro "mostrar arquivadas". Dados frescos do Supabase.
// ============================================================

export function GestaoObras({ onBack }: { onBack: () => void }) {
  const { perfil } = useAuth();
  const [obras, setObras] = useState<Obra[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [contagem, setContagem] = useState<Map<string, number>>(new Map());
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCliente, setEditCliente] = useState("");
  const [confirmar, setConfirmar] = useState<{ texto: string; onSim: () => void } | null>(null);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [o, i, k] = await Promise.all([
      supabase.from("obras").select("id, empresa_id, nome, cliente, status, ativa, kit_id").order("nome"),
      supabase.from("inspecoes").select("obra_id"),
      supabase.from("kits").select("id, nome, empresa_id, descricao, ativo").eq("ativo", true).order("nome"),
    ]);
    setObras((o.data as Obra[]) ?? []);
    setKits((k.data as Kit[]) ?? []);
    const m = new Map<string, number>();
    for (const row of (i.data as { obra_id: string }[]) ?? []) {
      m.set(row.obra_id, (m.get(row.obra_id) ?? 0) + 1);
    }
    setContagem(m);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mostrar(msg: string, ok: boolean) {
    setAviso({ msg, ok });
    setTimeout(() => setAviso(null), 3500);
  }

  const visiveis = useMemo(
    () => obras.filter((o) => mostrarArquivadas || o.status !== "arquivada"),
    [obras, mostrarArquivadas],
  );
  const arquivadas = obras.filter((o) => o.status === "arquivada").length;

  async function criar() {
    if (!nome.trim()) return mostrar("Informe o nome da obra.", false);
    if (!perfil) return;
    setSalvando(true);
    const { error } = await supabase.from("obras").insert({
      empresa_id: perfil.empresa_id,
      nome: nome.trim(),
      cliente: cliente.trim() || null,
    });
    setSalvando(false);
    if (error) return mostrar(traduz(error.message), false);
    setNome("");
    setCliente("");
    mostrar("Obra criada.", true);
    void carregar();
  }

  async function salvarEdicao(id: string) {
    if (!editNome.trim()) return mostrar("Nome não pode ficar vazio.", false);
    const { error } = await supabase
      .from("obras")
      .update({ nome: editNome.trim(), cliente: editCliente.trim() || null })
      .eq("id", id);
    if (error) return mostrar(traduz(error.message), false);
    setEditando(null);
    mostrar("Obra atualizada.", true);
    void carregar();
  }

  function pedirMudarStatus(o: Obra, novo: StatusObra) {
    setConfirmar({
      texto: `Mudar "${o.nome}" para ${ROTULO_STATUS[novo]}?`,
      onSim: async () => {
        const { error } = await supabase.from("obras").update({ status: novo }).eq("id", o.id);
        if (error) mostrar(traduz(error.message), false);
        else {
          mostrar(`Status alterado para ${ROTULO_STATUS[novo]}.`, true);
          void carregar();
        }
      },
    });
  }

  function pedirExcluir(o: Obra) {
    const n = contagem.get(o.id) ?? 0;
    if (n > 0) {
      return mostrar(
        `"${o.nome}" tem ${n} inspeção(ões). Não pode ser excluída — finalize ou arquive.`,
        false,
      );
    }
    setConfirmar({
      texto: `Excluir a obra "${o.nome}"? Esta ação é permanente.`,
      onSim: async () => {
        const { error } = await supabase.from("obras").delete().eq("id", o.id);
        if (error) mostrar(traduz(error.message), false);
        else {
          mostrar("Obra excluída.", true);
          void carregar();
        }
      },
    });
  }

  return (
    <div>
      <Header titulo="Obras" sub="Gerencie as obras da empresa" onBack={onBack} />
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
        <Card>
          <div style={titulo}>Nova obra</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da obra" style={{ ...inputStyle, fontSize: 15 }} />
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente (opcional)" style={{ ...inputStyle, fontSize: 15 }} />
            <Botao onClick={() => void criar()} disabled={salvando}>
              {salvando ? "Criando…" : "Criar obra"}
            </Botao>
          </div>
        </Card>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" checked={mostrarArquivadas} onChange={(e) => setMostrarArquivadas(e.target.checked)} style={{ width: 18, height: 18 }} />
          Mostrar arquivadas {arquivadas > 0 && `(${arquivadas})`}
        </label>

        {visiveis.map((o) => {
          const emEdicao = editando === o.id;
          return (
            <Card key={o.id}>
              {emEdicao ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={editNome} onChange={(e) => setEditNome(e.target.value)} style={{ ...inputStyle, fontSize: 15 }} />
                  <input value={editCliente} onChange={(e) => setEditCliente(e.target.value)} placeholder="Cliente" style={{ ...inputStyle, fontSize: 15 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Botao onClick={() => void salvarEdicao(o.id)} style={{ fontSize: 14 }}>Salvar</Botao>
                    <Botao variante="fantasma" onClick={() => setEditando(null)} style={{ fontSize: 14 }}>Cancelar</Botao>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{o.nome}</div>
                      <div style={{ fontSize: 12.5, color: T.inkSoft }}>
                        {o.cliente || "sem cliente"} · {contagem.get(o.id) ?? 0} inspeções
                      </div>
                    </div>
                    <span style={selo(o.status)}>{ROTULO_STATUS[o.status]}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    <button
                      onClick={() => {
                        setEditando(o.id);
                        setEditNome(o.nome);
                        setEditCliente(o.cliente ?? "");
                      }}
                      style={acaoBtn(T.navy)}
                    >
                      Editar
                    </button>
                    {transicoesPermitidas(o.status).map((s) => (
                      <button key={s} onClick={() => pedirMudarStatus(o, s)} style={acaoBtn(T.yellowDark)}>
                        → {ROTULO_STATUS[s]}
                      </button>
                    ))}
                    <button onClick={() => pedirExcluir(o)} style={acaoBtn(T.red)}>
                      Excluir
                    </button>
                  </div>
                  {kits.length > 0 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: T.inkSoft }}>
                      <span style={{ fontWeight: 700 }}>Kit:</span>
                      <select
                        value={o.kit_id ?? ""}
                        onChange={async (e) => {
                          const { error } = await definirKitDaObra(o.id, e.target.value || null);
                          if (error) mostrar(error, false);
                          else { mostrar("Kit da obra atualizado.", true); void carregar(); }
                        }}
                        style={{ ...inputStyle, width: "auto", flex: 1, fontSize: 13, padding: "6px 8px" }}
                      >
                        <option value="">— nenhum (todos os checklists) —</option>
                        {kits.map((k) => (
                          <option key={k.id} value={k.id}>{k.nome}{k.empresa_id ? "" : " (modelo)"}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
            </Card>
          );
        })}
        {visiveis.length === 0 && (
          <div style={{ textAlign: "center", color: T.inkSoft, padding: 20, fontSize: 14 }}>
            Nenhuma obra {mostrarArquivadas ? "" : "ativa "}cadastrada.
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
              <Botao
                onClick={() => {
                  const fn = confirmar.onSim;
                  setConfirmar(null);
                  void fn();
                }}
              >
                Confirmar
              </Botao>
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
    return "A obra tem inspeções vinculadas — finalize ou arquive.";
  if (m.includes("row-level security") || m.includes("permission"))
    return "Apenas administradores gerenciam obras.";
  return "Não foi possível concluir. Tente novamente.";
}

const titulo = { fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft } as const;
const acaoBtn = (cor: string) =>
  ({ background: "none", border: `1px solid ${cor}`, color: cor, fontWeight: 700, fontSize: 12.5, cursor: "pointer", borderRadius: 8, padding: "6px 10px" }) as const;
function selo(status: StatusObra) {
  const c = status === "finalizada" ? T.inkSoft : status === "arquivada" ? T.red : T.green;
  return {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: c,
    border: `1px solid ${c}`,
    borderRadius: 6,
    padding: "2px 6px",
    flexShrink: 0,
  } as const;
}
