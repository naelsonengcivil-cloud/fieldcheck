import { useState } from "react";
import { Botao, Card, Header } from "@/components/ui";
import { T, FONT_HEAD } from "@/theme";
import { useAuth } from "@/features/auth/AuthProvider";
import { statusPlano } from "@/lib/plano";
import { iniciarCheckout } from "@/lib/assinatura";

// ============================================================
// Tela de plano/assinatura (RF16 / M12). Mostra o estado do plano e,
// para o admin, o botão Assinar (Stripe Checkout, cartão + Pix).
// ============================================================

export function TelaPlano({ onBack }: { onBack: () => void }) {
  const { empresa, perfil } = useAuth();
  const s = statusPlano(empresa);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehAdmin = perfil?.papel === "admin";
  const cor = !s.liberada ? T.red : s.estado === "ativo" ? T.green : T.yellowDark;

  async function assinar(modo: "assinatura" | "pix") {
    setEnviando(true);
    setErro(null);
    const { error } = await iniciarCheckout(modo);
    if (error) {
      setErro(error);
      setEnviando(false);
    }
    // sucesso: redireciona para o Stripe (não volta aqui).
  }

  const acessoAteBR = s.acessoAte
    ? new Date(s.acessoAte).toLocaleDateString("pt-BR")
    : null;

  return (
    <div>
      <Header titulo="Plano" sub={empresa?.nome} onBack={onBack} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <Card style={{ borderLeft: `6px solid ${cor}` }}>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 22, color: cor, textTransform: "uppercase" }}>
            {s.rotulo}
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 6, lineHeight: 1.6 }}>
            {s.estado === "ativo" && "Sua assinatura no cartão está ativa. Obrigado!"}
            {s.estado === "pix" && "Acesso liberado via pagamento por Pix."}
            {s.estado === "trial" &&
              "Você está no período de teste gratuito. Assine para não perder o acesso ao fim do trial."}
            {s.estado === "trial_expirado" &&
              "Seu teste gratuito terminou. A leitura continua liberada, mas para criar novas inspeções é preciso assinar."}
            {s.estado === "expirado" &&
              "Seu acesso pago terminou. A leitura continua liberada; para criar novas inspeções, renove."}
            {s.estado === "suspenso" &&
              "A assinatura está suspensa (pagamento pendente). Regularize para reativar as inspeções."}
          </div>
          {acessoAteBR && (
            <div style={{ fontSize: 13, color: T.inkSoft, marginTop: 8, fontWeight: 600 }}>
              {s.liberada ? "Acesso até" : "Encerrou em"}: {acessoAteBR}
            </div>
          )}
        </Card>

        {!s.liberada && (
          <Card style={{ background: "#FFF8E6", borderColor: T.yellow }}>
            <div style={{ fontSize: 14, color: T.yellowDark, fontWeight: 600, lineHeight: 1.6 }}>
              🔒 <b>Bloqueio suave ativo:</b> consultar obras, inspeções e relatórios
              segue liberado; criar novas inspeções fica bloqueado até a assinatura.
            </div>
          </Card>
        )}

        <Card>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", color: T.inkSoft }}>
            Assinatura FieldCheck
          </div>
          <div style={{ fontSize: 14, color: T.inkSoft, marginTop: 8, lineHeight: 1.6 }}>
            Pagamento por <b>cartão</b> ou <b>Pix</b>, processado com segurança pela
            Stripe. Cobrança da Alpha Inspeções e Auditoria.
          </div>
        </Card>

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

        {ehAdmin ? (
          <>
            <Botao onClick={() => void assinar("assinatura")} disabled={enviando}>
              {enviando
                ? "Abrindo pagamento…"
                : s.estado === "ativo"
                  ? "Gerenciar assinatura (cartão)"
                  : "Assinar mensal (cartão)"}
            </Botao>
            <Botao variante="fantasma" onClick={() => void assinar("pix")} disabled={enviando}>
              Pagar 1 mês por Pix
            </Botao>
            <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
              Cartão renova automaticamente todo mês. Pix libera 30 dias de acesso
              a cada pagamento (sem renovação automática).
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
            Apenas o administrador da empresa gerencia a assinatura. Fale com ele
            para assinar ou regularizar o plano.
          </div>
        )}
      </div>
    </div>
  );
}
