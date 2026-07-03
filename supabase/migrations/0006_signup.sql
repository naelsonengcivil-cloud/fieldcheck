-- ============================================================
-- FieldCheck · Migration 0006 — Cadastro autônomo (self-signup) + trial
-- (Fase 2 · M9). Resolve o "ovo e galinha" do 1º usuário de uma empresa:
-- um usuário recém-autenticado, ainda sem vínculo, cria a própria empresa
-- (plano trial de 14 dias) e vira admin — atomicamente, via RPC
-- SECURITY DEFINER (contorna o RLS só aqui, com guardas).
-- Aplicar no SQL Editor. Idempotente.
-- ============================================================

alter table public.empresas
  add column if not exists trial_expira_em timestamptz;

create or replace function public.criar_empresa_e_admin(
  p_nome_empresa text,
  p_nome_usuario text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_empresa uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  -- Impede recriação: um usuário só provisiona empresa uma vez.
  if exists (select 1 from public.usuarios where id = v_uid) then
    raise exception 'Usuário já vinculado a uma empresa.' using errcode = 'unique_violation';
  end if;

  insert into public.empresas (nome, plano, trial_expira_em)
  values (
    coalesce(nullif(btrim(p_nome_empresa), ''), 'Minha empresa'),
    'trial',
    now() + interval '14 days'
  )
  returning id into v_empresa;

  insert into public.usuarios (id, empresa_id, nome, papel)
  values (
    v_uid,
    v_empresa,
    coalesce(nullif(btrim(p_nome_usuario), ''), 'Administrador'),
    'admin'
  );

  return v_empresa;
end;
$$;

grant execute on function public.criar_empresa_e_admin(text, text) to authenticated;
