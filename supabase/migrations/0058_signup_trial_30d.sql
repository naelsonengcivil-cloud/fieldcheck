-- ============================================================
-- 0058 — Signup alinhado à Onda 1: trial de 30 dias (Intelligence)
--
-- A 0006 criava empresas com trial de 14 dias (RF16, modelo antigo).
-- Onda 1: trial único de 30 dias com acesso Intelligence (plano_vigente
-- já mapeia trial válido → intelligence). Novas contas NÃO são founder
-- (cohort fica null — founder é só a migração 0056 das contas existentes).
-- ============================================================

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

  insert into public.empresas (nome, plano, trial_expira_em, plan_started_at)
  values (
    coalesce(nullif(btrim(p_nome_empresa), ''), 'Minha empresa'),
    'trial',
    now() + interval '30 days',
    now()
  )
  returning id into v_empresa;

  insert into public.usuarios (id, empresa_id, nome, papel)
  values (
    v_uid,
    v_empresa,
    coalesce(nullif(btrim(p_nome_usuario), ''), 'Administrador'),
    'admin'
  );

  -- Auditoria de plano (0056): nascimento da conta em trial.
  insert into public.plan_events (empresa_id, evento, de_plano, para_plano, origem, detalhe)
  values (v_empresa, 'trial_iniciado', null, 'trial', 'signup', jsonb_build_object('dias', 30));

  return v_empresa;
end;
$$;

grant execute on function public.criar_empresa_e_admin(text, text) to authenticated;
