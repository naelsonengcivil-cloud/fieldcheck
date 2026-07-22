-- ============================================================
-- 0063 — Edição e exclusão auditável de desvios/ocorrências (Marco M).
--
-- Edição: carimba autor/hora da última alteração.
-- Exclusão = SOFT DELETE (nunca DELETE físico): o desvio entra na base da
-- Pirâmide de Bird e nos relatórios; remover a linha quebraria contagem e
-- rastreabilidade. Todas as leituras filtram `excluido_em is null`.
--
-- RLS: a policy de UPDATE de 0017 (criador OU gestor/admin, no próprio
-- tenant) já cobre edição e soft-delete — nenhuma policy nova necessária.
-- ============================================================

alter table public.ocorrencias
  add column if not exists atualizado_em    timestamptz,
  add column if not exists atualizado_por   uuid references public.usuarios(id),
  add column if not exists excluido_em      timestamptz,
  add column if not exists excluido_por     uuid references public.usuarios(id),
  add column if not exists motivo_exclusao  text;

-- Índice parcial: as leituras quase sempre querem só os não-excluídos.
create index if not exists idx_ocorrencias_vigentes
  on public.ocorrencias (empresa_id) where excluido_em is null;
