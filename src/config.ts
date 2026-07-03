// ============================================================
// Flags de configuração do app.
// ============================================================

/**
 * Pagamento por Pix (avulso). Manter `false` enquanto a conta Stripe da Alpha
 * NÃO tiver o Pix ativado (Stripe → Settings → Payment methods → Pix).
 * Com `false`, o app oferece só cartão e não expõe o botão de Pix — sem risco
 * de erro. Quando a conta for ativada: ativar o Pix no Stripe, mudar para
 * `true` e publicar (a Edge Function `criar-checkout` já suporta o modo pix,
 * então não precisa de redeploy de função).
 */
export const PIX_HABILITADO = false;
