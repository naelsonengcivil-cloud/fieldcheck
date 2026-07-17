-- ============================================================
-- 0052 — Marco L, Fase 2: disparo da INTERPRETAÇÃO por IA.
-- Todo alerta novo (inserido pela detecção 0051) dispara a Edge Function
-- `ia-alertas` via pg_net, que enriquece o alerta com `analise_ia`.
--
-- Espelha o padrão do trigger de push (0027) e REUSA a mesma `push_config`
-- (base_url + cron_secret). Enquanto a config estiver vazia, a Fase 2 fica
-- inativa e os alertas da detecção seguem normalmente (não bloqueia).
--
-- AFTER INSERT por STATEMENT (uma chamada por batelada). Não dispara no
-- UPDATE que grava a análise → sem laço.
-- Depende de 0025 (pg_net), 0027 (push_config) e 0051 (alertas). Idempotente.
-- ============================================================

create or replace function public.tg_alertas_ia()
returns trigger language plpgsql security definer set search_path = public, net as $$
declare
  v_url     text;
  v_secret  text;
  v_payload jsonb;
begin
  select base_url, cron_secret into v_url, v_secret from public.push_config where id = 1;
  if v_url is null then
    return null; -- disparo não configurado → só a detecção (sem IA)
  end if;

  select jsonb_build_object('alertas', jsonb_agg(jsonb_build_object('id', n.id)))
    into v_payload
  from novas n;

  perform net.http_post(
    url := v_url || '/functions/v1/ia-alertas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := v_payload
  );
  return null;
end; $$;

drop trigger if exists trg_alertas_ia on public.alertas;
create trigger trg_alertas_ia
  after insert on public.alertas
  referencing new table as novas
  for each statement execute function public.tg_alertas_ia();
