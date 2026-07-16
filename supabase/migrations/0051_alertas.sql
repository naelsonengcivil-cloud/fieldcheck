-- ============================================================
-- 0051 — Marco L, Fase 1: Assistente de Alertas — CAMADA DE DETECÇÃO (sem IA).
-- Regras SQL determinísticas que viram alertas acionáveis para gestor/admin.
-- Funciona SEM IA (a Fase 2 apenas enriquece o alerta com `analise_ia`).
--
-- NOTA DE ARQUITETURA: as views do RF19 (0049) são a camada de leitura do
-- usuário/BI — filtram por `empresa_do_usuario()` e, por isso, retornam vazio
-- no cron (service_role, sem usuário autenticado). A detecção replica as MESMAS
-- definições sobre as tabelas base, cross-tenant, agrupando por empresa_id —
-- exatamente o padrão do `notificar_prazos()` (0028).
--
-- Referência temporal: `data_inspecao` (melhoria A, 0050), com fallback.
-- Apresentação honesta: `dados_fonte` carrega números + TAMANHO DE AMOSTRA.
-- Entrega: insere em `alertas` + fan-out em `notificacoes` (tipo
-- 'alerta_inteligente') → trigger 0027 dispara push; sino in-app já lê.
--
-- AGENDAMENTO (SQL Editor, após aplicar):
--   select cron.schedule('fieldcheck-alertas', '0 11 * * 1',  -- seg 08:00 BRT
--                        $$ select public.gerar_alertas(); $$);
-- Idempotente.
-- ============================================================

-- 1) Controles por empresa (Marco L, item e).
alter table public.empresas add column if not exists alertas_habilitado boolean not null default true;
alter table public.empresas add column if not exists alertas_frequencia text not null default 'semanal';
alter table public.empresas drop constraint if exists empresas_alertas_freq_chk;
alter table public.empresas add constraint empresas_alertas_freq_chk
  check (alertas_frequencia in ('semanal', 'diario'));

-- 2) Alertas gerados.
create table if not exists public.alertas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas on delete cascade,
  tipo          text not null,   -- nc_vencidas_obra | reincidencia_item | contratada_degradada | conformidade_baixa
  severidade    text not null,
  titulo        text not null,
  corpo         text not null,
  dados_fonte   jsonb not null default '{}'::jsonb, -- números + amostra (transparência)
  obra_id       uuid references public.obras on delete set null,
  chave_dedup   text not null,   -- evita repetir o mesmo alerta no mesmo período
  origem_ia     boolean not null default false,
  analise_ia    text,            -- Fase 2 (narrativa de gestão)
  notificado_em timestamptz,     -- fan-out para o sino/push já feito
  criado_em     timestamptz not null default now(),
  lido_em       timestamptz,
  constraint alertas_severidade_chk check (severidade in ('info', 'atencao', 'critico'))
);
create unique index if not exists uq_alertas_dedup on public.alertas (empresa_id, chave_dedup);
create index if not exists idx_alertas_empresa on public.alertas (empresa_id, criado_em desc);

alter table public.alertas enable row level security;

-- Leitura/baixa restritas a gestor/admin da própria empresa. Sem policy de
-- INSERT/DELETE → só a função (SECURITY DEFINER) e a service_role escrevem.
drop policy if exists alertas_select on public.alertas;
create policy alertas_select on public.alertas
  for select using (
    empresa_id = public.empresa_do_usuario()
    and public.papel_do_usuario() in ('admin', 'gestor')
  );
drop policy if exists alertas_update on public.alertas;
create policy alertas_update on public.alertas
  for update using (
    empresa_id = public.empresa_do_usuario()
    and public.papel_do_usuario() in ('admin', 'gestor')
  ) with check (
    empresa_id = public.empresa_do_usuario()
    and public.papel_do_usuario() in ('admin', 'gestor')
  );

-- 3) Detecção: gera os alertas do período. Retorna quantos foram criados.
create or replace function public.gerar_alertas()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_per    text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY"W"IW'); -- período (semana ISO)
  v_ini    date := v_hoje - 90;  -- janela de análise das regras históricas
  v_n      integer := 0;
  v_tot    integer := 0;
