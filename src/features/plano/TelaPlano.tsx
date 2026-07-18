import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { usePlano } from "@/features/planos/PlanoProvider";
import { ROTULO_PLANO, temFeatureNaMatriz, type LinhaFeature } from "@/lib/planos";
import { supabase } from "@/lib/supabase";
import {
  PRECOS,
  ORDEM_TIERS,
  GRUPOS_COMPARACAO,
  type TierPago,
  type LinhaLimite,
} from "./vitrine";

// ============================================================
// Página de Planos (Frente 3, Lote 2) — vitrine dos 3 planos + comparação
// (config plan_features/plan_limits) + banner do plano atual (tier-aware) +
// selo de fundador. O checkout real (subscription + seats) é o Lote 3; aqui
// o CTA é um stub. Leitura sempre liberada; nada aqui concede acesso.
// ============================================================

export function TelaPlano({ onBack }: { onBack: () => void }) {
  const { empresa, perfil } = useAuth();
  const gate = usePlano();
  const [limites, setLimites] = useState<Record<string, LinhaLimite> | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  const ehAdmin = perfil?.papel === "admin";
  const ehCortesia = !!empresa?.cortesia_ate && new Date(empresa.cortesia_ate).getTime() > Date.now();
  const ehTrial = !ehCortesia && gate.diasTrial != null && gate.diasTrial > 0;
  const ehReadonly = !ehCortesia && (gate.tier === "readonly" || gate.tier === "archived");
  // Tier a marcar como "atual" nos cards (no trial, destaca o Intelligence testado).
  const tierAtual: TierPago | null = ehTrial
    ? "intelligence"
    : (["basic", "premium", "intelligence"] as string[]).includes(gate.tier)
      ? (gate.tier as TierPago)
      : null;

  const ehFundador = empresa?.cohort === "onda1_fundador";
  const travadoAte = empresa?.price_locked_until
    ? new Date(empresa.price_locked_until).toLocaleDateString("pt-BR")
    : null;

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data } = await supabase
        .from("plan_limits")
        .select("plano, obras_ativas, usuarios, checklists_personalizados, storage_gb, retencao_dias");
      if (vivo && data) {
        const m: Record<string, LinhaLimite> = {};
        for (const l of data as LinhaLimite[]) m[l.plano] = l;
        setLimites(m);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  function assinar(tier: TierPago) {
    // Stub do Lote 2 — o checkout (subscription + seats) chega no Lote 3.
    setNota(`Assinatura do plano ${ROTULO_PLANO[tier]} em finalização — disponível no próximo passo.`);
    setTimeout(() => setNota(null), 4000);
  }

  const carregando = gate.matriz === null || limites === null;

  return (
    <div>
      <Header titulo="Planos" sub={empresa?.nome} onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Banner do plano atual (tier-aware) */}
        <BannerAtual
          cortesia={ehCortesia}
          ehTrial={ehTrial}
          diasTrial={gate.diasTrial}
          ehReadonly={ehReadonly}
          tier={gate.tier}
        />

        {/* Selo de fundador */}
        {ehFundador && (
          <Card style={{ background: "#FFF8E6", borderColor: T.yellow }}>
            <div style={{ fontSize: 14, color: T.yellowDark, fontWeight: 700, lineHeight: 1.5 }}>
              🏆 Preço de fundador {travadoAte ? <>travado até <b>{travadoAte}</b></> : "garantido"}.
            </div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4 }}>
              Você entrou na primeira onda — seu valor mensal fica protegido por 12 meses.
            </div>
          </Card>
        )}

        {nota && (
          <div
            role="status"
            style={{
              background: T.greenBg, color: T.green, border: `1px solid ${T.green}`,
              borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontWeight: 600,
            }}
          >
            {nota}
          </div>
        )}

        {carregando ? (
          <div style={{ color: T.inkSoft, fontSize: 14, padding: 8 }}>Carregando planos…</div>
        ) : (
          <>
            {/* Cards dos 3 planos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ORDEM_TIERS.map((t) => (
                <CardPlano
                  key={t}
                  tier={t}
                  atual={t === tierAtual}
                  ehAdmin={ehAdmin}
                  onAssinar={() => assinar(t)}
                />
              ))}
            </div>

            {/* Tabela comparativa */}
            <TabelaComparativa
              matriz={gate.matriz!}
              limites={limites!}
              tierAtual={tierAtual}
            />
          </>
        )}

        {!ehAdmin && (
          <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6 }}>
            Apenas o administrador da empresa gerencia o plano. Fale com ele para assinar ou trocar de plano.
          </div>
        )}
        <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6, textAlign: "center", marginTop: 4 }}>
          Cobrança da Alpha Inspeções e Auditoria · processado com segurança pela Stripe · cartão (Pix em breve).
        </div>
      </div>
    </div>
  );
}

