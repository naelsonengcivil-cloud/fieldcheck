-- ============================================================
-- 0057 — Enforcement server-side dos read-only premium (Frente 3, Lote 1)
--
-- Condição nº 1 do usuário: o gating do cliente é só UX; a verdade é o
-- servidor. Aqui trancamos, na própria RLS/definição, a LEITURA dos dados
-- premium para quem não tem o recurso no plano vigente:
--   • tabela `alertas`  → recurso smart_alerts  (Premium+)
--   • views RF19        → recurso bi_full        (Intelligence)
--
-- Decisão importante: gateamos pela INCLUSÃO NO PLANO (nível de tier), e NÃO
-- por tem_feature() — este último também considera o toggle alertas_ia_habilitado.
-- Usar tem_feature esconderia alertas JÁ GERADOS quando o gestor desliga a IA,
-- violando "dados já gerados continuam legíveis". Por isso o helper abaixo lê
-- só a matriz plan_features do tier vigente, ignorando o toggle de IA.
-- ============================================================

-- Helper: o plano vigente da empresa inclui a feature? (só a matriz; sem toggle de IA)
create or replace function public.plano_inclui_feature(p_feature text, p_empresa uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case public.plano_vigente(coalesce(p_empresa, public.empresa_do_usuario()))
              when 'basic'        then f.basic
              when 'premium'      then f.premium
              when 'intelligence' then f.intelligence
              else false  -- readonly/archived
            end
       from public.plan_features f
      where f.feature = p_feature),
    false);
$$;
grant execute on function public.plano_inclui_feature(text, uuid) to authenticated;

-- 1) alertas: SELECT exige que o plano vigente inclua smart_alerts (Premium+).
--    (INSERT/DELETE já são só da função SECURITY DEFINER / service_role.)
drop policy if exists alertas_select on public.alertas;
create policy alertas_select on public.alertas
  for select using (
    empresa_id = public.empresa_do_usuario()
    and public.papel_do_usuario() in ('admin', 'gestor')
    and public.plano_inclui_feature('smart_alerts', empresa_id)
  );

-- 2) Views RF19: recriadas com o gate bi_full (Intelligence). Non-Intelligence
--    recebe conjunto vazio — sem vazamento de agregações premium via API direta.
--    Colunas idênticas às de 0049 (só acrescentamos predicado no WHERE).

create or replace view public.vw_conformidade_obra
  with (security_invoker = true) as
select
  o.id                                                              as obra_id,
  o.nome                                                            as obra,
  count(distinct insp.id)                                           as inspecoes,
  count(r.id)                                                       as pontos,
  count(r.id) filter (where r.resposta = 'NC')                      as ncs,
  round(100.0 * count(r.id) filter (where r.resposta in ('C', 'NA'))
        / nullif(count(r.id), 0), 1)                                as conformidade_pct,
  min(insp.finalizada_em)                                          as primeira_inspecao,
  max(insp.finalizada_em)                                          as ultima_inspecao
from public.obras o
join public.inspecoes insp on insp.obra_id = o.id and insp.status = 'finalizada'
join public.respostas r     on r.inspecao_id = insp.id
where o.empresa_id = public.empresa_do_usuario()
  and public.plano_inclui_feature('bi_full')
group by o.id, o.nome;

create or replace view public.vw_nc_por_item
  with (security_invoker = true) as
select
  c.codigo                                                         as checklist_codigo,
  it.ordem                                                         as item_numero,
  it.texto                                                         as item_texto,
  c.modulo                                                         as modulo,
  count(r.id) filter (where r.resposta = 'NC')                     as ncs,
  count(r.id)                                                      as inspecoes,
  round(100.0 * count(r.id) filter (where r.resposta = 'NC')
        / nullif(count(r.id), 0), 1)                               as taxa,
  (count(r.id) filter (where r.resposta = 'NC') >= 2)              as reincidente
from public.respostas r
join public.inspecoes insp on insp.id = r.inspecao_id and insp.status = 'finalizada'
join public.checklists c    on c.id = insp.checklist_id
join public.itens_checklist it on it.id = r.item_id
where insp.empresa_id = public.empresa_do_usuario()
  and public.plano_inclui_feature('bi_full')
group by c.codigo, it.ordem, it.texto, c.modulo
having count(r.id) filter (where r.resposta = 'NC') > 0;

