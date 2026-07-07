import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { criarExecucao, type ExecInspecao } from "@/lib/inspecaoService";
import { aceitaNovaInspecao } from "@/lib/obraStatus";
import { MODULOS, ROTULO_MODULO } from "@/lib/catalogoDimensoes";
import type { Checklist } from "@/types/db";

// ============================================================
// Nova inspeção (RF03): obra, frente, contratada e checklist do catálogo
// local (Dexie) — offline. Marco E: checklists agrupados por módulo e
// filtrados pelo kit da obra (opção "todos"); projeto de referência
// aprovado quando o checklist exige.
// ============================================================

export function NovaInspecao({
  onBack,
  onIniciar,
}: {
  onBack: () => void;
  onIniciar: (exec: ExecInspecao) => void;
}) {
  const obrasCache = useLiveQuery(() => db.obras.toArray(), [], []);
  const obras = obrasCache.filter((o) => aceitaNovaInspecao(o.status));
  const checklists = useLiveQuery(() => db.checklists.toArray(), [], []);
  const kitChecklists = useLiveQuery(() => db.kit_checklists.toArray(), [], []);
  const contratadasCache = useLiveQuery(() => db.contratadas.toArray(), [], []);
  const contratadas = contratadasCache.filter((c) => c.ativa);

  const [obraId, setObraId] = useState("");
  const [frente, setFrente] = useState("");
  const [contratadaId, setContratadaId] = useState("");
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [projNum, setProjNum] = useState("");
  const [projRev, setProjRev] = useState("");

  const obraSel = obras.find((o) => o.id === obraId);
  const kitCkIds = useMemo(() => {
    if (!obraSel?.kit_id) return null;
    return new Set(kitChecklists.filter((k) => k.kit_id === obraSel.kit_id).map((k) => k.checklist_id));
  }, [obraSel?.kit_id, kitChecklists]);
  const usaKit = !!kitCkIds && !mostrarTodos;

  // Checklists visíveis, agrupados por módulo (na ordem de MODULOS).
  const grupos = useMemo(() => {
    const visiveis = checklists
      .filter((c) => c.ativo !== false)
      .filter((c) => !usaKit || kitCkIds!.has(c.id));
    const porMod = new Map<string, Checklist[]>();
    for (const c of visiveis) {
      const m = c.modulo ?? "_sem";
      (porMod.get(m) ?? porMod.set(m, []).get(m)!).push(c);
    }
    const ordem = [...MODULOS, "_sem"];
    return ordem
      .filter((m) => porMod.has(m))
      .map((m) => ({
        modulo: m,
        rotulo: m === "_sem" ? "Outros" : ROTULO_MODULO[m as keyof typeof ROTULO_MODULO],
        itens: porMod.get(m)!.sort((a, b) => a.codigo.localeCompare(b.codigo)),
      }));
  }, [checklists, usaKit, kitCkIds]);

  const checklistSel = checklists.find((c) => c.id === checklistId);
  const exigeProj = !!checklistSel?.exige_projeto_ref;

  async function iniciar() {
    if (!obraSel || !checklistSel) return;
    const itens = await db.itens.where("checklist_id").equals(checklistSel.id).toArray();
    const contratada = contratadas.find((c) => c.id === contratadaId);
    const exec = criarExecucao(
      obraSel,
      checklistSel,
      itens,
      {
        frente,
        contratada: contratada?.nome ?? "",
        contratada_id: contratada?.id ?? null,
        projeto_ref_numero: projNum,
        projeto_ref_revisao: projRev,
      },
      new Date().toISOString(),
    );
    onIniciar(exec);
  }

  const semCatalogo = obras.length === 0 || checklists.length === 0;
  const pronto = !!obraId && !!checklistId && (!exigeProj || projNum.trim().length > 0);

  return (
    <div>
      <Header titulo="Nova inspeção" sub="Obra, frente e checklist" onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {semCatalogo && (
          <Card style={{ borderColor: T.yellow, background: "#FFF8E6" }}>
            <div style={{ fontSize: 14, color: T.yellowDark, fontWeight: 600 }}>
              Catálogo ainda não carregado. Conecte-se à internet uma vez para
              baixar obras e checklists (depois funciona offline).
            </div>
          </Card>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>Obra</span>
          <select value={obraId} onChange={(e) => { setObraId(e.target.value); setChecklistId(null); }} style={inputStyle}>
            <option value="">Selecione a obra…</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>Frente de serviço</span>
          <input value={frente} onChange={(e) => setFrente(e.target.value)} placeholder="Ex.: Bloco A · Trecho 3 (opcional)" style={{ ...inputStyle, fontSize: 15 }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>Contratada inspecionada</span>
          <select value={contratadaId} onChange={(e) => setContratadaId(e.target.value)} style={inputStyle}>
            <option value="">Nenhuma / não se aplica</option>
            {contratadas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <span style={rotulo}>Checklist {kitCkIds && !mostrarTodos ? "· do kit da obra" : ""}</span>
          {kitCkIds && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: T.inkSoft }}>
              <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} style={{ width: 16, height: 16 }} />
              Todos
            </label>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {grupos.map((g) => (
            <div key={g.modulo} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.5, color: T.yellowDark }}>
                {g.rotulo} ({g.itens.length})
              </div>
              {g.itens.map((c) => {
                const sel = checklistId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setChecklistId(c.id)}
                    style={{
                      textAlign: "left",
                      background: sel ? "#FFF4D6" : T.card,
                      border: sel ? `2px solid ${T.yellow}` : `1px solid ${T.line}`,
                      borderRadius: 12,
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                    }}
                  >
                    <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, color: T.navy, width: 50, flexShrink: 0 }}>
                      {c.codigo}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{c.nome}</span>
                      {c.fase && <span style={{ fontSize: 12, color: T.inkSoft }}>{c.fase}</span>}
                    </span>
                    {sel && <span style={{ color: T.yellowDark, fontWeight: 700 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {grupos.length === 0 && (
            <div style={{ fontSize: 13, color: T.inkSoft }}>Nenhum checklist disponível.</div>
          )}
        </div>

        {exigeProj && (
          <Card style={{ borderColor: T.yellow }}>
            <span style={rotulo}>Projeto de referência aprovado *</span>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 6 }}>
              <input value={projNum} onChange={(e) => setProjNum(e.target.value)} placeholder="Nº do documento" style={{ ...inputStyle, border: `2px solid ${projNum.trim() ? T.line : T.red}` }} />
              <input value={projRev} onChange={(e) => setProjRev(e.target.value)} placeholder="Revisão" style={inputStyle} />
            </div>
            <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6 }}>
              Contra qual documento/revisão a inspeção é feita (rastreabilidade).
            </div>
          </Card>
        )}

        <Botao onClick={() => void iniciar()} disabled={!pronto}>
          Iniciar inspeção →
        </Botao>
      </div>
    </div>
  );
}

const rotulo = { fontSize: 13, fontWeight: 600, color: T.inkSoft } as const;
