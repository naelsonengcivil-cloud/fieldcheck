-- ============================================================
-- FieldCheck · Migration 0033 — Banco de experiência (melhoria 6, MVP)
-- FUNÇÕES ANALÍTICAS NOMEADAS E REUTILIZÁVEIS (diretriz de dados/IA, princípio c):
-- o relatório preditivo é o 1º consumidor; a camada de IA (Marco L) será o próximo.
-- Cálculos ficam AQUI (não na tela). Parametrizadas por obra + período, filtradas
-- por empresa do usuário (SECURITY DEFINER). Números vêm exclusivamente do banco.
-- Apresentação honesta: retornam o TAMANHO DA AMOSTRA junto das taxas.
-- Depende de 0001/0015/0021. Idempotente.
-- ============================================================

-- 1) Taxa de NC por item de checklist (frequência histórica + amostra).
--    ncs = nº de NCs no item; inspecoes = nº de vezes que o item foi inspecionado
--    (denominador = amostra); taxa = ncs/inspecoes (%). Só itens com ≥1 NC.
create or replace function public.experiencia_itens_nc(
  p_obra uuid default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  checklist_codigo text,
  item_numero int,
  item_texto text,
  modulo text,
  ncs bigint,
  inspecoes bigint,
  taxa numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select r.resposta,
           c.codigo as ck_cod,
           c.modulo as ck_mod,
           it.ordem::int as item_ord,
           it.texto as item_txt
    from public.respostas r
    join public.inspecoes insp on insp.id = r.inspecao_id
    join public.checklists c on c.id = insp.checklist_id
    join public.itens_checklist it on it.id = r.item_id
    where insp.empresa_id = public.empresa_do_usuario()
      and insp.status = 'finalizada'
      and (p_obra is null or insp.obra_id = p_obra)
      and (p_de is null or insp.finalizada_em::date >= p_de)
      and (p_ate is null or insp.finalizada_em::date <= p_ate)
  )
  select ck_cod,
         item_ord,
         min(item_txt),
         min(ck_mod),
         count(*) filter (where resposta = 'NC') as ncs,
         count(*) as inspecoes,
         round(100.0 * count(*) filter (where resposta = 'NC') / nullif(count(*), 0), 1) as taxa
  from base
  group by ck_cod, item_ord
  having count(*) filter (where resposta = 'NC') > 0
  order by taxa desc, ncs desc;
$$;
grant execute on function public.experiencia_itens_nc(uuid, date, date) to authenticated;

-- 2) Tempo médio de tratamento por criticidade (NCs fechadas).
--    tempo = fechado_em − abertura (criado_em da resposta de origem), em dias.
create or replace function public.experiencia_tempo_tratamento(
  p_obra uuid default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  criticidade text,
  n bigint,
  tempo_medio_dias numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with fechados as (
    select coalesce(e.criticidade, '—') as crit,
           extract(epoch from (e.fechado_em - r.criado_em)) / 86400.0 as dias
    from public.eventos_nc e
    join public.respostas r on r.id = e.resposta_id
    join public.inspecoes insp on insp.id = r.inspecao_id
    where e.empresa_id = public.empresa_do_usuario()
      and e.fechado_em is not null
      and (p_obra is null or insp.obra_id = p_obra)
      and (p_de is null or insp.finalizada_em::date >= p_de)
      and (p_ate is null or insp.finalizada_em::date <= p_ate)
  )
  select crit, count(*), round(avg(dias)::numeric, 1)
  from fechados
  group by crit
  order by crit;
$$;
grant execute on function public.experiencia_tempo_tratamento(uuid, date, date) to authenticated;
