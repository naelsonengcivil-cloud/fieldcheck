import { useEffect, useMemo, useState } from "react";
import { Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { supabase } from "@/lib/supabase";
import type { Alerta, SeveridadeAlerta } from "@/types/db";

// ============================================================
// Assistente de Alertas (Marco L, Fase 1) — gestor/admin.
// Lista os alertas gerados pela camada de DETECÇÃO (regras SQL sobre os
// eventos; sem IA). Cada alerta mostra os DADOS-FONTE (números + amostra)
// que o originaram — apresentação honesta (diretriz de dados/IA).
// Online (RLS por empresa); a Fase 2 acrescenta a narrativa de IA.
// ============================================================

const SEV: Record<SeveridadeAlerta, { rotulo: string; fg: string; bg: string }> = {
  critico: { rotulo: "Crítico", fg: T.red, bg: T.redBg },
  atencao: { rotulo: "Atenção", fg: "#B8860B", bg: "#FFF8E6" },
  info: { rotulo: "Info", fg: T.navy, bg: "#EEF2F6" },
};

const ORDEM: Record<SeveridadeAlerta, number> = { critico: 0, atencao: 1, info: 2 };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** dados_fonte → "ncs vencidas: 3 · obra: Teste" (transparência do número). */
function fonteResumo(d: Record<string, unknown>): string {
  return Object.entries(d ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
    .join(" · ");
}

export function TelaAlertas({ onVoltar }: { onVoltar: () => void }) {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [erro, setErro] = useState(false);
  const [soNaoLidos, setSoNaoLidos] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data, error } = await supabase
        .from("alertas")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(100);
      if (!vivo) return;
      if (error) setErro(true);
      else setAlertas((data as Alerta[]) ?? []);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function marcarLido(id: string) {
    setAlertas((prev) => prev?.map((a) => (a.id === id ? { ...a, lido_em: new Date().toISOString() } : a)) ?? prev);
    const { error } = await supabase.from("alertas").update({ lido_em: new Date().toISOString() }).eq("id", id);
    if (error) setAlertas((prev) => prev?.map((a) => (a.id === id ? { ...a, lido_em: null } : a)) ?? prev);
  }

  const lista = useMemo(() => {
    const l = (alertas ?? []).filter((a) => !soNaoLidos || !a.lido_em);
    return [...l].sort(
      (a, b) => ORDEM[a.severidade] - ORDEM[b.severidade] || b.criado_em.localeCompare(a.criado_em),
    );
  }, [alertas, soNaoLidos]);

  const naoLidos = (alertas ?? []).filter((a) => !a.lido_em).length;

  return (
    <div>
      <Header titulo="Alertas" sub="Assistente de alertas — detecção sobre os seus eventos" onBack={onVoltar} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.inkSoft }}>
            {alertas === null ? "Carregando…" : `${alertas.length} alerta(s) · ${naoLidos} não lido(s)`}
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: T.inkSoft, cursor: "pointer" }}>
            <input type="checkbox" checked={soNaoLidos} onChange={(e) => setSoNaoLidos(e.target.checked)} style={{ width: 16, height: 16 }} />
            Só não lidos
          </label>
        </div>

        {erro && (
          <Card style={{ borderColor: T.red, background: T.redBg }}>
            <div style={{ fontSize: 13.5, color: T.red, fontWeight: 600 }}>
              Não foi possível carregar os alertas (esta tela é online).
            </div>
          </Card>
        )}

        {alertas !== null && lista.length === 0 && !erro && (
          <Card>
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>
              Nenhum alerta {soNaoLidos ? "não lido" : ""} no momento — as regras não encontraram
              condições que mereçam atenção. Os alertas são gerados periodicamente a partir das
              NCs, prazos, reincidência e desempenho das contratadas.
            </div>
          </Card>
        )}

        {lista.map((a) => {
          const s = SEV[a.severidade];
          return (
            <Card key={a.id} style={{ borderLeft: `5px solid ${s.fg}`, opacity: a.lido_em ? 0.62 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 11, textTransform: "uppercase",
                    letterSpacing: 0.4, color: s.fg, background: s.bg, padding: "3px 9px", borderRadius: 999,
                  }}
                >
                  {s.rotulo}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14.5, flex: 1, minWidth: 0 }}>{a.titulo}</span>
                <span style={{ fontSize: 11.5, color: T.inkSoft }}>{fmt(a.criado_em)}</span>
              </div>

              <div style={{ fontSize: 13.5, color: T.ink, marginTop: 6, lineHeight: 1.5 }}>{a.corpo}</div>

              {a.analise_ia && (
                <div style={{ marginTop: 8, padding: 8, background: "#F5F7FA", borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
                  <b style={{ color: T.inkSoft }}>Análise: </b>
                  {a.analise_ia}
                  <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 6, fontStyle: "italic" }}>
                    Análise gerada por IA como apoio à gestão — validação humana recomendada.
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 8, lineHeight: 1.45 }}>
                <b>Fonte:</b> {fonteResumo(a.dados_fonte)}
              </div>

              {!a.lido_em && (
                <button
                  onClick={() => void marcarLido(a.id)}
                  style={{
                    marginTop: 8, background: "none", border: "none", color: T.navy,
                    fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0,
                  }}
                >
                  Marcar como lido
                </button>
              )}
            </Card>
          );
        })}

        <div style={{ fontSize: 11.5, color: T.inkSoft, textAlign: "center", lineHeight: 1.5 }}>
          Alertas gerados por regras determinísticas sobre os dados da sua empresa — todo número
          exibido vem do banco, com o tamanho da amostra.
        </div>
      </div>
    </div>
  );
}