begin
  -- ---------- Regra 1: NCs VENCIDAS por obra ----------
  with vencidas as (
    select e.empresa_id, insp.obra_id, o.nome as obra,
           count(*) as n, min(e.prazo) as mais_antiga
    from public.eventos_nc e
    join public.respostas r    on r.id = e.resposta_id
    join public.inspecoes insp on insp.id = r.inspecao_id
    join public.obras o        on o.id = insp.obra_id
    join public.empresas emp   on emp.id = e.empresa_id and emp.alertas_habilitado
    where e.fechado_em is null and e.prazo is not null and e.prazo < v_hoje
    group by e.empresa_id, insp.obra_id, o.nome
  )
  insert into public.alertas (empresa_id, tipo, severidade, titulo, corpo, dados_fonte, obra_id, chave_dedup)
  select v.empresa_id, 'nc_vencidas_obra',
         case when v.n >= 3 then 'critico' else 'atencao' end,
         v.n || ' NC(s) vencida(s) — ' || v.obra,
         'A obra ' || v.obra || ' tem ' || v.n || ' não conformidade(s) com prazo vencido; a mais antiga venceu em '
           || to_char(v.mais_antiga, 'DD/MM') || '. Priorize o tratamento junto às contratadas responsáveis.',
         jsonb_build_object('ncs_vencidas', v.n, 'obra', v.obra, 'prazo_mais_antigo', v.mais_antiga),
         v.obra_id,
         'nc_vencidas:' || v.obra_id || ':' || v_per
  from vencidas v
  on conflict (empresa_id, chave_dedup) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  -- ---------- Regra 2: REINCIDÊNCIA por item de checklist (90 dias) ----------
  with base as (
    select insp.empresa_id, c.codigo as ck, it.ordem as item, it.texto as item_txt, r.resposta
    from public.respostas r
    join public.inspecoes insp on insp.id = r.inspecao_id and insp.status = 'finalizada'
    join public.checklists c   on c.id = insp.checklist_id
    join public.itens_checklist it on it.id = r.item_id
    join public.empresas emp   on emp.id = insp.empresa_id and emp.alertas_habilitado
    where coalesce(insp.data_inspecao, insp.finalizada_em)::date between v_ini and v_hoje
  ), agg as (
    select empresa_id, ck, item, min(item_txt) as item_txt,
           count(*) filter (where resposta = 'NC') as ncs,
           count(*) as amostra
    from base
    group by empresa_id, ck, item
    having count(*) filter (where resposta = 'NC') >= 2
  )
  insert into public.alertas (empresa_id, tipo, severidade, titulo, corpo, dados_fonte, chave_dedup)
  select a.empresa_id, 'reincidencia_item', 'atencao',
         'Reincidência: ' || a.ck || ' item ' || a.item,
         'O item "' || left(a.item_txt, 80) || '" (' || a.ck || ') teve ' || a.ncs || ' NC(s) em '
           || a.amostra || ' verificação(ões) nos últimos 90 dias ('
           || round(100.0 * a.ncs / nullif(a.amostra, 0), 1) || '%). Avalie causa raiz e ação preventiva.',
         jsonb_build_object('checklist', a.ck, 'item_numero', a.item, 'item', a.item_txt,
                            'ncs', a.ncs, 'amostra', a.amostra,
                            'taxa_pct', round(100.0 * a.ncs / nullif(a.amostra, 0), 1),
                            'janela_dias', 90),
         'reincidencia:' || a.ck || ':' || a.item || ':' || v_per
  from agg a
  on conflict (empresa_id, chave_dedup) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  -- ---------- Regra 3: CONTRATADA degradada (taxa de reprovação, 90 dias) ----------
  with ev as (
    select e.empresa_id, e.fechado_em,
           coalesce(ct.nome, insp.contratada, '—') as contratada,
           exists (select 1 from public.nc_transicoes t
                   where t.evento_id = e.id and t.para_status = 'reaberta') as reaberto
    from public.eventos_nc e
    join public.respostas r    on r.id = e.resposta_id
    join public.inspecoes insp on insp.id = r.inspecao_id
    join public.empresas emp   on emp.id = e.empresa_id and emp.alertas_habilitado
    left join public.contratadas ct on ct.id = e.contratada_id
    where coalesce(insp.data_inspecao, insp.finalizada_em)::date between v_ini and v_hoje
  ), agg as (
    select empresa_id, contratada,
           count(*) filter (where fechado_em is not null) as tratadas,
           count(*) filter (where reaberto) as reaberturas
    from ev
    where contratada <> '—'
    group by empresa_id, contratada
    having count(*) filter (where fechado_em is not null) >= 3   -- guarda de amostra
       and count(*) filter (where reaberto) >= 1
       and (100.0 * count(*) filter (where reaberto)
            / nullif(count(*) filter (where fechado_em is not null), 0)) >= 30
  )
  insert into public.alertas (empresa_id, tipo, severidade, titulo, corpo, dados_fonte, chave_dedup)
  select a.empresa_id, 'contratada_degradada',
         case when (100.0 * a.reaberturas / nullif(a.tratadas, 0)) >= 50 then 'critico' else 'atencao' end,
         'Qualidade do tratamento — ' || a.contratada,
         'A contratada ' || a.contratada || ' teve ' || a.reaberturas || ' reabertura(s) em '
           || a.tratadas || ' NC(s) tratada(s) nos últimos 90 dias ('
           || round(100.0 * a.reaberturas / nullif(a.tratadas, 0), 1)
           || '% de reprovação). Reveja a qualidade das correções entregues.',
         jsonb_build_object('contratada', a.contratada, 'tratadas', a.tratadas,
                            'reaberturas', a.reaberturas,
                            'taxa_reprovacao_pct', round(100.0 * a.reaberturas / nullif(a.tratadas, 0), 1),
                            'janela_dias', 90),
         'contratada:' || a.contratada || ':' || v_per
  from agg a
  on conflict (empresa_id, chave_dedup) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  -- ---------- Regra 4: OBRA com conformidade baixa (90 dias) ----------
  with base as (
    select insp.empresa_id, insp.obra_id, o.nome as obra, r.resposta, insp.id as insp_id
    from public.respostas r
    join public.inspecoes insp on insp.id = r.inspecao_id and insp.status = 'finalizada'
    join public.obras o        on o.id = insp.obra_id
    join public.empresas emp   on emp.id = insp.empresa_id and emp.alertas_habilitado
    where coalesce(insp.data_inspecao, insp.finalizada_em)::date between v_ini and v_hoje
  ), agg as (
    select empresa_id, obra_id, min(obra) as obra,
           count(distinct insp_id) as inspecoes,
           count(*) as pontos,
           count(*) filter (where resposta = 'NC') as ncs,
           round(100.0 * count(*) filter (where resposta in ('C', 'NA')) / nullif(count(*), 0), 1) as conf
    from base
    group by empresa_id, obra_id
    having count(*) >= 20                                        -- guarda de amostra
       and round(100.0 * count(*) filter (where resposta in ('C', 'NA')) / nullif(count(*), 0), 1) < 85
  )
  insert into public.alertas (empresa_id, tipo, severidade, titulo, corpo, dados_fonte, obra_id, chave_dedup)
  select a.empresa_id, 'conformidade_baixa',
         case when a.conf < 70 then 'critico' else 'atencao' end,
         'Conformidade baixa — ' || a.obra || ' (' || a.conf || '%)',
         'A obra ' || a.obra || ' está com ' || a.conf || '% de conformidade nos últimos 90 dias ('
           || a.ncs || ' NC(s) em ' || a.pontos || ' pontos inspecionados, ' || a.inspecoes
           || ' inspeção(ões)). Avalie as frentes com maior incidência.',
         jsonb_build_object('obra', a.obra, 'conformidade_pct', a.conf, 'ncs', a.ncs,
                            'pontos', a.pontos, 'inspecoes', a.inspecoes, 'janela_dias', 90),
         a.obra_id,
         'conformidade:' || a.obra_id || ':' || v_per
  from agg a
  on conflict (empresa_id, chave_dedup) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  -- ---------- Fan-out: sino + push para gestor/admin (uma vez por alerta) ----------
  insert into public.notificacoes (empresa_id, usuario_id, tipo, titulo, corpo, evento_id)
  select a.empresa_id, u.id, 'alerta_inteligente', a.titulo, a.corpo, null
  from public.alertas a
  join public.usuarios u
    on u.empresa_id = a.empresa_id and u.ativo and u.papel in ('gestor', 'admin')
  where a.notificado_em is null;

  update public.alertas set notificado_em = now() where notificado_em is null;

  return v_tot;
end; $$;

grant execute on function public.gerar_alertas() to service_role;
