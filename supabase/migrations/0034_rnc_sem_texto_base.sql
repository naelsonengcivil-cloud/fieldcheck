-- ============================================================
-- FieldCheck · Migration 0034 — RNC sempre possível (correção prioritária)
-- O texto-base é CONVENIÊNCIA (pré-preenchimento), nunca pré-requisito. A
-- geração de RNC deixa de falhar por ausência de texto-base OU de modelo:
-- itens sem base (catálogo padrão ainda não coberto, e checklists
-- personalizados) geram a RNC com as seções em branco para preenchimento
-- manual. Para isso, `modelo_id` passa a ser opcional. Depende de 0023.
-- Idempotente.
-- ============================================================

-- modelo_id opcional (RNC sem modelo específico — ex.: checklist personalizado).
alter table public.rncs alter column modelo_id drop not null;
