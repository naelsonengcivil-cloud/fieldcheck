-- ============================================================
-- 0056 — Monetização Onda 1, Frente 2 (parte 3/4): MIGRAÇÃO + AUDITORIA + CRON.
-- Garante o PONTO CRÍTICO #3: migra as contas existentes para trial Intelligence
-- (30 dias, founder) — nenhuma conta perde acesso na virada. Cria a trilha de
-- auditoria (plan_events), o cron de transição trial→readonly→archived e, só
-- DEPOIS de migrar as linhas legadas, a constraint dos estados de `plano`.
-- Depende de 0054/0055. Idempotente.
-- ============================================================

-- 1) plano_vigente(): honra cortesia do super_admin (Marco F) = acesso completo.
--    (correção prometida; cortesia sobrepõe qualquer estado.)
create or replace function public.plano_vigente(p_empresa uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select case
    when e.cortesia_ate is not null and e.cortesia_ate > now() then 'intelligence'
    when e.plano = 'archived' then 'archived'
    when e.plano = 'readonly' then 'readonly'
    when e.plano = 'trial' then
      case when coalesce(e.trial_expira_em, e.criado_em + interval '30 days') > now()
           then 'intelligence' else 'readonly' end
    when e.plano = 'ativo' then 'intelligence'  -- legado pré-migração
    else e.plano
  end
  from public.empresas e
  where e.id = coalesce(p_empresa, public.empresa_do_usuario());
$$;

-- 2) Auditoria das mudanças de plano (diretriz de dados: evento + timestamp + origem).
create table if not exists public.plan_events (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas on delete cascade,
  evento     text not null,          -- migracao_onda1 | trial_iniciado | assinou | trial_expirado | arquivada | plano_alterado
  de_plano   text,
  para_plano text,
  origem     text not null,          -- migracao | webhook | cron | admin
  detalhe    jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_plan_events_empresa on public.plan_events (empresa_id, criado_em desc);
alter table public.plan_events enable row level security;
drop policy if exists plan_events_read on public.plan_events;
create policy plan_events_read on public.plan_events for select using (
  empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() in ('admin', 'gestor')
);

-- 3) MIGRAÇÃO das contas existentes → trial Intelligence 30d + founder (Onda 1).
--    Roda ANTES da constraint (as linhas legadas 'ativo'/'suspenso' precisam sair).
--    Só toca contas em estado legado (não mexe em quem já está num plano novo).
do $$
declare v_ate timestamptz := now() + interval '30 days';
begin
  create temp table _mig on commit drop as
    select id, plano as de_plano from public.empresas
     where plano not in ('basic', 'premium', 'intelligence', 'readonly', 'archived');

  update public.empresas e
     set plano = 'trial',
         trial_expira_em = v_ate,
         plan_started_at = coalesce(e.plan_started_at, now()),
         cohort = coalesce(e.cohort, 'onda1_fundador'),
         price_locked_until = coalesce(e.price_locked_until, now() + interval '12 months'),
         -- assinatura_ativa_ate é do modelo antigo (single-tier) → zera; o novo
         -- modelo usa `plano` como fonte de verdade (setado pelo webhook).
         assinatura_ativa_ate = null
   where e.id in (select id from _mig);

  insert into public.plan_events (empresa_id, evento, de_plano, para_plano, origem, detalhe)
  select m.id, 'migracao_onda1', m.de_plano, 'trial', 'migracao',
         jsonb_build_object('cortesia_dias', 30, 'cohort', 'onda1_fundador', 'trial_expira_em', v_ate)
  from _mig m;
end $$;

-- 4) Constraint dos estados de plano (após migrar as linhas legadas).
alter table public.empresas drop constraint if exists empresas_plano_chk;
alter table public.empresas add constraint empresas_plano_chk
  check (plano in ('trial', 'basic', 'premium', 'intelligence', 'readonly', 'archived'));

-- 5) Transição automática: trial expirado → readonly (30d) → archived.
--    Cortesia e assinatura futura protegem. Registra tudo em plan_events.
create or replace function public.transicionar_planos()
returns integer language plpgsql security definer set search_path = public as $$
declare v_ro int := 0; v_ar int := 0;
begin
  -- trial expirado (sem cortesia/assinatura vigente) → readonly
  with alvo as (
    update public.empresas e
       set plano = 'readonly', readonly_until = now()
     where e.plano = 'trial'
       and coalesce(e.trial_expira_em, e.criado_em + interval '30 days') < now()
       and coalesce(e.cortesia_ate, 'epoch'::timestamptz) < now()
       and coalesce(e.assinatura_ativa_ate, 'epoch'::timestamptz) < now()
     returning e.id
  )
  insert into public.plan_events (empresa_id, evento, de_plano, para_plano, origem)
  select id, 'trial_expirado', 'trial', 'readonly', 'cron' from alvo;
  get diagnostics v_ro = row_count;

  -- readonly há mais de 30 dias → archived
  with alvo as (
    update public.empresas e
       set plano = 'archived'
     where e.plano = 'readonly'
       and coalesce(e.readonly_until, now()) < now() - interval '30 days'
       and coalesce(e.cortesia_ate, 'epoch'::timestamptz) < now()
       and coalesce(e.assinatura_ativa_ate, 'epoch'::timestamptz) < now()
     returning e.id
  )
  insert into public.plan_events (empresa_id, evento, de_plano, para_plano, origem)
  select id, 'arquivada', 'readonly', 'archived', 'cron' from alvo;
  get diagnostics v_ar = row_count;

  return v_ro + v_ar;
end; $$;
grant execute on function public.transicionar_planos() to service_role;

-- AGENDAR (SQL Editor, após aplicar):
--   select cron.schedule('fieldcheck-planos-transicao', '30 11 * * *',  -- diário 08:30 BRT
--                        $$ select public.transicionar_planos(); $$);
