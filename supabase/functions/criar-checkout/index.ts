// ============================================================
// FieldCheck · Edge Function `criar-checkout` (Planos Onda 1 — multi-tier)
// Cria uma Stripe Checkout Session de ASSINATURA (cartão) para o plano
// escolhido pela empresa do admin logado e devolve a URL de pagamento.
//
//   Body: { plano: 'basic' | 'premium' | 'intelligence', seats?: number }
//   • basic/premium  → quantity 1 (preço fixo)
//   • intelligence   → quantity = seats (por assento, mín. 3)
//
// Deploy:  supabase functions deploy criar-checkout
// Secrets: STRIPE_SECRET_KEY, APP_URL,
//          STRIPE_PRICE_BASIC / STRIPE_PRICE_PREMIUM / STRIPE_PRICE_INTELLIGENCE
//          (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
//           são injetados no runtime das Edge Functions)
// Requer JWT do usuário admin (Authorization: Bearer <token>).
// ============================================================
import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});

// Preço por tier (mesmos secrets do webhook).
const PRICE_BY_PLANO: Record<string, string | undefined> = {
  basic: Deno.env.get("STRIPE_PRICE_BASIC"),
  premium: Deno.env.get("STRIPE_PRICE_PREMIUM"),
  intelligence: Deno.env.get("STRIPE_PRICE_INTELLIGENCE"),
};

const SEATS_MIN_INTELLIGENCE = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // 1) Identifica o usuário pelo JWT.
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Não autenticado." }, 401);
    }

    // 2) Lê o corpo: plano + assentos.
    let plano = "";
    let seats = SEATS_MIN_INTELLIGENCE;
    try {
      const b = await req.json();
      if (typeof b?.plano === "string") plano = b.plano;
      if (Number.isFinite(b?.seats)) seats = Math.floor(b.seats);
    } catch {
      /* corpo inválido */
    }
    if (!(plano in PRICE_BY_PLANO)) {
      return json({ error: "Plano inválido." }, 400);
    }
    const priceId = PRICE_BY_PLANO[plano];
    if (!priceId) {
      return json({ error: `Preço do plano ${plano} não configurado.` }, 500);
    }
    const quantity = plano === "intelligence" ? Math.max(SEATS_MIN_INTELLIGENCE, seats) : 1;

    // 3) Cliente com service role p/ ler/atualizar a empresa.
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: usuario } = await admin
      .from("usuarios")
      .select("empresa_id, papel")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!usuario) return json({ error: "Usuário sem empresa." }, 400);
    if (usuario.papel !== "admin") {
      return json({ error: "Apenas administradores gerenciam a assinatura." }, 403);
    }

    const { data: empresa } = await admin
      .from("empresas")
      .select("id, nome, stripe_customer_id")
      .eq("id", usuario.empresa_id)
      .single();

    // 4) Garante um customer Stripe para a empresa.
    let customerId = empresa!.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email ?? undefined,
        name: empresa!.nome,
        metadata: { empresa_id: empresa!.id },
      });
      customerId = customer.id;
      await admin.from("empresas").update({ stripe_customer_id: customerId }).eq("id", empresa!.id);
    }

    // 5) Checkout Session de assinatura (cartão; métodos dinâmicos do Dashboard).
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity }],
      success_url: `${appUrl}/?assinatura=ok`,
      cancel_url: `${appUrl}/?assinatura=cancelada`,
      metadata: { empresa_id: empresa!.id, plano },
      subscription_data: { metadata: { empresa_id: empresa!.id, plano } },
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
