import { supabase } from "@/lib/supabase";
import type { TierPago } from "@/features/plano/vitrine";

// ============================================================
// Assinatura (Planos Onda 1): invoca a Edge Function criar-checkout com o
// plano escolhido (e assentos, no Intelligence) e redireciona ao Stripe.
// Sempre assinatura recorrente por cartão (Pix adiado nesta onda).
// ============================================================

export async function iniciarCheckout(
  plano: TierPago,
  seats?: number,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke("criar-checkout", {
    body: { plano, seats },
  });
  if (error) {
    return { error: "Pagamento indisponível no momento. Tente novamente em instantes." };
  }
  const resp = data as { url?: string; error?: string };
  if (resp?.url) {
    window.location.href = resp.url;
    return { error: null };
  }
  return { error: resp?.error ?? "Não foi possível iniciar o pagamento." };
}
