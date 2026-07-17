-- ============================================================
-- 0054 — Monetização Onda 1, Frente 2 (parte 1/4): SCHEMA + CONFIG + GATING.
-- Fundação dos planos: estados, colunas na empresa, tabelas de CONFIG
-- (plan_limits, plan_features — nada hardcoded no código) e as funções de
-- leitura do plano vigente / feature-flags / limites.
--
-- NÃO altera a constraint de `plano` nem migra contas ainda (isso é a parte
-- 3/4, na ordem crítica: migrar contas existentes ANTES de ativar os gates).
-- NÃO ativa enforcement ainda (parte 2/4). Depende de 0001/0006/0008. Idempotente.
--
-- Diretriz de dados: mudanças de plano são auditadas em plan_events (parte 3/4).
-- ============================================================

-- 1) Colunas de plano na empresa (trial_expira_em já existe = fim do trial).
alter table public.empresas add column if not exists plan_started_at   timestamptz;
alter table public.empresas add column if not exists readonly_until     timestamptz; -- quando entrou em readonly (arquiva após +30d)
alter table public.empresas add column if not exists seats              int;         -- Intelligence: qtd de assentos (= quantity da subscription)
alter table public.empresas add column if not exists cohort             text;        -- ex.: 'onda1_fundador'
alter table public.empresas add column if not exists price_locked_until timestamptz; -- founder: preço travado até esta data

-- 2) CONFIG — limites por plano (null = ilimitado). Sem hardcode no app.
create table if not exists public.plan_limits (
  plano                     text primary key,
  obras_ativas              int,      -- null = ilimitado
  usuarios                  int,      -- null = ilimitado (Intelligence usa `seats`)
  checklists_personalizados int,
  storage_gb                numeric,
  retencao_dias             int       -- null = ilimitado
);
insert into public.plan_limits (plano, obras_ativas, usuarios, checklists_personalizados, storage_gb, retencao_dias) values
  ('basic',        1,    1,    3,    2,   30),
  ('premium',      null, 5,    null, 20,  365),
  ('intelligence', null, null, null, 100, null)
on conflict (plano) do update set
  obras_ativas = excluded.obras_ativas, usuarios = excluded.usuarios,
  checklists_personalizados = excluded.checklists_personalizados,
  storage_gb = excluded.storage_gb, retencao_dias = excluded.retencao_dias;

-- 3) CONFIG — feature-flags por plano (true = incluído). Matriz aprovada Onda 1.
create table if not exists public.plan_features (
  feature      text primary key,
  basic        boolean not null default false,
  premium      boolean not null default false,
  intelligence boolean not null default false,
  descricao    text
);
insert into public.plan_features (feature, basic, premium, intelligence, descricao) values
  ('core_inspections',      true,  true,  true,  'Catálogo 83 checklists, kits, offline, assinatura, PDF com logo, APK'),
  ('nc_management_full',    false, true,  true,  'Criticidade + prazos estruturados completos (básico no Basic)'),
  ('nc_fiscal_executora',   false, true,  true,  'Ciclo fiscal–executora'),
  ('push_notifications',    false, true,  true,  'Notificações push (FCM)'),
  ('roles_permissions',     false, true,  true,  'Papéis e permissões'),
  ('data_export',           false, true,  true,  'Exportação Excel/CSV'),
  ('bi_dashboard_summary',  false, true,  true,  'Dashboard resumo (RF19 parcial)'),
  ('bi_full',               false, false, true,  'RF19 completo (views/BI)'),
  ('ai_nc_argumentation',   false, false, true,  'Redação de RNC por IA (Marco K absorvido)'),
  ('smart_alerts',          false, false, true,  'Alertas inteligentes com IA (Marco L)'),
  ('bird_pyramid',          false, false, true,  'Pirâmide de Bird + ocorrências'),
  ('multi_project_reports', false, false, true,  'Relatórios consolidados multi-obra'),
  ('trend_analysis',        false, false, true,  'Tendências entre obras'),
  ('api_webhooks',          false, false, true,  'API / webhooks')
on conflict (feature) do update set
  basic = excluded.basic, premium = excluded.premium, intelligence = excluded.intelligence,
  descricao = excluded.descricao;

-- Config legível por qualquer usuário autenticado (a UI mostra a matriz na página de planos).
alter table public.plan_limits enable row level security;
alter table public.plan_features enable row level security;
drop policy if exists plan_limits_read on public.plan_limits;
create policy plan_limits_read on public.plan_limits for select to authenticated using (true);
drop policy if exists plan_features_read on public.plan_features;
create policy plan_features_read on public.plan_features for select to authenticated using (true);

-- 4) plano_vigente(): o TIER usado para gating (features + limites).
--    trial válido → 'intelligence' (acesso completo, aversão à perda);
--    trial expirado / readonly / archived → refletido como está;
--    basic|premium|intelligence → o próprio.
--    Legado ('ativo') → tratado como 'intelligence' até a migração (parte 3/4).
create or replace function public.plano_vigente(p_empresa uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select case
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
grant execute on function public.plano_vigente(uuid) to authenticated;

-- 5) tem_feature(): a empresa (plano vigente) inclui a feature?
--    Reaproveita o gate `ia_habilitada` para as features de IA (não duplica
--    mecanismo): ter a feature de IA exige plano premium/intelligence adequado
--    E o admin não ter desligado a IA.
create or replace function public.tem_feature(p_feature text, p_empresa uuid default null)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_tier text := public.plano_vigente(coalesce(p_empresa, public.empresa_do_usuario()));
  v_ok boolean;
  v_ia boolean;
begin
  select case v_tier
           when 'basic' then f.basic
           when 'premium' then f.premium
           when 'intelligence' then f.intelligence
           else false  -- readonly/archived: sem features de criação
         end
    into v_ok
  from public.plan_features f where f.feature = p_feature;
  v_ok := coalesce(v_ok, false);

  -- Gate de IA existente (ia_habilitada) modula as features que usam IA.
  if v_ok and p_feature = 'ai_nc_argumentation' then
    select coalesce(ia_habilitada, true) into v_ia from public.empresas
     where id = coalesce(p_empresa, public.empresa_do_usuario());
    v_ok := coalesce(v_ia, true);
  end if;
  if v_ok and p_feature = 'smart_alerts' then
    select coalesce(alertas_ia_habilitado, true) into v_ia from public.empresas
     where id = coalesce(p_empresa, public.empresa_do_usuario());
    v_ok := coalesce(v_ia, true);
  end if;

  return v_ok;
end; $$;
grant execute on function public.tem_feature(text, uuid) to authenticated;

-- 6) limite_de(): valor do limite (null = ilimitado) do plano vigente.
create or replace function public.limite_de(p_tipo text, p_empresa uuid default null)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_tier text := public.plano_vigente(coalesce(p_empresa, public.empresa_do_usuario()));
  v_lim int;
  v_seats int;
begin
  if v_tier in ('readonly', 'archived') then return 0; end if;  -- sem criação
  select case p_tipo
           when 'obras' then obras_ativas
           when 'usuarios' then usuarios
           when 'checklists' then checklists_personalizados
           else null end
    into v_lim
  from public.plan_limits where plano = v_tier;

  -- Intelligence: o limite de usuários = seats da subscription.
  if p_tipo = 'usuarios' and v_tier = 'intelligence' then
    select seats into v_seats from public.empresas
     where id = coalesce(p_empresa, public.empresa_do_usuario());
    return v_seats; -- null = ilimitado (trial ainda sem seats definidos)
  end if;
  return v_lim; -- null = ilimitado
end; $$;
grant execute on function public.limite_de(text, uuid) to authenticated;
