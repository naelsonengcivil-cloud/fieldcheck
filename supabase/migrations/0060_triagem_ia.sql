-- ============================================================
-- 0060 — Marco M (M-2): triagem por IA do desvio avulso.
--
-- A Edge Function `ia-triagem-desvio` (contrato K/L: linguagem de
-- possibilidade, SEM item numerado de norma, fallback nunca bloqueia,
-- metering em ia_uso, gate empresas.ia_habilitada) grava aqui a sugestão:
--   triagem_ia jsonb = { descricao_visivel, classificacao, criticidade,
--                        familias_normativas[], limitacoes }
-- A saída é SEMPRE sugestão ("IA · revise"): quem decide é a pessoa.
--   origem_ia        = o registro foi salvo com sugestões da IA aplicadas
--   editado_apos_ia  = a pessoa ajustou depois de aplicar a IA
-- ============================================================

alter table public.ocorrencias
  add column if not exists triagem_ia jsonb,
  add column if not exists triagem_em timestamptz,
  add column if not exists origem_ia boolean not null default false,
  add column if not exists editado_apos_ia boolean not null default false;
