-- ============================================================
-- 0053 — Marco L, Fase 3: gatilho agudo + frequência + gate próprio da IA.
--
-- (1) `empresas.alertas_ia_habilitado` — gate PRÓPRIO da análise por IA nos
--     alertas, INDEPENDENTE de `ia_habilitada` (que é a redação de RNC, K2).
--     Isso dá 3 estados por empresa — a fronteira do add-on premium:
--       sem alertas            → alertas_habilitado = false
--       só detecção (base)     → alertas_habilitado = true,  alertas_ia_habilitado = false  (custo zero)
--       com análise de IA      → alertas_habilitado = true,  alertas_ia_habilitado = true   (premium)
--
-- (2) GATILHO AGUDO — NC crítica + vencida + em item já reincidente (>=2 NCs
--     em 90d). Roda TODO DIA para todas as empresas com alertas ligados
--     (urgente por definição, não espera o digest). Dedup POR EVENTO: alerta
--     uma vez por NC, não por período.
--     Obs.: "vencida" é condição de TEMPO (não de evento) → não dá para usar
--     trigger; por isso o cron diário.
--
-- (3) FREQUÊNCIA — o cron passa a rodar DIARIAMENTE e a função decide quem
--     está "no dia": 'diario' → todo dia; 'semanal' → só segunda (ISO dow 1).
--     `p_forcar` ignora a janela (útil para teste manual).
--
-- Substitui a gerar_alertas() de 0051 (drop + create p/ trocar a assinatura).
-- Depende de 0051. Idempotente.
--
-- REAGENDAR o cron (SQL Editor) — passa de semanal para diário:
--   select cron.unschedule('fieldcheck-alertas');
--   select cron.schedule('fieldcheck-alertas', '0 11 * * *',  -- todo dia 08:00 BRT
--                        $$ select public.gerar_alertas(); $$);
-- ============================================================

-- (1) Gate próprio da IA nos alertas.
alter table public.empresas add column if not exists alertas_ia_habilitado boolean not null default true;

-- Troca de assinatura: remove a versão sem parâmetro (0051).
drop function if exists public.gerar_alertas();

