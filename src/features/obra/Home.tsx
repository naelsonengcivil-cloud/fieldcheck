import { useLiveQuery } from "dexie-react-hooks";
import { Botao, Header, Kpi } from "@/components/ui";
import { SyncBar } from "@/components/SyncBar";
import { T, FONT_HEAD, corPorPct } from "@/theme";
import { db } from "@/lib/db";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  indexarRespostas,
  kpisDoConjunto,
  resumoPorObra,
} from "@/lib/obraView";
import type { Obra } from "@/types/db";

// ============================================================
// Home (RF02): lista as obras da empresa com KPIs (inspeções, NCs,
// % conformidade). Lê do Dexie (offline) — inclui inspeções de todos
// os inspetores baixadas pelo modelo de leitura.
// ============================================================

export function Home({
  onNova,
  onAbrirObra,
  onGerenciarUsuarios,
}: {
  onNova: () => void;
  onAbrirObra: (obra: Obra) => void;
  onGerenciarUsuarios?: () => void;
}) {
  const { empresa, signOut } = useAuth();
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);
  const inspecoes = useLiveQuery(
    () => db.inspecoes.where("status").equals("finalizada").toArray(),
    [],
    [],
  );
  const respostas = useLiveQuery(() => db.respostas.toArray(), [], []);

  const idx = indexarRespostas(respostas);
  const resumo = resumoPorObra(obras, inspecoes, idx);
  const total = kpisDoConjunto(inspecoes, idx);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: T.bg,
        minHeight: "100vh",
        maxWidth: 520,
        margin: "0 auto",
        color: T.ink,
      }}
    >
      <Header
        titulo="FieldCheck"
        sub={empresa ? empresa.nome : "Inspeções de campo"}
        right={
          <button
            onClick={() => void signOut()}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT_HEAD,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Sair
          </button>
        }
      />
      <SyncBar />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Botao onClick={onNova}>+ Nova inspeção</Botao>
        {onGerenciarUsuarios && (
          <Botao variante="fantasma" onClick={onGerenciarUsuarios}>
            👥 Gerenciar usuários
          </Botao>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Kpi label="Inspeções" valor={total.nInspecoes} cor={T.navy} />
          <Kpi label="NCs" valor={total.nc} cor={total.nc ? T.red : T.green} />
          <Kpi
            label="% Conform."
            valor={total.nInspecoes ? `${total.pct}%` : "—"}
            cor={total.nInspecoes ? corPorPct(total.pct) : T.inkSoft}
          />
        </div>

        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: 16,
            textTransform: "uppercase",
            color: T.inkSoft,
            marginTop: 4,
          }}
        >
          Obras ({resumo.length})
        </div>

        {resumo.length === 0 && (
          <div
            style={{
              background: T.card,
              border: `2px dashed ${T.line}`,
              borderRadius: 14,
              padding: 26,
              textAlign: "center",
              color: T.inkSoft,
              fontSize: 14.5,
            }}
          >
            Nenhuma obra cadastrada ainda.
          </div>
        )}

        {resumo.map(({ obra, kpis }) => (
          <button
            key={obra.id}
            onClick={() => onAbrirObra(obra)}
            style={{
              textAlign: "left",
              background: T.card,
              border: `1px solid ${T.line}`,
              borderLeft: `6px solid ${T.yellow}`,
              borderRadius: 14,
              padding: 16,
              cursor: "pointer",
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT_HEAD,
                  fontWeight: 700,
                  fontSize: 19,
                  textTransform: "uppercase",
                  color: T.ink,
                }}
              >
                {obra.nome}
              </div>
              <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                {kpis.nInspecoes} inspeções · {kpis.nc} NC ·{" "}
                {kpis.nInspecoes ? `${kpis.pct}% conformidade` : "sem dados"}
              </div>
            </div>
            <div
              style={{
                fontFamily: FONT_HEAD,
                fontWeight: 700,
                fontSize: 24,
                color: kpis.nInspecoes ? corPorPct(kpis.pct) : T.inkSoft,
              }}
            >
              {kpis.nInspecoes ? `${kpis.pct}%` : "—"}
            </div>
            <span style={{ color: T.inkSoft, fontSize: 20 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