function BannerAtual({
  cortesia, ehTrial, diasTrial, ehReadonly, tier,
}: {
  cortesia: boolean;
  ehTrial: boolean;
  diasTrial: number | null;
  ehReadonly: boolean;
  tier: string;
}) {
  let cor: string = T.green, bg: string = T.greenBg, emoji = "✓", titulo = "", corpo = "";
  if (cortesia) {
    emoji = "★"; titulo = "Acesso por cortesia";
    corpo = "Acesso completo concedido pela Alpha Inspeções — sem cobrança e sem prazo. Obrigado por usar o FieldCheck!";
  } else if (ehTrial) {
    cor = T.yellowDark; bg = "#FFF8E6"; emoji = "⏳";
    titulo = `Teste Intelligence · ${diasTrial} ${diasTrial === 1 ? "dia restante" : "dias restantes"}`;
    corpo = "Você está testando o plano completo. Ao fim do teste, sem assinatura, a conta fica em somente-leitura por 30 dias e depois é arquivada.";
  } else if (ehReadonly) {
    cor = T.red; bg = T.redBg; emoji = "🔒";
    titulo = tier === "archived" ? "Conta arquivada" : "Conta em somente leitura";
    corpo = "A leitura continua liberada; para criar e editar, reative um plano.";
  } else {
    titulo = `Plano ${ROTULO_PLANO[tier] ?? tier} ativo`;
    corpo = "Seu acesso está liberado. Obrigado por usar o FieldCheck!";
  }
  return (
    <Card style={{ borderLeft: `6px solid ${cor}`, background: bg }}>
      <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 20, color: cor, textTransform: "uppercase" }}>
        {emoji} {titulo}
      </div>
      <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 6, lineHeight: 1.6 }}>{corpo}</div>
    </Card>
  );
}

function CardPlano({
  tier, atual, ehAdmin, onAssinar,
}: {
  tier: TierPago;
  atual: boolean;
  ehAdmin: boolean;
  onAssinar: () => void;
}) {
  const p = PRECOS[tier];
  const destaque = tier === "intelligence";
  return (
    <Card
      style={{
        borderLeft: `6px solid ${destaque ? T.yellow : atual ? T.green : T.line}`,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 20, color: T.navy, textTransform: "uppercase" }}>
          {ROTULO_PLANO[tier]}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {destaque && <Selo cor={T.yellow} texto="Mais completo" />}
          {atual && <Selo cor={T.green} texto="Plano atual" />}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 26, color: T.ink }}>{p.valor}</span>
        <span style={{ fontSize: 13, color: T.inkSoft }}> {p.unidade}</span>
      </div>
      <div style={{ fontSize: 13.5, color: T.inkSoft, marginTop: 2 }}>{p.chamada}</div>
      {p.detalhe && <div style={{ fontSize: 12.5, color: T.yellowDark, fontWeight: 600, marginTop: 4 }}>{p.detalhe}</div>}
      {ehAdmin && (
        <div style={{ marginTop: 12 }}>
          {atual ? (
            <Botao variante="fantasma" onClick={() => {}} disabled>
              Seu plano
            </Botao>
          ) : (
            <Botao onClick={onAssinar}>Assinar {ROTULO_PLANO[tier]}</Botao>
          )}
        </div>
      )}
    </Card>
  );
}

function TabelaComparativa({
  matriz, limites, tierAtual,
}: {
  matriz: LinhaFeature[];
  limites: Record<string, LinhaLimite>;
  tierAtual: TierPago | null;
}) {
  const cols = ORDEM_TIERS;
  const th: CSSProperties = { padding: "8px 6px", textAlign: "center", fontSize: 12.5, fontFamily: FONT_HEAD, textTransform: "uppercase" };
  const td: CSSProperties = { padding: "7px 6px", textAlign: "center", fontSize: 13, borderTop: `1px solid ${T.line}` };
  return (
    <Card style={{ overflowX: "auto", padding: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 340 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", paddingLeft: 12 }}>Recurso</th>
            {cols.map((t) => (
              <th key={t} style={{ ...th, color: t === tierAtual ? T.green : T.navy, background: t === "intelligence" ? "#FFF8E6" : undefined }}>
                {ROTULO_PLANO[t]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRUPOS_COMPARACAO.map((g) => (
            <Fragment key={g.titulo}>
              <tr>
                <td colSpan={4} style={{ padding: "10px 12px 4px", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkSoft, background: T.bg }}>
                  {g.titulo}
                </td>
              </tr>
              {g.linhas.map((linha) => (
                <tr key={linha.rotulo}>
                  <td style={{ ...td, textAlign: "left", paddingLeft: 12, color: T.ink }}>{linha.rotulo}</td>
                  {cols.map((t) => (
                    <td key={t} style={{ ...td, background: t === "intelligence" ? "#FFFDF5" : undefined }}>
                      {linha.feature
                        ? temFeatureNaMatriz(t, linha.feature, matriz)
                          ? <span style={{ color: T.green, fontWeight: 700 }}>✓</span>
                          : <span style={{ color: T.line }}>—</span>
                        : linha.limite
                          ? <span style={{ color: T.inkSoft }}>{linha.limite.fmt(limites[t]?.[linha.limite.campo] ?? null, t)}</span>
                          : null}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Selo({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span style={{ background: cor === T.yellow ? "#FFF4D6" : T.greenBg, color: cor === T.yellow ? T.yellowDark : T.green, fontWeight: 700, fontSize: 11, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {texto}
    </span>
  );
}
