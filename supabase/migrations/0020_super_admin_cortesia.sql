-- ============================================================
-- FieldCheck · Migration 0020 — Operador da plataforma + cortesia (Marco F)
-- super_admin = operador do SaaS (Alpha), acima das empresas. Privacidade
-- por design: ele NÃO acessa dados operacionais (inspeções/fotos) — só
-- metadados/faturamento, via RPCs curadas + select em `empresas`.
-- Aplicar no SQL Editor, após a 0019. Idempotente.
-- ============================================================

-- 1) Operadores da plataforma (fora do modelo de tenants).
create table if not exists public.plataforma_operadores (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);
alter table public.plataforma_operadores enable row level security;
grant select on public.plataforma_operadores to authenticated;
drop policy if exists operadores_self on public.plataforma_operadores;
create policy operadores_self on public.plataforma_operadores
  for select to authenticated using (id = auth.uid());
-- Inserção só manual (SQL Editor) — provisiona o 1º operador Alpha:
--   insert into public.plataforma_operadores (id, nome) values ('<auth-uid>', 'Alpha');

create or replace function public.eh_super_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.plataforma_operadores where id = auth.uid());
$$;
grant execute on function public.eh_super_admin() to authenticated;

-- 2) Cortesia por tempo determinado.
alter table public.empresas add column if not exists cortesia_ate timestamptz;

-- empresa_liberada(): plano ativo OU trial vigente OU cortesia vigente (+ Pix).
create or replace function public.empresa_liberada()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce(
    (
      select
        (e.plano = 'trial'
          and coalesce(e.trial_expira_em, e.criado_em + interval '14 days') > now())
        or (e.plano = 'ativo' and e.stripe_subscription_id is not null)
        or (e.plano = 'ativo' and e.assinatura_ativa_ate is not null and e.assinatura_ativa_ate > now())
        or (e.cortesia_ate is not null and e.cortesia_ate > now())
      from public.empresas e
      where e.id = public.empresa_do_usuario()
    ),
    false
  );
$$;
grant execute on function public.empresa_liberada() to authenticated;

-- 3) super_admin enxerga METADADOS de empresas (nunca dados operacionais —
--    nas tabelas operacionais o empresa_do_usuario() é nulo → default deny).
drop policy if exists empresas_select_super on public.empresas;
create policy empresas_select_super on public.empresas
  for select to authenticated using (public.eh_super_admin());

-- 4) RPCs do operador (só super_admin; retornam agregados/metadados).
--    Lista de empresas com plano/cortesia/uso — sem qualquer linha operacional.
create or replace function public.plataforma_empresas()
returns table (
  id uuid, nome text, plano text, trial_expira_em timestamptz,
  cortesia_ate timestamptz, assinatura_ativa_ate timestamptz, tem_assinatura boolean,
  n_usuarios bigint, n_inspecoes bigint, ultima_atividade timestamptz
) language sql security definer set search_path = public stable as $$
  select
    e.id, e.nome, e.plano, e.trial_expira_em, e.cortesia_ate, e.assinatura_ativa_ate,
    (e.stripe_subscription_id is not null),
    (select count(*) from public.usuarios u where u.empresa_id = e.id),
    (select count(*) from public.inspecoes i where i.empresa_id = e.id),
    (select max(i.finalizada_em) from public.inspecoes i where i.empresa_id = e.id)
  from public.empresas e
  where public.eh_super_admin()   -- se não for operador, retorna 0 linhas
  order by e.nome;
$$;
grant execute on function public.plataforma_empresas() to authenticated;

-- Concede/altera cortesia e registra na auditoria (quem/quando/até/motivo).
create or replace function public.conceder_cortesia(p_empresa_id uuid, p_ate timestamptz, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not public.eh_super_admin() then
    raise exception 'Apenas operador da plataforma.' using errcode = '42501';
  end if;
  update public.empresas set cortesia_ate = p_ate where id = p_empresa_id;
  if not found then raise exception 'Empresa não encontrada.' using errcode = 'P0002'; end if;
  select nome into v_nome from public.plataforma_operadores where id = auth.uid();
  insert into public.eventos_auditoria
    (empresa_id, ator_id, ator_nome, entidade_tipo, entidade_id, acao, motivo, dados)
  values
    (p_empresa_id, null, coalesce(v_nome, 'Operador'), 'empresa', p_empresa_id,
     'conceder_cortesia', nullif(btrim(p_motivo), ''), jsonb_build_object('cortesia_ate', p_ate));
end; $$;
grant execute on function public.conceder_cortesia(uuid, timestamptz, text) to authenticated;
