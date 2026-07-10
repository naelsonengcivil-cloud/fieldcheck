import { useState } from "react";
import { Botao, Card, Header, Kpi } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { corPorPct } from "@/theme";
import { AssinaturaCanvas } from "@/features/inspecao/AssinaturaCanvas";
import type { ExecInspecao } from "@/lib/inspecaoService";

// ============================================================
// Resumo antes de salvar (RF04). Mostra KPIs e as NCs geradas; ao
// confirmar, persiste offline no Dexie (a fila do M4 sincroniza).
// ============================================================

export function Resumo({
  exec,
  onBack,
  onSalvar,
  salvando,
}: {
  exec: ExecInspecao;
  onBack: () => void;
  onSalvar: (assinatura: string | null, gerarRncs?: boolean) => void;
  salvando: boolean;
}) {
  const [erro] = useState<string | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [perguntarRnc, setPerguntarRnc] = useState(false);
  const ncs = exec.itens.filter((i) => i.resposta === "NC");
  const conf = exec.itens.filter((i) => i.resposta === "C").length;
  const na = exec.itens.filter((i) => i.resposta === "NA").length;
  const pontos = conf + ncs.length + na; // pontos inspecionados (itens respondidos)
  const pct = conf + ncs.length > 0 ? Math.round((conf / (conf + ncs.length)) * 100) : 100;

  return (
    <div>
      <Header
        titulo="Resumo"
        sub={`${exec.checklist.codigo} · ${exec.obra.nome}`}
        onBack={onBack}
      />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Kpi label="Conformidade" valor={`${pct}%`} cor={corPorPct(pct)} />
          <Kpi label="Pontos inspec." valor={pontos} cor={T.navy} />
          <Kpi label="Não conform." valor={ncs.length} cor={ncs.length ? T.red : T.green} />
          <Kpi label="N/A" valor={na} cor={T.gray} />
        </div>

        {ncs.length > 0 && (
          <Card>
            <div
              style={{
                fontFamily: FONT_HEAD,
                fontWeight: 700,
                fontSize: 17,
                textTransform: "uppercase",
                color: T.red,
                marginBottom: 10,
              }}
            >
              Eventos gerados ({ncs.length})
            </div>
            {ncs.map((r, i) => (
              <div
                key={r.item_id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 0",
                  borderTop: i ? `1px solid ${T.line}` : "none",
                }}
              >
                {r.fotoPreview && (
                  <img
                    src={r.fotoPreview}
                    alt=""
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: "cover",
                      borderRadius: 8,
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.texto}</div>
                  <div style={{ fontSize: 13.5, color: T.inkSoft }}>{r.observacao}</div>
                </div>
              </div>
            ))}
          </Card>
        )}

        {erro && (
          <div
            role="alert"
            style={{
              background: T.redBg,
              color: T.red,
              border: `1px solid ${T.red}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {erro}
          </div>
        )}

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
            Assinatura do inspetor
          </div>
          <AssinaturaCanvas
            onChange={setAssinatura}
            temAssinatura={!!assinatura}
            onLimpar={() => setAssinatura(null)}
          />
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
            Opcional — quando assinada, a assinatura aparece no fechamento do
            relatório junto ao seu nome e à data da inspeção.
          </div>
        </Card>

        <Botao
          onClick={() => (ncs.length > 0 ? setPerguntarRnc(true) : onSalvar(assinatura, false))}
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar e sincronizar"}
        </Botao>
        <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
          A inspeção é salva no aparelho na hora. Havendo rede, sobe
          automaticamente; sem rede, fica na fila e sincroniza depois.
        </div>
      </div>

      {perguntarRnc && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setPerguntarRnc(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "18px 18px 0 0", padding: 18, width: "100%", maxWidth: 520 }}>
            <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", color: T.red, marginBottom: 8 }}>
              {ncs.length} não conformidade{ncs.length > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, marginBottom: 14 }}>
              Deseja gerar os Relatórios de Não Conformidade (RNC) agora? A IA pré‑preenche
              cada RNC — você revisa e formaliza depois.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Botao onClick={() => { setPerguntarRnc(false); onSalvar(assinatura, true); }}>
                Gerar todas
              </Botao>
              <Botao variante="fantasma" onClick={() => { setPerguntarRnc(false); onSalvar(assinatura, false); }}>
                Gerar depois
              </Botao>
            </div>
            <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>
              As RNCs são geradas em segundo plano após a sincronização. Você pode gerá‑las
              depois, item a item, na tela da inspeção.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
