// ============================================================
// FieldCheck · Edge Function `stripe-webhook` — Monetização Onda 1 (multi-tier).
// Recebe eventos de assinatura do Stripe, valida a assinatura do webhook e
// sincroniza o estado do tenant: plano (basic|premium|intelligence|readonly),
// seats, stripe_subscription_id + trilha em plan_events.
//
// Mapa Price ID → plano via env vars (SEM hardcode; a virada live só troca vars):
//   STRIPE_PRICE_BASIC / STRIPE_PRICE_PREMIUM / STRIPE_PRICE_INTELLIGENCE
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_*
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

const PRICE_TO_PLANO: Record<string, string> = {};
const reg = (id: string | undefined, plano: string) => { if (id) PRICE_TO_PLANO[id] = plano; };
reg(Deno.env.get("STRIPE_PRICE_BASIC"), "basic");
reg(Deno.env.get("STRIPE_PRICE_PREMIUM"), "premium");
reg(Deno.env.get("STRIPE_PRICE_INTELLIGENCE"), "intelligence");

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, cryptoProvider,
    );
  } catch (e) {
    return new Response(`Assinatura inválida: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await sincronizarAssinatura(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        // Assinatura cancelada → conta entra em readonly (dados preservados).
        const sub = event.data.object as Stripe.Subscription;
        await mudarPlano(sub.metadata?.empresa_id, sub.customer as string, "readonly", {
          readonly_until: new Date().toISOString(),
        }, "subscription_deleted", "webhook");
        break;
      }
      case "customer.subscription.trial_will_end": {
        // Aviso D-3: notifica os gestores/admins (sino + push).
        const sub = event.data.object as Stripe.Subscription;
        await avisarFimTrial(sub);
        break;
      }
      case "invoice.payment_failed": {
        // Pagamento falhou: registra + avisa. O rebaixamento vem no
        // subscription.updated (past_due/unpaid) → readonly.
        const inv = event.data.object as Stripe.Invoice;
        await registrarEvento(undefined, inv.customer as string, "payment_failed", "webhook", {
          invoice: inv.id, attempt: inv.attempt_count,
        });
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

/** Sincroniza plano + seats a partir da assinatura (item + status). */
async function sincronizarAssinatura(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? "";
  const tier = PRICE_TO_PLANO[priceId];
  if (!tier) {
    // Preço desconhecido (ex.: plano antigo/arquivado) → só registra, não muda estado.
    await registrarEvento(sub.metadata?.empresa_id, sub.customer as string, "assinatura_preco_desconhecido", "webhook", { price: priceId, status: sub.status });
    return;
  }
  const ativa = sub.status === "active" || sub.status === "trialing";
  const seats = tier === "intelligence" ? (item?.quantity ?? null) : null;

  const campos: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    seats,
    plan_started_at: new Date((sub.start_date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  };
  if (sub.metadata?.cohort) campos.cohort = sub.metadata.cohort;
  if (sub.metadata?.price_locked_until) campos.price_locked_until = sub.metadata.price_locked_until;

  // Ativa/trialing → o tier; qualquer outro status → readonly (perde acesso, mantém dados).
  const plano = ativa ? tier : "readonly";
  if (!ativa) campos.readonly_until = new Date().toISOString();

  await mudarPlano(sub.metadata?.empresa_id, sub.customer as string, plano, campos, "assinatura_" + sub.status, "webhook");
}

/** Cria uma notificação de fim de trial (D-3) para gestores/admins da empresa. */
async function avisarFimTrial(sub: Stripe.Subscription) {
  const empresaId = await resolverEmpresa(sub.metadata?.empresa_id, sub.customer as string);
  if (!empresaId) return;
  const { data: gestores } = await admin
    .from("usuarios").select("id").eq("empresa_id", empresaId).eq("ativo", true).in("papel", ["gestor", "admin"]);
  const fim = sub.trial_end ? new Date(sub.trial_end * 1000).toLocaleDateString("pt-BR") : "em breve";
  for (const u of gestores ?? []) {
    await admin.from("notificacoes").insert({
      empresa_id: empresaId, usuario_id: u.id, tipo: "alerta_inteligente",
      titulo: "Seu teste do Intelligence termina em breve",
      corpo: `O período de teste encerra ${fim}. Escolha um plano para não perder acesso.`,
    });
  }
  await registrarEvento(empresaId, sub.customer as string, "trial_will_end", "webhook", { trial_end: sub.trial_end });
}

/** Muda o plano da empresa e registra a transição em plan_events. */
async function mudarPlano(
  empresaId: string | undefined,
  customerId: string | undefined,
  plano: string,
  campos: Record<string, unknown>,
  evento: string,
  origem: string,
) {
  const id = await resolverEmpresa(empresaId, customerId);
  if (!id) return;
  const { data: antes } = await admin.from("empresas").select("plano").eq("id", id).maybeSingle();
  await admin.from("empresas").update({ ...campos, plano, stripe_customer_id: customerId }).eq("id", id);
  await admin.from("plan_events").insert({
    empresa_id: id, evento, de_plano: antes?.plano ?? null, para_plano: plano, origem, detalhe: {},
  });
}

async function registrarEvento(
  empresaId: string | undefined, customerId: string | undefined,
  evento: string, origem: string, detalhe: Record<string, unknown>,
) {
  const id = await resolverEmpresa(empresaId, customerId);
  if (!id) return;
  await admin.from("plan_events").insert({ empresa_id: id, evento, origem, detalhe });
}

/** Resolve a empresa por metadata.empresa_id ou por stripe_customer_id. */
async function resolverEmpresa(empresaId: string | undefined, customerId: string | undefined): Promise<string | null> {
  if (empresaId) return empresaId;
  if (!customerId) return null;
  const { data } = await admin.from("empresas").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id ?? null;
}
