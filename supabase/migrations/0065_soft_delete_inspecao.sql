-- ============================================================
-- 0065 — Entrega A: excluir_inspecao vira SOFT DELETE (espelha 0063/desvios).
--
-- Motivo: o hard delete físico de inspeção (0011) deixava as fotos órfãs no
-- bucket `evidencias` (o cascade apaga as linhas, não os arquivos). O soft
-- delete resolve pela raiz: a linha sobrevive e continua referenciando a foto
-- — nada fica órfão — e a exclusão fica reversível e auditável.
--
-- A destruição física (banco + Storage) fica EXCLUSIVAMENTE na Entrega B
-- (excluir_dados_empresa, manual/dry-run). Por isso NÃO removemos o trigger de
-- imutabilidade de respostas nem o GUC `fieldcheck.exclusao_admin` (0011) —
-- eles continuam liberando o hard delete de lá.
--
-- Todas as leituras passam a filtrar `excluido_em is null`:
--   • app (read-down `leitura.ts` + poda dos filhos no Dexie);
--   • views de BI (recriadas abaixo).
-- Aplicar no SQL Editor. Idempotente.
-- ============================================================

-- 1) Colunas de soft delete (mesmo padrão da 0063).
alter table public.inspecoes
  add column if not exists excluido_em     timestamptz,
  add column if not exists excluido_por    uuid references public.usuarios(id),
  add column if not exists motivo_exclusao text;

-- Índice parcial: as leituras quase sempre querem só as não-excluídas.
create index if not exists idx_inspecoes_vigentes
  on public.inspecoes (empresa_id) where excluido_em is null;

-- 2) excluir_inspecao: soft delete (não apaga a linha, não toca no Storage).
create or replace function public.excluir_inspecao(p_inspecao_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario(); v_uid uuid := auth.uid(); v_nome text; v_snap jsonb;
begin
  if public.papel_do_usuario() <> 'admin' then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Motivo obrigatório.' using errcode = '22023'; end if;
  select to_jsonb(i) into v_snap from public.inspecoes i where i.id = p_inspecao_id and i.empresa_id = v_emp;
  if v_snap is null then raise exception 'Inspeção não encontrada.' using errcode = 'P0002'; end if;
  if (v_snap->>'excluido_em') is not null then raise exception 'Inspeção já excluída.' using errcode = 'P0002'; end if;
  select nome into v_nome from public.usuarios where id = v_uid;
  -- Registra a exclusão na trilha (o log guarda o snapshot; sobrevive a tudo).
  insert into public.eventos_auditoria (empresa_id, ator_id, ator_nome, entidade_tipo, entidade_id, acao, motivo, dados)
    values (v_emp, v_uid, v_nome, 'inspecao', p_inspecao_id, 'excluir_inspecao', btrim(p_motivo), v_snap);
  -- Soft delete: carimba autor/hora/motivo. A foto sobrevive com a linha.
  update public.inspecoes
     set excluido_em = now(), excluido_por = v_uid, motivo_exclusao = btrim(p_motivo)
   where id = p_inspecao_id and empresa_id = v_emp;
end; $$;
grant execute on function public.excluir_inspecao(uuid, text) to authenticated;

-- 3) Views de BI (RF19 / 0049) — recriadas com o filtro `insp.excluido_em is null`.
--    Uma inspeção soft-deleted sai de conformidade, itens, contratada, prazos,
--    inspetor e tempo de tratamento. `vw_tempo_tratamento` (que só olhava
--    eventos→respostas) passa a juntar inspecoes só para aplicar o filtro.

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
join public.inspecoes insp on insp.obra_id = o.id and insp.status = 'finalizada' and insp.excluido_em is null
join public.respostas r     on r.inspecao_id = insp.id
where o.empresa_id = public.empresa_do_usuario()
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
join public.inspecoes insp on insp.id = r.inspecao_id and insp.status = 'finalizada' and insp.excluido_em is null
join public.checklists c    on c.id = insp.checklist_id
join public.itens_checklist it on it.id = r.item_id
where insp.empresa_id = public.empresa_do_usuario()
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
join public.inspecoes insp on insp.id = r.inspecao_id and insp.excluido_em is null
where e.empresa_id = public.empresa_do_usuario()
  and e.fechado_em is not null
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
  join public.inspecoes insp  on insp.id = r.inspecao_id and insp.excluido_em is null
  where e.empresa_id = public.empresa_do_usuario()
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
join public.inspecoes insp     on insp.id = r.inspecao_id and insp.excluido_em is null
join public.obras o            on o.id = e.obra_id
join public.checklists c       on c.id = insp.checklist_id
join public.itens_checklist it on it.id = r.item_id
left join public.contratadas ct on ct.id = e.contratada_id
where e.empresa_id = public.empresa_do_usuario()
  and e.fechado_em is null;

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
  and insp.excluido_em is null
group by u.id, u.nome;

grant select on public.vw_conformidade_obra     to authenticated;
grant select on public.vw_nc_por_item           to authenticated;
grant select on public.vw_tempo_tratamento      to authenticated;
grant select on public.vw_desempenho_contratada to authenticated;
grant select on public.vw_nc_prazo              to authenticated;
grant select on public.vw_nc_por_inspetor       to authenticated;
