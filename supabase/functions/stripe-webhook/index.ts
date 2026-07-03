// ============================================================
// FieldCheck · Edge Function `stripe-webhook` (Fase 2 · M11)
// Recebe eventos do Stripe (assinatura da empresa), valida a assinatura
// do webhook e atualiza empresas.plano (ativo|suspenso) + datas.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
//          (o Stripe não envia JWT; a autenticidade vem da assinatura)
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// No painel do Stripe: adicione o endpoint
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   e copie o "Signing secret" para STRIPE_WEBHOOK_SECRET.
// ============================================================
import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      undefined,
      cryptoProvider,
    );
  } catch (e) {
    return new Response(`Assinatura inválida: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        await atualizarEmpresa(s.metadata?.empresa_id, s.customer as string, {
          plano: "ativo",
          stripe_subscription_id: (s.subscription as string) ?? null,
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const ativo = sub.status === "active" || sub.status === "trialing";
        await atualizarEmpresa(sub.metadata?.empresa_id, sub.customer as string, {
          plano: ativo ? "ativo" : "suspenso",
          stripe_subscription_id: sub.id,
          assinatura_ativa_ate: new Date(sub.current_period_end * 1000).toISOString(),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await atualizarEmpresa(sub.metadata?.empresa_id, sub.customer as string, {
          plano: "suspenso",
        });
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        await atualizarEmpresa(undefined, inv.customer as string, { plano: "suspenso" });
        break;
      }
    }
  } catch (e) {
    return new Response(`Erro ao processar: ${(e as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

/** Atualiza a empresa por empresa_id (metadata) ou, na falta, por stripe_customer_id. */
async function atualizarEmpresa(
  empresaId: string | undefined,
  customerId: string | undefined,
  campos: Record<string, unknown>,
) {
  const q = admin.from("empresas").update({ ...campos, stripe_customer_id: customerId });
  if (empresaId) await q.eq("id", empresaId);
  else if (customerId) await q.eq("stripe_customer_id", customerId);
}
