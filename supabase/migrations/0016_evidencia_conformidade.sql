-- ============================================================
-- FieldCheck · Migration 0016 — Evidência de conformidade (Marco A1)
-- Permite foto também em itens Conformes (evidência positiva). O tipo
-- da evidência passa a distinguir conformidade × não conformidade.
-- Aplicar no SQL Editor. Idempotente.
-- ============================================================

alter table public.evidencias drop constraint if exists evidencias_tipo_chk;
alter table public.evidencias add constraint evidencias_tipo_chk
  check (tipo in ('abertura', 'fechamento', 'tratamento', 'conformidade'));