create or replace function public.gerar_alertas(p_forcar boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dow  int  := extract(isodow from (now() at time zone 'America/Sao_Paulo')::date); -- 1 = segunda
  v_per  text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY"W"IW');
  v_ini  date := v_hoje - 90;
  v_n    integer := 0;
  v_tot  integer := 0;
begin
  -- ============ GATILHO AGUDO (todo dia, independe da frequência) ============
  -- NC crítica + vencida + item reincidente → prioridade máxima.
  with reincidentes as (
    select insp.empresa_id, r.item_id
    from public.respostas r
    join public.inspecoes insp on insp.id = r.inspecao_id and insp.status = 'finalizada'
    where coalesce(insp.data_inspecao, insp.finalizada_em)::date between v_ini and v_hoje
      and r.resposta = 'NC'
    group by insp.empresa_id, r.item_id
    having count(*) >= 2
  ), agudo as (
    select e.id as evento_id, e.empresa_id, insp.obra_id, o.nome as obra, e.prazo,
           coalesce(it.texto, 'NC') as item, (v_hoje - e.prazo) as dias_atraso
    from public.eventos_nc e
    join public.respostas r     on r.id = e.resposta_id
    join public.inspecoes insp  on insp.id = r.inspecao_id
    join public.obras o         on o.id = insp.obra_id
    join public.empresas emp    on emp.id = e.empresa_id and emp.alertas_habilitado
    join reincidentes rc        on rc.empresa_id = e.empresa_id and rc.item_id = r.item_id
    left join public.itens_checklist it on it.id = r.item_id
    where e.fechado_em is null
      and e.criticidade = 'critica'
      and e.prazo is not null
      and e.prazo < v_hoje
  )
  insert into public.alertas (empresa_id, tipo, severidade, titulo, corpo, dados_fonte, obra_id, chave_dedup)
  select a.empresa_id, 'critico_agudo', 'critico',
         'Ação imediata — NC crítica vencida e reincidente (' || a.obra || ')',
         'A NC crítica "' || left(a.item, 70) || '" na obra ' || a.obra || ' está vencida há '
           || a.dias_atraso || ' dia(s) e o item já é reincidente no período. Combinação de maior risco: '
           || 'trate com prioridade máxima e confirme a eficácia da correção antes de encerrar.',
         jsonb_build_object('obra', a.obra, 'item', a.item, 'criticidade', 'critica',
                            'prazo', a.prazo, 'dias_atraso', a.dias_atraso, 'reincidente', true,
                            'janela_dias', 90),
         a.obra_id,
         'agudo:' || a.evento_id            -- dedup por NC (uma vez por evento)
  from agudo a
  on conflict (empresa_id, chave_dedup) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  -- ============ DIGEST (só para quem está "no dia") ============
  -- O gate de frequência vai no join de cada regra:
  --   (p_forcar or emp.alertas_frequencia = 'diario' or v_dow = 1)
  -- → 'diario' roda todo dia; 'semanal' roda só na segunda; p_forcar ignora a janela.

  -- Regra 1: NCs VENCIDAS por obra
  with vencidas as (
    select e.empresa_id, insp.obra_id, o.nome as obra,
           count(*) as n, min(e.prazo) as mais_antiga
    from public.eventos_nc e
    join public.respostas r    on r.id = e.resposta_id
    join public.inspecoes insp on insp.id = r.inspecao_id
    join public.obras o        on o.id = insp.obra_id
    join public.empresas emp   on emp.id = e.empresa_id and emp.alertas_habilitado
                              and (p_forcar or emp.alertas_frequencia = 'diario' or v_dow = 1)
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

  -- Regra 2: REINCIDÊNCIA por item de checklist (90 dias)
  with base as (
    select insp.empresa_id, c.codigo as ck, it.ordem as item, it.texto as item_txt, r.resposta
    from public.respostas r
    join public.inspecoes insp on insp.id = r.inspecao_id and insp.status = 'finalizada'
    join public.checklists c   on c.id = insp.checklist_id
    join public.itens_checklist it on it.id = r.item_id
    join public.empresas emp   on emp.id = insp.empresa_id and emp.alertas_habilitado
                              and (p_forcar or emp.alertas_frequencia = 'diario' or v_dow = 1)
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

  -- Regra 3: CONTRATADA degradada (taxa de reprovação, 90 dias)
  with ev as (
    select e.empresa_id, e.fechado_em,
           coalesce(ct.nome, insp.contratada, '—') as contratada,
           exists (select 1 from public.nc_transicoes t
                   where t.evento_id = e.id and t.para_status = 'reaberta') as reaberto
    from public.eventos_nc e
    join public.respostas r    on r.id = e.resposta_id
    join public.inspecoes insp on insp.id = r.inspecao_id
    join public.empresas emp   on emp.id = e.empresa_id and emp.alertas_habilitado
                              and (p_forcar or emp.alertas_frequencia = 'diario' or v_dow = 1)
    left join public.contratadas ct on ct.id = e.contratada_id
    where coalesce(insp.data_inspecao, insp.finalizada_em)::date between v_ini and v_hoje
  ), agg as (
    select empresa_id, contratada,
           count(*) filter (where fechado_em is not null) as tratadas,
           count(*) filter (where reaberto) as reaberturas
    from ev
    where contratada <> '—'
    group by empresa_id, contratada
    having count(*) filter (where fechado_em is not null) >= 3
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

  -- Regra 4: OBRA com conformidade baixa (90 dias)
  with base as (
    select insp.empresa_id, insp.obra_id, o.nome as obra, r.resposta, insp.id as insp_id
    from public.respostas r
    join public.inspecoes insp on insp.id = r.inspecao_id and insp.status = 'finalizada'
    join public.obras o        on o.id = insp.obra_id
    join public.empresas emp   on emp.id = insp.empresa_id and emp.alertas_habilitado
                              and (p_forcar or emp.alertas_frequencia = 'diario' or v_dow = 1)
    where coalesce(insp.data_inspecao, insp.finalizada_em)::date between v_ini and v_hoje
  ), agg as (
    select empresa_id, obra_id, min(obra) as obra,
           count(distinct insp_id) as inspecoes,
           count(*) as pontos,
           count(*) filter (where resposta = 'NC') as ncs,
           round(100.0 * count(*) filter (where resposta in ('C', 'NA')) / nullif(count(*), 0), 1) as conf
    from base
    group by empresa_id, obra_id
    having count(*) >= 20
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

  -- ============ Fan-out: sino + push (gestor/admin), uma vez por alerta ============
  insert into public.notificacoes (empresa_id, usuario_id, tipo, titulo, corpo, evento_id)
  select a.empresa_id, u.id, 'alerta_inteligente', a.titulo, a.corpo, null
  from public.alertas a
  join public.usuarios u
    on u.empresa_id = a.empresa_id and u.ativo and u.papel in ('gestor', 'admin')
  where a.notificado_em is null;

  update public.alertas set notificado_em = now() where notificado_em is null;

  return v_tot;
end; $$;

grant execute on function public.gerar_alertas(boolean) to service_role;
