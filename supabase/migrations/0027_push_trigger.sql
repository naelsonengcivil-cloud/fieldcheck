-- ============================================================
-- FieldCheck · Migration 0027 — Disparo de push por notificação (RF12, M4)
-- Toda linha inserida em `notificacoes` (fan-out do ciclo de NC, 0015, e o
-- job de prazos, M5) dispara a Edge Function `enviar-push` via pg_net.
-- O gatilho é AFTER INSERT por STATEMENT (batelada única por operação).
-- Depende de 0015 (notificacoes), 0025 (pg_net) e 0026. Idempotente.
--
-- CONFIGURAÇÃO (fazer no SQL Editor — NÃO vai no repositório, carrega segredo):
--   insert into public.push_config (id, base_url, cron_secret)
--   values (1, 'https://SEU-PROJETO.supabase.co', 'SEU_CRON_SECRET')
--   on conflict (id) do update
--     set base_url = excluded.base_url, cron_secret = excluded.cron_secret;
-- Enquanto a tabela estiver vazia, o push fica inativo (só o sino in-app).
-- ============================================================

-- 1) Config do disparo (linha única). Trancada: sem grants nem policies,
--    só o trigger SECURITY DEFINER e a service_role a leem.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  base_url text not null,      -- ex.: https://SEU-PROJETO.supabase.co
  cron_secret text not null,   -- mesmo valor do secret CRON_SECRET da função
  atualizado_em timestamptz not null default now()
);
alter table public.push_config enable row level security;
-- (sem policies → nenhum usuário autenticado lê/escreve; só definer/service_role)

-- 2) Trigger de statement: agrega as linhas inseridas e chama enviar-push 1x.
create or replace function public.tg_notificacoes_push()
returns trigger language plpgsql security definer set search_path = public, net as $$
declare
  v_url text;
  v_secret text;
  v_payload jsonb;
begin
  select base_url, cron_secret into v_url, v_secret from public.push_config where id = 1;
  if v_url is null then
    return null; -- push não configurado ainda
  end if;

  select jsonb_build_object(
           'mensagens',
           jsonb_agg(jsonb_build_object(
             'usuario_id', n.usuario_id,
             'titulo', n.titulo,
             'corpo', n.corpo,
             'evento_id', n.evento_id,
             'tipo', n.tipo
           ))
         )
    into v_payload
  from novas n;

  perform net.http_post(
    url := v_url || '/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := v_payload
  );
  return null;
end; $$;

drop trigger if exists trg_notificacoes_push on public.notificacoes;
create trigger trg_notificacoes_push
  after insert on public.notificacoes
  referencing new table as novas
  for each statement execute function public.tg_notificacoes_push();
