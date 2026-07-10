-- ============================================================
-- FieldCheck · Migration 0021 — Criticidade + prazos da NC (Marco I)
-- Criticidade estruturada na NC (baixa|media|alta|critica) + parâmetros de
-- prazo por criticidade configuráveis por empresa (em dias). O prazo é
-- sugerido no registro e a NC só finaliza com criticidade + prazo.
-- Aplicar no SQL Editor, após a 0020. Idempotente.
-- ============================================================

-- 1) Criticidade na NC (evento_nc — campo de gestão, editável pelo gestor).
alter table public.eventos_nc add column if not exists criticidade text;
alter table public.eventos_nc drop constraint if exists eventos_nc_criticidade_chk;
alter table public.eventos_nc add constraint eventos_nc_criticidade_chk
  check (criticidade is null or criticidade in ('baixa', 'media', 'alta', 'critica'));

-- 2) Parâmetros de prazo por criticidade (dias), configuráveis pelo admin.
alter table public.empresas add column if not exists prazos_nc jsonb
  not null default '{"critica": 1, "alta": 3, "media": 7, "baixa": 15}'::jsonb;
