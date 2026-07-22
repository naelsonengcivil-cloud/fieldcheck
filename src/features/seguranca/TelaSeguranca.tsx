import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Header, inputStyle } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { db } from "@/lib/db";
import { calcularBird } from "@/lib/piramideBird";
import { PiramideBird } from "@/features/seguranca/PiramideBird";
import { ROTULO_OCORRENCIA, ehDesvio } from "@/lib/ocorrenciaService";
import { ROTULO_CRIT, corCriticidade } from "@/lib/criticidade";

// ============================================================
// Pirâmide de Bird consolidada da empresa (Marco A2 + Marco M). Agrega as
// classificações de NC de ST + ocorrências/desvios avulsos (RLS por
// empresa), com filtro de período, e lista os registros. Lê do Dexie.
// ============================================================

export function TelaSeguranca({ onBack }: { onBack: () => void }) {
  const respostas = useLiveQuery(() => db.respostas.toArray(), [], []);
  const ocorrencias = useLiveQuery(() => db.ocorrencias.filter((o) => !o.excluido_em).toArray(), [], []);
  const obras = useLiveQuery(() => db.obras.toArray(), [], []);

  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const ocorPeriodo = useMemo(
    () =>
      ocorrencias.filter((o) => {
        if (de && o.data < de) return false;
        if (ate && o.data > ate) return false;
        return true;
      }),
    [ocorrencias, de, ate],
  );

  const kpis = useMemo(() => {
    const respClass = respostas.filter((r) => {
      if (!r.classificacao_st) return false;
      const d = r.criado_em.slice(0, 10);
      if (de && d < de) return false;
      if (ate && d > ate) return false;
      return true;
    });
    return calcularBird(respClass, ocorPeriodo);
  }, [respostas, ocorPeriodo, de, ate]);

  const nomeObra = useMemo(() => new Map(obras.map((o) => [o.id, o.nome])), [obras]);
  const registros = useMemo(
    () => [...ocorPeriodo].sort((a, b) => (b.ocorrida_em ?? b.data).localeCompare(a.ocorrida_em ?? a.data)),
    [ocorPeriodo],
  );

  return (
    <div>
      <Header titulo="Segurança — Pirâmide de Bird" sub="Consolidado da empresa" onBack={onBack} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: T.inkSoft, marginBottom: 8 }}>
            Período
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={inputStyle} aria-label="Data inicial" />
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={inputStyle} aria-label="Data final" />
          </div>
        </Card>

        <Card>
          <PiramideBird kpis={kpis} />
        </Card>

        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 14, textTransform: "uppercase", color: T.inkSoft, marginBottom: 8 }}>
            Registros do período ({registros.length})
          </div>
          {registros.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.inkSoft }}>Nenhum desvio ou ocorrência no período.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {registros.map((o) => {
                const desvio = ehDesvio(o.tipo);
                const cor = desvio && o.criticidade ? corCriticidade(o.criticidade) : null;
                return (
                  <div key={o.id} style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: desvio ? T.yellowDark : T.red }}>
                        {desvio ? "📸" : "⚠️"} {ROTULO_OCORRENCIA[o.tipo]}
                      </span>
                      {cor && o.criticidade && (
                        <span style={{ background: cor.bg, color: cor.fg, fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>
                          {ROTULO_CRIT[o.criticidade]}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: T.inkSoft, marginLeft: "auto" }}>
                        {new Date(o.ocorrida_em ?? o.data).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
                      {nomeObra.get(o.obra_id) ?? "Obra"}
                      {o.frente ? ` · ${o.frente}` : ""}
                      {o.ref_cronograma_codigo ? ` · EAP ${o.ref_cronograma_codigo}` : ""}
                    </div>
                    <div style={{ fontSize: 13.5, color: T.ink, marginTop: 2, lineHeight: 1.45 }}>{o.descricao}</div>
                    {o.triagem_ia && (
                      <div style={{ marginTop: 6, background: "#FFF8E6", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, lineHeight: 1.5 }}>
                        <span style={{ background: "#FFF4D6", color: T.yellowDark, fontWeight: 700, fontSize: 10.5, padding: "2px 7px", borderRadius: 999, marginRight: 6 }}>
                          IA · revise
                        </span>
                        <span style={{ color: T.ink }}>{o.triagem_ia.descricao_visivel}</span>
                        {o.triagem_ia.familias_normativas.length > 0 && (
                          <div style={{ color: T.yellowDark, fontWeight: 600, marginTop: 2 }}>
                            {o.triagem_ia.familias_normativas.join(" · ")}
                          </div>
                        )}
                        {o.triagem_ia.limitacoes && (
                          <div style={{ color: T.inkSoft, marginTop: 2 }}>
                            Não verificável pela imagem: {o.triagem_ia.limitacoes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
