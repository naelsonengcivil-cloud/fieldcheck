-- ============================================================
-- FieldCheck · Migration 0025 — Agendamento (RF17, resumo semanal)
-- Habilita pg_cron (agenda tarefas no banco) e pg_net (HTTP de saída), para
-- disparar a Edge Function `relatorio-semanal` semanalmente.
-- Em Supabase também dá para habilitar via Dashboard → Database → Extensions.
-- O agendamento em si (cron.schedule) fica em docs/relatorio-semanal-setup.md,
-- pois carrega URL + segredo (não deve ser commitado). Idempotente.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
