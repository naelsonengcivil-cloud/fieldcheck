import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import { useAuth } from "@/features/auth/AuthProvider";
import { MODULOS, ROTULO_MODULO } from "@/lib/catalogoDimensoes";
import { salvarKit, excluirKit } from "@/lib/kitService";
import type { Kit, Checklist } from "@/types/db";

// ============================================================
// Gestão de Kits de Obra (Marco E · E6) — admin. Modelos do sistema
// (empresa_id null) são só leitura; a empresa cria os seus, escolhendo os
// checklists (padrão + personalizados). A obra adota um kit em "Obras".
// ============================================================

export function GestaoKits({ onBack }: { onBack: () => void }) {
  const { perfil } = useAuth();
  const checklists = useLiveQuery(() => db.checklists.toArray(), [], []);
  const [kits, setKits] = useState<Kit[]>([]);
  const [contagem, setContagem] = useState<Map<string, number>>(new Map());
  const [modo, setModo] = useState<"lista" | "editor">("lista");
  const [editId, setEditId] = useState<string | undefined>();
  const [nome, setNome] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [k, kc] = await Promise.all([
      supabase.from("kits").select("*").order("nome"),
      supabase.from("kit_checklists").select("kit_id"),
    ]);
    setKits((k.data as Kit[]) ?? []);
    const m = new Map<string, number>();
    for (const r of (kc.data as { kit_id: string }[]) ?? []) m.set(r.kit_id, (m.get(r.kit_id) ?? 0) + 1);
    setContagem(m);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  function mostrar(msg: string, ok: boolean) { setAviso({ msg, ok }); setTimeout(() => setAviso(null), 3500); }

  function novo() { setEditId(undefined); setNome(""); setSel(new Set()); setModo("editor"); }
  async function editar(k: Kit) {
    setEditId(k.id); setNome(k.nome);
    const kc = (await supabase.from("kit_checklists").select("checklist_id").eq("kit_id", k.id)).data as { checklist_id: string }[] ?? [];
    setSel(new Set(kc.map((r) => r.checklist_id)));
    setModo("editor");
  }

  async function salvar() {
    if (!perfil) return;
    setSalvando(true);
    const { error } = await salvarKit(perfil.empresa_id, { id: editId, nome }, [...sel]);
    setSalvando(false);
    if (error) return mostrar(error, false);
    mostrar("Kit salvo.", true);
    setModo("lista");
    void carregar();
  }

  const grupos = useMemo(() => {
    const m = new Map<string, Checklist[]>();
    for (const c of checklists) if (c.ativo !== false) (m.get(c.modulo ?? "_") ?? m.set(c.modulo ?? "_", []).get(c.modulo ?? "_")!).push(c);
    return [...MODULOS, "_"].filter((k) => m.has(k)).map((k) => ({ modulo: k, rotulo: k === "_" ? "Outros" : ROTULO_MODULO[k as keyof typeof ROTULO_MODULO], itens: m.get(k)!.sort((a, b) => a.codigo.localeCompare(b.codigo)) }));
  }, [checklists]);

  if (modo === "editor") {
    return (
      <div>
        <Header titulo={editId ? "Editar kit" : "Novo kit"} sub={`${sel.size} checklist(s)`} onBack={() => setModo("lista")} />
        {aviso && <Aviso aviso={aviso} />}
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={rot}>Nome do kit</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Kit UFV da empresa" style={{ ...inputStyle, fontSize: 15 }} />
          </label>
          {grupos.map((g) => (
            <div key={g.modulo}>
              <div style={{ ...rot, color: T.yellowDark, marginBottom: 4 }}>{g.rotulo}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {g.itens.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "4px 0" }}>
                    <input
                      type="checkbox"
                      checked={sel.has(c.id)}
                      onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; })}
                      style={{ width: 18, height: 18 }}
                    />
                    <b style={{ color: T.navy }}>{c.codigo}</b> {c.nome}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <Botao onClick={() => void salvar()} disabled={salvando || !nome.trim()}>{salvando ? "Salvando…" : "Salvar kit"}</Botao>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header titulo="Kits de Obra" sub="Modelos do sistema + os seus" onBack={onBack} />
      {aviso && <Aviso aviso={aviso} />}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Botao onClick={novo}>+ Novo kit</Botao>
        {kits.map((k) => {
          const modelo = k.empresa_id == null;
          return (
            <Card key={k.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{k.nome}</div>
                  <div style={{ fontSize: 12, color: T.inkSoft }}>{contagem.get(k.id) ?? 0} checklists · {modelo ? "modelo do sistema" : "da empresa"}</div>
                </div>
                {!modelo && <button onClick={() => void editar(k)} style={acaoBtn(T.navy)}>Editar</button>}
                {!modelo && <button onClick={() => void (async () => { const { error } = await excluirKit(k.id); if (error) mostrar(error, false); else { mostrar("Kit excluído.", true); void carregar(); } })()} style={acaoBtn(T.red)}>Excluir</button>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Aviso({ aviso }: { aviso: { msg: string; ok: boolean } }) {
  return <div role="status" style={{ padding: "10px 14px", background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}>{aviso.msg}</div>;
}
const rot = { fontSize: 13, fontWeight: 700, color: T.inkSoft, fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.3 } as const;
const acaoBtn = (cor: string) => ({ background: "none", border: `1px solid ${cor}`, color: cor, fontWeight: 700, fontSize: 12.5, cursor: "pointer", borderRadius: 8, padding: "6px 10px", flexShrink: 0 }) as const;
