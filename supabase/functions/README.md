# Edge Functions — Assinatura Stripe (M11)

Duas funções: `criar-checkout` (gera a sessão de pagamento) e `stripe-webhook`
(recebe eventos do Stripe e atualiza `empresas.plano`). Só entram em operação
quando a **Alpha** tiver uma conta Stripe (Brasil, com **Pix** habilitado).

## Pré-requisitos
- Supabase CLI (`npm i -g supabase`) e `supabase login`.
- `supabase link --project-ref <ref>` (ref do projeto).
- Aplicar a migration `0008_stripe.sql` no SQL Editor.
- Conta Stripe com um **Produto + Preço recorrente** (mensal) → anote o `price_id`.

## Configurar segredos
```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_ID=price_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  APP_URL=https://SEU-APP.vercel.app
# SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no runtime das functions.
```

## Deploy
```bash
supabase functions deploy criar-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```
> `--no-verify-jwt` no webhook porque o Stripe não envia JWT — a autenticidade
> é garantida pela assinatura (`STRIPE_WEBHOOK_SECRET`).

## Registrar o webhook no Stripe
No painel do Stripe → **Developers → Webhooks → Add endpoint**:
- URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Eventos: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`.
- Copie o **Signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.

## Fluxo
1. Admin clica em **Assinar** no app (tela de plano — M12).
2. App chama `criar-checkout` (com o JWT) → recebe a URL → redireciona ao Stripe.
3. Pagamento (cartão ou Pix) concluído → Stripe dispara o webhook.
4. `stripe-webhook` valida e atualiza `empresas.plano = 'ativo'` +
   `assinatura_ativa_ate`. Falha/cancelamento → `suspenso`.
5. O **bloqueio suave** (M12) usa `empresa_liberada()` para permitir leitura e
   bloquear escrita quando o trial expira / plano suspenso.

> Teste em **modo test** do Stripe (chaves `sk_test`/`whsec` de teste e
> `stripe listen --forward-to` para o webhook local) antes de produção.
