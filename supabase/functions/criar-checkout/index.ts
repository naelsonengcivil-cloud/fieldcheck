// ============================================================
// FieldCheck · Edge Function `criar-checkout` (Fase 2 · M11)
// Cria uma Stripe Checkout Session (assinatura, cartão + Pix) para a
// empresa do usuário admin logado e devolve a URL de pagamento.
//
// Deploy:  supabase functions deploy criar-checkout
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, APP_URL
//          (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados
//           automaticamente no runtime das Edge Functions)
// Requer JWT do usuário (Authorization: Bearer <token>).
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

    // 2) Cliente com service role p/ ler/atualizar a empresa.
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

    // 3) Garante um customer Stripe para a empresa.
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

    // 4) Checkout Session (assinatura, cartão + Pix).
    const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card", "pix"],
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
      success_url: `${appUrl}/?assinatura=ok`,
      cancel_url: `${appUrl}/?assinatura=cancelada`,
      metadata: { empresa_id: empresa!.id },
      subscription_data: { metadata: { empresa_id: empresa!.id } },
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
