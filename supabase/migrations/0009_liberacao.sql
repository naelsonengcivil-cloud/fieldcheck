-- ============================================================
-- FieldCheck · Migration 0009 — Regra de liberação (cartão + Pix avulso)
-- Atualiza empresa_liberada() para refletir os dois modelos de pagamento:
--   - cartão recorrente: plano 'ativo' + stripe_subscription_id;
--   - Pix avulso: plano 'ativo' + assinatura_ativa_ate futura;
--   - trial: plano 'trial' válido.
-- (Espelha src/lib/plano.ts.) Aplicar no SQL Editor. Idempotente.
-- ============================================================

create or replace function public.empresa_liberada()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select
        (e.plano = 'trial'
          and coalesce(e.trial_expira_em, e.criado_em + interval '14 days') > now())
        or (e.plano = 'ativo' and e.stripe_subscription_id is not null)
        or (e.plano = 'ativo' and e.assinatura_ativa_ate is not null and e.assinatura_ativa_ate > now())
      from public.empresas e
      where e.id = public.empresa_do_usuario()
    ),
    false
  );
$$;
grant execute on function public.empresa_liberada() to authenticated;
