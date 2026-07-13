-- ============================================================
-- FieldCheck · Migration 0032 — Referência de cronograma/escopo (melhoria 4, núcleo)
-- Vincula a inspeção a um item de cronograma/escopo/contrato por CÓDIGO livre
-- (opcional; o cliente usa o padrão que preferir). É um EIXO ESTÁVEL para
-- rastreabilidade e para a linha do tempo por item (diretriz de dados/IA).
-- A EAP estruturada (import por planilha, autocomplete, histórico do item) vem
-- na v1.1. Depende de 0001. Idempotente.
-- ============================================================

alter table public.inspecoes
  add column if not exists ref_cronograma_codigo text;

-- Índice para o filtro por código (telas e exportações).
create index if not exists idx_inspecoes_ref_cronograma
  on public.inspecoes (ref_cronograma_codigo);
