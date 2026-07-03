import { supabase } from "@/lib/supabase";

// ============================================================
// Assinatura (M12): chama a Edge Function `criar-checkout` e redireciona
// o admin ao Stripe Checkout (cartão + Pix). A função retorna a URL da
// sessão; o webhook do Stripe ativa o plano depois do pagamento.
// ============================================================

export async function iniciarCheckout(): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke("criar-checkout", { body: {} });
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
