import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { criarExecucao, type ExecInspecao } from "@/lib/inspecaoService";

// ============================================================
// Nova inspeção (RF03): escolher obra, frente, contratada e checklist
// do catálogo local (Dexie) — funciona offline.
// ============================================================

export function NovaInspecao({
  onBack,
  onIniciar,
}: {
  onBack: () => void;
  onIniciar: (exec: ExecInspecao) => void;
}) {
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);
  const checklists = useLiveQuery(
    () => db.checklists.toArray(),
    [],
    [],
  );

  const [obraId, setObraId] = useState("");
  const [frente, setFrente] = useState("");
  const [contratada, setContratada] = useState("");
  const [checklistId, setChecklistId] = useState<string | null>(null);

  const checklistsOrdenados = [...checklists].sort((a, b) =>
    a.codigo.localeCompare(b.codigo),
  );

  async function iniciar() {
    const obra = obras.find((o) => o.id === obraId);
    const checklist = checklists.find((c) => c.id === checklistId);
    if (!obra || !checklist) return;
    const itens = await db.itens
      .where("checklist_id")
      .equals(checklist.id)
      .toArray();
    const exec = criarExecucao(
      obra,
      checklist,
      itens,
      { frente, contratada },
      new Date().toISOString(),
    );
    onIniciar(exec);
  }

  const semCatalogo = obras.length === 0 || checklists.length === 0;
  const pronto = !!obraId && !!checklistId;

  return (
    <div>
      <Header
        titulo="Nova inspeção"
        sub="Obra, frente e checklist"
        onBack={onBack}
      />
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
          <select
            value={obraId}
            onChange={(e) => setObraId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Selecione a obra…</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>Frente de serviço</span>
          <input
            value={frente}
            onChange={(e) => setFrente(e.target.value)}
            placeholder="Ex.: Bloco A · Trecho 3 (opcional)"
            style={{ ...inputStyle, fontSize: 15 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={rotulo}>Contratada inspecionada</span>
          <input
            value={contratada}
            onChange={(e) => setContratada(e.target.value)}
            placeholder="Empresa executante (opcional)"
            style={{ ...inputStyle, fontSize: 15 }}
          />
        </label>

        <div style={{ ...rotulo, marginTop: 4 }}>Checklist</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checklistsOrdenados.map((c) => {
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
                  padding: "12px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_HEAD,
                    fontWeight: 700,
                    fontSize: 16,
                    color: T.navy,
                    width: 54,
                    flexShrink: 0,
                  }}
                >
                  {c.codigo}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14.5 }}>
                    {c.nome}
                  </span>
                  <span style={{ fontSize: 12.5, color: T.inkSoft }}>{c.area}</span>
                </span>
                {sel && <span style={{ color: T.yellowDark, fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>

        <Botao onClick={() => void iniciar()} disabled={!pronto}>
          Iniciar inspeção →
        </Botao>
      </div>
    </div>
  );
}

const rotulo = {
  fontSize: 13,
  fontWeight: 600,
  color: T.inkSoft,
} as const;
