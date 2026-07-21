-- ============================================================
-- 0059 — Marco M (M-1): coleta rápida de desvios avulsos.
--
-- Decisão de desenho (2026-07-21): o desvio avulso MORA em `ocorrencias`
-- evoluída — desvio e acidente são o mesmo fenômeno em severidades
-- diferentes. A tabela ganha os 3 tipos da BASE da Pirâmide de Bird
-- (ato_inseguro | condicao_insegura | quase_acidente), criticidade e os
-- eixos de dados (frente, item de cronograma/EAP); a pirâmide passa a
-- somar o desvio avulso na base junto das NCs de inspeção.
--
-- Prontidão para a Fase 3 (promoção a NC via inspeção sintética — NÃO
-- implementada): `promovida_inspecao_id` guarda a trilha "originada de
-- desvio avulso". Nenhuma lógica de promoção nesta migração.
-- ============================================================

-- 1) Tipos novos (base da pirâmide) no CHECK.
alter table public.ocorrencias drop constraint if exists ocorrencias_tipo_chk;
alter table public.ocorrencias add constraint ocorrencias_tipo_chk
  check (tipo in (
    'dano_material', 'acidente_sem_afastamento', 'acidente_com_afastamento', -- topo (0017)
    'ato_inseguro', 'condicao_insegura', 'quase_acidente'                    -- base (desvio avulso)
  ));

-- 2) Criticidade (obrigatória para desvio na UI; acidentes/danos não usam)
--    + eixos de dados + data/hora editável (padrão retroativo do sistema).
alter table public.ocorrencias
  add column if not exists criticidade text,
  add column if not exists frente text,
  add column if not exists ref_cronograma_codigo text,  -- mesmo eixo EAP de inspecoes (0032)
  add column if not exists ocorrida_em timestamptz,     -- data/hora do fato (editável; `data` continua = date(ocorrida_em))
  add column if not exists promovida_inspecao_id uuid references public.inspecoes;

alter table public.ocorrencias drop constraint if exists ocorrencias_criticidade_chk;
alter table public.ocorrencias add constraint ocorrencias_criticidade_chk
  check (criticidade is null or criticidade in ('baixa', 'media', 'alta', 'critica'));

-- 3) Backfill: registros antigos ganham ocorrida_em a partir da data.
update public.ocorrencias set ocorrida_em = data::timestamptz where ocorrida_em is null;

-- 4) Índice para as leituras por tipo (pirâmide/lista separam base × topo).
create index if not exists idx_ocorrencias_empresa_tipo on public.ocorrencias (empresa_id, tipo);

-- (RLS: as policies de 0017 já cobrem — select por empresa com recorte da
--  executora, insert pelo criador, update criador/gestor/admin.)
