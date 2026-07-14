-- ============================================================
-- 0037 — Liga/desliga da redação assistida por IA por empresa (Marco K, K2).
-- Quando false, a rnc-generate não chama a IA (a RNC nasce interpolada/em
-- branco, o mesmo fallback já existente). Padrão: habilitado.
-- A escrita segue a RLS de UPDATE de `empresas` (admin da própria empresa),
-- igual ao ajuste de prazos_nc — não precisa de RPC dedicada.
-- ============================================================

alter table public.empresas
  add column if not exists ia_habilitada boolean not null default true;
