import { useCallback, useEffect, useMemo, useState } from "react";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/db";
import { baixarCatalogo } from "@/lib/catalogo";
import { useAuth } from "@/features/auth/AuthProvider";
import { MODULOS, TIPOS, ROTULO_MODULO, ROTULO_TIPO } from "@/lib/catalogoDimensoes";
import {
  gerarCodigo,
  prepararClone,
  salvarChecklistCustom,
  excluirChecklistCustom,
  type DadosChecklistCustom,
  type ItemCustom,
} from "@/lib/checklistCustom";
import type { Checklist, ItemChecklist, ModuloChecklist, TipoChecklist } from "@/types/db";

// ============================================================
// Criador de checklists personalizados (Marco E · E5) — admin. Cria do
// zero ou clona a partir de um checklist padrão; itens (texto + critério);
// referência e dimensões. Salva com empresa_id (RLS restringe à empresa).
// ============================================================

export function GestaoChecklists({ onBack }: { onBack: () => void }) {
  const { perfil } = useAuth();
  const [empresaCks, setEmpresaCks] = useState<Checklist[]>([]);
  const [padroes, setPadroes] = useState<Checklist[]>([]);
  const [modo, setModo] = useState<"lista" | "editor">("lista");
  const [dados, setDados] = useState<DadosChecklistCustom | null>(null);
  const [itens, setItens] = useState<ItemCustom[]>([]);
  const [aviso, setAviso] = useState<{ msg: string; ok: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!perfil) return;
    const [e, p] = await Promise.all([
      supabase.from("checklists").select("*").eq("empresa_id", perfil.empresa_id).order("codigo"),
      supabase.from("checklists").select("*").is("empresa_id", null).eq("ativo", true).order("codigo"),
    ]);
    setEmpresaCks((e.data as Checklist[]) ?? []);
    setPadroes((p.data as Checklist[]) ?? []);
  }, [perfil]);
  useEffect(() => { void carregar(); }, [carregar]);

  function mostrar(msg: string, ok: boolean) { setAviso({ msg, ok }); setTimeout(() => setAviso(null), 3500); }

  function novo(modulo: ModuloChecklist = "civil") {
    setDados({ codigo: gerarCodigo(modulo, empresaCks), modulo, tipo: "qualidade", nome: "", fase: "", referencia_documento: "", nrs_relacionadas: [], exige_projeto_ref: false });
    setItens([{ ordem: 1, texto: "", criterio: "" }]);
    setModo("editor");
  }

  async function editar(c: Checklist) {
    const its = await db.itens.where("checklist_id").equals(c.id).toArray();
    setDados({
      id: c.id, codigo: c.codigo, modulo: (c.modulo ?? "transversal") as ModuloChecklist,
      tipo: (c.tipo ?? "qualidade") as TipoChecklist, nome: c.nome, fase: c.fase ?? "",
      referencia_documento: c.referencia_documento ?? c.referencia ?? "", nrs_relacionadas: c.nrs_relacionadas ?? [],
      exige_projeto_ref: !!c.exige_projeto_ref,
    });
    setItens(its.length ? its.sort((a, b) => a.ordem - b.ordem).map((i) => ({ ordem: i.ordem, texto: i.texto, criterio: i.criterio })) : [{ ordem: 1, texto: "", criterio: "" }]);
    setModo("editor");
  }

  async function clonar(padraoId: string) {
    const base = padroes.find((p) => p.id === padraoId);
    if (!base) return;
    const its = (await supabase.from("itens_checklist").select("*").eq("checklist_id", padraoId)).data as ItemChecklist[] ?? [];
    const modulo = (base.modulo ?? "transversal") as ModuloChecklist;
    const clone = prepararClone(base, its, gerarCodigo(modulo, empresaCks));
    setDados(clone.dados);
    setItens(clone.itens);
    setModo("editor");
  }

  function patchItem(i: number, campo: Partial<ItemCustom>) {
    setItens((arr) => arr.map((it, j) => (j === i ? { ...it, ...campo } : it)));
  }

  async function salvar() {
    if (!perfil || !dados) return;
    if (!dados.nome.trim()) return mostrar("Informe o nome do checklist.", false);
    if (!itens.some((i) => i.texto.trim())) return mostrar("Adicione ao menos um item.", false);
    setSalvando(true);
    const numerados = itens.filter((i) => i.texto.trim()).map((i, idx) => ({ ...i, ordem: idx + 1 }));
    const { error } = await salvarChecklistCustom(perfil.empresa_id, dados, numerados);
    if (!error) { try { await baixarCatalogo(db, supabase); } catch { /* sem rede */ } }
    setSalvando(false);
    if (error) return mostrar(error, false);
    mostrar("Checklist salvo.", true);
    setModo("lista");
    void carregar();
  }

  const padroesPorMod = useMemo(() => {
    const m = new Map<string, Checklist[]>();
    for (const p of padroes) (m.get(p.modulo ?? "_") ?? m.set(p.modulo ?? "_", []).get(p.modulo ?? "_")!).push(p);
    return m;
  }, [padroes]);

  if (modo === "editor" && dados) {
    return (
      <div>
        <Header titulo={dados.id ? "Editar checklist" : "Novo checklist"} sub={dados.codigo} onBack={() => setModo("lista")} />
        {aviso && <Aviso aviso={aviso} />}
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={campo}>
              <span style={rot}>Módulo</span>
              <select value={dados.modulo} onChange={(e) => { const modulo = e.target.value as ModuloChecklist; setDados({ ...dados, modulo, codigo: dados.id ? dados.codigo : gerarCodigo(modulo, empresaCks) }); }} style={inputStyle}>
                {MODULOS.map((m) => <option key={m} value={m}>{ROTULO_MODULO[m]}</option>)}
              </select>
            </label>
            <label style={campo}>
              <span style={rot}>Tipo</span>
              <select value={dados.tipo} onChange={(e) => setDados({ ...dados, tipo: e.target.value as TipoChecklist })} style={inputStyle}>
                {TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
              </select>
            </label>
          </div>
          <label style={campo}><span style={rot}>Nome</span>
            <input value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} placeholder="Nome do checklist" style={{ ...inputStyle, fontSize: 15 }} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={campo}><span style={rot}>Fase/Contexto</span>
              <input value={dados.fase ?? ""} onChange={(e) => setDados({ ...dados, fase: e.target.value })} placeholder="ex.: Montagem" style={inputStyle} /></label>
            <label style={{ ...campo, justifyContent: "flex-end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
                <input type="checkbox" checked={dados.exige_projeto_ref} onChange={(e) => setDados({ ...dados, exige_projeto_ref: e.target.checked })} style={{ width: 18, height: 18 }} />
                Exige projeto de referência
              </label>
            </label>
          </div>
          <label style={campo}><span style={rot}>Referência (norma/manual/documento do cliente)</span>
            <input value={dados.referencia_documento ?? ""} onChange={(e) => setDados({ ...dados, referencia_documento: e.target.value })} placeholder="ex.: NBR 5410 · manual do fabricante" style={inputStyle} /></label>
          <label style={campo}><span style={rot}>NRs relacionadas (separadas por ;)</span>
            <input value={dados.nrs_relacionadas.join("; ")} onChange={(e) => setDados({ ...dados, nrs_relacionadas: e.target.value.split(/[;,]/).map((s) => s.trim()).filter(Boolean) })} placeholder="ex.: NR-10; NR-35" style={inputStyle} /></label>

          <div style={{ ...rot, marginTop: 4 }}>Itens ({itens.filter((i) => i.texto.trim()).length})</div>
          {itens.map((it, i) => (
            <Card key={i}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, color: T.inkSoft }}>{String(i + 1).padStart(2, "0")}</span>
                <input value={it.texto} onChange={(e) => patchItem(i, { texto: e.target.value })} placeholder="Item de verificação" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setItens((arr) => arr.filter((_, j) => j !== i))} aria-label="Remover" style={{ border: "none", background: "none", color: T.red, fontWeight: 700, cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
              <input value={it.criterio ?? ""} onChange={(e) => patchItem(i, { criterio: e.target.value })} placeholder="Critério / o que verificar (opcional)" style={{ ...inputStyle, marginTop: 6, fontSize: 13.5 }} />
            </Card>
          ))}
          <Botao variante="fantasma" onClick={() => setItens((arr) => [...arr, { ordem: arr.length + 1, texto: "", criterio: "" }])}>+ Adicionar item</Botao>

          <Botao onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar checklist"}</Botao>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header titulo="Checklists personalizados" sub="Do seu catálogo (empresa)" onBack={onBack} />
      {aviso && <Aviso aviso={aviso} />}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Botao onClick={() => novo()}>+ Novo checklist</Botao>
        <Card>
          <div style={rot}>Clonar de um padrão</div>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) void clonar(e.target.value); e.target.value = ""; }}
            style={{ ...inputStyle, marginTop: 8 }}
          >
            <option value="">Selecione um checklist padrão…</option>
            {[...padroesPorMod.entries()].map(([m, list]) => (
              <optgroup key={m} label={ROTULO_MODULO[m as keyof typeof ROTULO_MODULO] ?? "Outros"}>
                {list.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
              </optgroup>
            ))}
          </select>
        </Card>

        <div style={{ ...rot, marginTop: 4 }}>Seus checklists ({empresaCks.length})</div>
        {empresaCks.map((c) => (
          <Card key={c.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, color: T.navy }}>{c.codigo}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.nome}</div>
                <div style={{ fontSize: 12, color: T.inkSoft }}>{ROTULO_MODULO[(c.modulo ?? "transversal") as keyof typeof ROTULO_MODULO]}{c.tipo ? ` · ${ROTULO_TIPO[c.tipo as keyof typeof ROTULO_TIPO]}` : ""}</div>
              </div>
              <button onClick={() => void editar(c)} style={acaoBtn(T.navy)}>Editar</button>
              <button onClick={() => void (async () => { const { error } = await excluirChecklistCustom(c.id); if (error) mostrar(error, false); else { mostrar("Excluído.", true); void carregar(); } })()} style={acaoBtn(T.red)}>Excluir</button>
            </div>
          </Card>
        ))}
        {empresaCks.length === 0 && <div style={{ textAlign: "center", color: T.inkSoft, padding: 16, fontSize: 14 }}>Nenhum checklist personalizado ainda.</div>}
      </div>
    </div>
  );
}

function Aviso({ aviso }: { aviso: { msg: string; ok: boolean } }) {
  return <div role="status" style={{ padding: "10px 14px", background: aviso.ok ? T.greenBg : T.redBg, color: aviso.ok ? T.green : T.red, fontWeight: 600, fontSize: 13.5 }}>{aviso.msg}</div>;
}
const campo = { display: "flex", flexDirection: "column", gap: 6 } as const;
const rot = { fontSize: 13, fontWeight: 700, color: T.inkSoft, fontFamily: FONT_HEAD, textTransform: "uppercase", letterSpacing: 0.3 } as const;
const acaoBtn = (cor: string) => ({ background: "none", border: `1px solid ${cor}`, color: cor, fontWeight: 700, fontSize: 12.5, cursor: "pointer", borderRadius: 8, padding: "6px 10px", flexShrink: 0 }) as const;
