import { supabase } from "@/lib/supabase";

// ============================================================
// Assinatura (M12 + Pix avulso): invoca a Edge Function criar-checkout
// e redireciona ao Stripe. modo 'assinatura' = cartão recorrente;
// modo 'pix' = pagamento único por Pix (1 período).
// ============================================================

export type ModoPagamento = "assinatura" | "pix";

export async function iniciarCheckout(
  modo: ModoPagamento = "assinatura",
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke("criar-checkout", {
    body: { modo },
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
