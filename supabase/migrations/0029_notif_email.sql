-- ============================================================
-- FieldCheck · Migration 0029 — Opt-out do resumo semanal por e-mail (RF17)
-- Espelha o opt-out de push (0026): coluna de preferência por usuário +
-- RPC para o próprio usuário alterá-la. A Edge Function `relatorio-semanal`
-- passa a pular quem tem notif_email = false. Idempotente.
-- ============================================================

alter table public.usuarios
  add column if not exists notif_email boolean not null default true;

-- Preferência de e-mail do próprio usuário (paralelo a definir_pref_push).
create or replace function public.definir_pref_email(p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.usuarios set notif_email = coalesce(p_ativo, true)
  where id = auth.uid();
end; $$;
grant execute on function public.definir_pref_email(boolean) to authenticated;
