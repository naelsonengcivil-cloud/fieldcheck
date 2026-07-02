import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Header, Kpi, inputStyle } from "@/components/ui";
import { T, FONT_HEAD, corPorPct } from "@/theme";
import { db, type LocalInspecao } from "@/lib/db";
import {
  indexarRespostas,
  filtrarInspecoes,
  kpisDoConjunto,
  kpisInspecao,
  dataInspecao,
  type FiltroObra,
} from "@/lib/obraView";
import type { Obra } from "@/types/db";

// ============================================================
// Tela da obra (RF07): filtros combináveis (checklist, inspetor,
// contratada, período, só com NC) que refletem em KPIs e lista.
// Gráficos e exportações entram no M7.
// ============================================================

export function TelaObra({
  obra,
  onBack,
  onVerInspecao,
}: {
  obra: Obra;
  onBack: () => void;
  onVerInspecao: (insp: LocalInspecao) => void;
}) {
  const inspecoesObra = useLiveQuery(
    () => db.inspecoes.where("obra_id").equals(obra.id).toArray(),
    [obra.id],
    [],
  );
  const respostas = useLiveQuery(() => db.respostas.toArray(), [], []);
  const checklists = useLiveQuery(() => db.checklists.toArray(), [], []);
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [], []);

  const [fCk, setFCk] = useState("");
  const [fInsp, setFInsp] = useState("");
  const [fContratada, setFContratada] = useState("");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");
  const [fSoNC, setFSoNC] = useState(false);

  const finalizadas = useMemo(
    () => inspecoesObra.filter((i) => i.status === "finalizada"),
    [inspecoesObra],
  );
  const idx = useMemo(() => indexarRespostas(respostas), [respostas]);
  const ckMap = useMemo(
    () => new Map(checklists.map((c) => [c.id, c])),
    [checklists],
  );
  const usrMap = useMemo(
    () => new Map(usuarios.map((u) => [u.id, u.nome])),
    [usuarios],
  );

  // Opções de filtro derivadas das inspeções da obra.
  const checklistsPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => i.checklist_id))],
    [finalizadas],
  );
  const inspetoresPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => i.inspetor_id))],
    [finalizadas],
  );
  const contratadasPresentes = useMemo(
    () => [...new Set(finalizadas.map((i) => i.contratada).filter(Boolean))] as string[],
    [finalizadas],
  );

  const filtro: FiltroObra = {
    checklistId: fCk || undefined,
    inspetorId: fInsp || undefined,
    contratada: fContratada || undefined,
    de: fDe || undefined,
    ate: fAte || undefined,
    soNC: fSoNC,
  };
  const filtradas = useMemo(
    () =>
      filtrarInspecoes(finalizadas, idx, filtro).sort((a, b) =>
        dataInspecao(b).localeCompare(dataInspecao(a)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finalizadas, idx, fCk, fInsp, fContratada, fDe, fAte, fSoNC],
  );
  const kpis = kpisDoConjunto(filtradas, idx);

  const nomeCk = (id: string) => ckMap.get(id)?.codigo ?? "—";
  const labelCk = (id: string) => {
    const c = ckMap.get(id);
    return c ? `${c.codigo} · ${c.nome}` : "Checklist";
  };

  return (
    <div>
      <Header
        titulo={obra.nome}
        sub={`${finalizadas.length} inspeções na obra`}
        onBack={onBack}
      />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div
            style={{
              fontFamily: FONT_HEAD,
              fontWeight: 700,
              fontSize: 15,
              textTransform: "uppercase",
              color: T.inkSoft,
              marginBottom: 10,
            }}
          >
            Filtros
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={fCk} onChange={(e) => setFCk(e.target.value)} style={inputStyle}>
              <option value="">Todos os checklists</option>
              {checklistsPresentes.map((id) => (
                <option key={id} value={id}>
                  {nomeCk(id)}
                </option>
              ))}
            </select>
            <select value={fInsp} onChange={(e) => setFInsp(e.target.value)} style={inputStyle}>
              <option value="">Todos os inspetores</option>
              {inspetoresPresentes.map((id) => (
                <option key={id} value={id}>
                  {usrMap.get(id) ?? "—"}
                </option>
              ))}
            </select>
            {contratadasPresentes.length > 0 && (
              <select
                value={fContratada}
                onChange={(e) => setFContratada(e.target.value)}
                style={{ ...inputStyle, gridColumn: "1 / -1" }}
              >
                <option value="">Todas as contratadas</option>
                {contratadasPresentes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={fDe}
              onChange={(e) => setFDe(e.target.value)}
              style={inputStyle}
              aria-label="Data inicial"
            />
            <input
              type="date"
              value={fAte}
              onChange={(e) => setFAte(e.target.value)}
              style={inputStyle}
              aria-label="Data final"
            />
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              fontSize: 14.5,
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={fSoNC}
              onChange={(e) => setFSoNC(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Somente inspeções com NC
          </label>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi
            label="% Conform."
            valor={filtradas.length ? `${kpis.pct}%` : "—"}
            cor={filtradas.length ? corPorPct(kpis.pct) : T.inkSoft}
          />
          <Kpi label="Inspeções" valor={filtradas.length} cor={T.navy} />
          <Kpi label="NCs" valor={kpis.nc} cor={kpis.nc ? T.red : T.green} />
        </div>

        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 16,
            textTransform: "uppercase",
            color: T.inkSoft,
          }}
        >
          Inspeções ({filtradas.length})
        </div>

        {filtradas.map((insp) => {
          const k = kpisInspecao(insp, idx);
          return (
            <button
              key={insp.id}
              onClick={() => onVerInspecao(insp)}
              style={{
                textAlign: "left",
                background: T.card,
                border: `1px solid ${T.line}`,
                borderRadius: 14,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                width: "100%",
              }}
            >
              <div
                style={{
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 20,
                  color: corPorPct(k.pct),
                  width: 58,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {k.pct}%
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: T.ink }}>
                  {labelCk(insp.checklist_id)}
                </div>
                <div style={{ fontSize: 12.5, color: T.inkSoft }}>
                  {dataInspecao(insp).split("-").reverse().join("/")} ·{" "}
                  {usrMap.get(insp.inspetor_id) ?? "—"} · {k.nc} NC
                  {insp.sync !== "sincronizado" && (
                    <span style={{ color: T.yellowDark, fontWeight: 700 }}> · pendente</span>
                  )}
                </div>
              </div>
              <span style={{ color: T.inkSoft, fontSize: 18 }}>›</span>
            </button>
          );
        })}

        {filtradas.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: T.inkSoft,
              padding: 20,
              fontSize: 14,
            }}
          >
            Nenhuma inspeção corresponde ao filtro.
          </div>
        )}
      </div>
    </div>
  );
}
