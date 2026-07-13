-- ============================================================
-- FieldCheck · Migration 0035 — Texto-base de RNC por item (passo 4)
-- Checklists personalizados (Marco E): o admin pode, opcionalmente, cadastrar
-- um "texto-base para RNC" por item. Fica em itens_checklist (que o admin já
-- escreve ao criar o checklist) — a plataforma `rnc_textos_base` é super_admin.
-- A rnc-generate usa este texto como pré‑preenchimento quando não há texto‑base
-- de plataforma; quem não preencher cai no fluxo manual. Depende de 0001.
-- Idempotente.
-- ============================================================

alter table public.itens_checklist
  add column if not exists texto_base_rnc text;
