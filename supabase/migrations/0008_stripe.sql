-- ============================================================
-- FieldCheck · Migration 0008 — Assinatura Stripe (Fase 2 · M11 / RF16)
-- Campos de assinatura na empresa. O plano em si (trial|ativo|suspenso)
-- e trial_expira_em já existem (0001/0006). O webhook do Stripe (Edge
-- Function) atualiza estes campos. Aplicar no SQL Editor. Idempotente.
-- ============================================================

alter table public.empresas
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists assinatura_ativa_ate timestamptz;

create index if not exists idx_empresas_stripe_customer
  on public.empresas (stripe_customer_id);

-- Helper: a empresa do usuário está com acesso liberado?
-- (plano ativo, OU trial ainda válido). Usado pelo bloqueio suave (M12).
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
        e.plano = 'ativo'
        or (e.plano = 'trial' and coalesce(e.trial_expira_em, e.criado_em + interval '14 days') > now())
      from public.empresas e
      where e.id = public.empresa_do_usuario()
    ),
    false
  );
$$;
grant execute on function public.empresa_liberada() to authenticated;