create or replace view public.vw_tempo_tratamento
  with (security_invoker = true) as
select
  coalesce(e.criticidade, '—')                                    as criticidade,
  count(*)                                                         as n,
  round(avg(extract(epoch from (e.fechado_em - r.criado_em)) / 86400.0)::numeric, 1) as tempo_medio_dias
from public.eventos_nc e
join public.respostas r on r.id = e.resposta_id
where e.empresa_id = public.empresa_do_usuario()
  and e.fechado_em is not null
  and public.plano_inclui_feature('bi_full')
group by coalesce(e.criticidade, '—');

create or replace view public.vw_desempenho_contratada
  with (security_invoker = true) as
with ev as (
  select e.id,
         e.fechado_em,
         e.contratada_id,
         r.criado_em,
         insp.contratada                                          as insp_contratada,
         exists (select 1 from public.nc_transicoes t
                 where t.evento_id = e.id and t.para_status = 'reaberta') as reaberto
  from public.eventos_nc e
  join public.respostas r     on r.id = e.resposta_id
  join public.inspecoes insp  on insp.id = r.inspecao_id
  where e.empresa_id = public.empresa_do_usuario()
    and public.plano_inclui_feature('bi_full')
)
select
  coalesce(ct.nome, ev.insp_contratada, '—')                      as contratada,
  count(*)                                                         as ncs,
  count(*) filter (where ev.fechado_em is not null)                as tratadas,
  count(*) filter (where ev.reaberto)                              as reaberturas,
  round(100.0 * count(*) filter (where ev.reaberto)::numeric
        / nullif(count(*) filter (where ev.fechado_em is not null), 0), 1) as taxa_reprovacao,
  round(avg(extract(epoch from (ev.fechado_em - ev.criado_em)) / 86400.0)
        filter (where ev.fechado_em is not null)::numeric, 1)     as tempo_medio_dias
from ev
left join public.contratadas ct on ct.id = ev.contratada_id
group by coalesce(ct.nome, ev.insp_contratada, '—');

create or replace view public.vw_nc_prazo
  with (security_invoker = true) as
select
  e.id                                                             as evento_id,
  e.obra_id,
  o.nome                                                           as obra,
  coalesce(ct.nome, insp.contratada, '—')                         as contratada,
  e.criticidade,
  e.responsavel,
  e.prazo,
  (current_date - e.prazo)                                         as dias_atraso,
  case when e.prazo is null                     then 'sem_prazo'
       when e.prazo <  current_date             then 'vencida'
       when e.prazo <= current_date + 3         then 'a_vencer'
       else 'no_prazo' end                                         as situacao,
  c.codigo                                                         as checklist_codigo,
  it.ordem                                                         as item_numero,
  it.texto                                                         as item_texto
from public.eventos_nc e
join public.respostas r        on r.id = e.resposta_id
join public.inspecoes insp     on insp.id = r.inspecao_id
join public.obras o            on o.id = e.obra_id
join public.checklists c       on c.id = insp.checklist_id
join public.itens_checklist it on it.id = r.item_id
left join public.contratadas ct on ct.id = e.contratada_id
where e.empresa_id = public.empresa_do_usuario()
  and e.fechado_em is null
  and public.plano_inclui_feature('bi_full');

create or replace view public.vw_nc_por_inspetor
  with (security_invoker = true) as
select
  u.id                                                             as inspetor_id,
  u.nome                                                           as inspetor,
  count(distinct insp.id)                                          as inspecoes,
  count(r.id)                                                      as pontos,
  count(r.id) filter (where r.resposta = 'NC')                     as ncs
from public.inspecoes insp
join public.usuarios u    on u.id = insp.inspetor_id
join public.respostas r   on r.inspecao_id = insp.id
where insp.empresa_id = public.empresa_do_usuario()
  and insp.status = 'finalizada'
  and public.plano_inclui_feature('bi_full')
group by u.id, u.nome;

-- Re-grant (create or replace view preserva grants, mas garantimos idempotência).
grant select on public.vw_conformidade_obra     to authenticated;
grant select on public.vw_nc_por_item           to authenticated;
grant select on public.vw_tempo_tratamento      to authenticated;
grant select on public.vw_desempenho_contratada to authenticated;
grant select on public.vw_nc_prazo              to authenticated;
grant select on public.vw_nc_por_inspetor       to authenticated;
