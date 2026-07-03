-- ============================================================
-- FieldCheck · Migration 0007 — Convite de usuários (Fase 2 · M10 / RF14)
-- Admin convida por e-mail; o convidado se cadastra com o mesmo e-mail e
-- o app casa o convite automaticamente (RPCs SECURITY DEFINER, sem Edge
-- Function). Aplicar no SQL Editor. Idempotente.
-- ============================================================

create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas,
  email text not null,
  papel text not null default 'inspetor',
  status text not null default 'pendente',   -- pendente | aceito | cancelado
  criado_por uuid references public.usuarios,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '14 days',
  constraint convites_papel_chk check (papel in ('inspetor', 'gestor', 'admin')),
  constraint convites_status_chk check (status in ('pendente', 'aceito', 'cancelado'))
);
create index if not exists idx_convites_empresa on public.convites (empresa_id);
create index if not exists idx_convites_email on public.convites (lower(email));

alter table public.convites enable row level security;
grant select, insert, update, delete on public.convites to authenticated;

-- Admin gerencia os convites da própria empresa.
drop policy if exists convites_admin on public.convites;
create policy convites_admin on public.convites
  for all to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin')
  with check (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin');

-- ---------- RPC: convidar (admin) ----------
create or replace function public.convidar_usuario(p_email text, p_papel text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_papel_atual text := public.papel_do_usuario();
  v_id uuid;
begin
  if v_empresa is null or v_papel_atual <> 'admin' then
    raise exception 'Apenas administradores podem convidar.' using errcode = '42501';
  end if;
  if p_papel not in ('inspetor', 'gestor', 'admin') then
    raise exception 'Papel inválido.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.usuarios u
    join auth.users au on au.id = u.id
    where u.empresa_id = v_empresa and lower(au.email) = lower(btrim(p_email))
  ) then
    raise exception 'Esse e-mail já é usuário da empresa.' using errcode = 'unique_violation';
  end if;
  -- Substitui convites pendentes anteriores do mesmo e-mail.
  update public.convites set status = 'cancelado'
    where empresa_id = v_empresa and lower(email) = lower(btrim(p_email)) and status = 'pendente';
  insert into public.convites (empresa_id, email, papel, criado_por)
    values (v_empresa, lower(btrim(p_email)), p_papel, auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.convidar_usuario(text, text) to authenticated;

-- ---------- RPC: consultar convite pendente do próprio e-mail ----------
create or replace function public.meu_convite_pendente()
returns table (empresa_id uuid, empresa_nome text, papel text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then return; end if;
  if exists (select 1 from public.usuarios where id = v_uid) then return; end if;
  select email into v_email from auth.users where id = v_uid;
  return query
    select c.empresa_id, e.nome, c.papel
    from public.convites c
    join public.empresas e on e.id = c.empresa_id
    where c.status = 'pendente' and lower(c.email) = lower(v_email) and c.expira_em > now()
    order by c.criado_em desc
    limit 1;
end;
$$;
grant execute on function public.meu_convite_pendente() to authenticated;

-- ---------- RPC: aceitar convite (cria o usuario vinculado) ----------
create or replace function public.aceitar_convite(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_conv public.convites%rowtype;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if exists (select 1 from public.usuarios where id = v_uid) then
    raise exception 'Usuário já vinculado a uma empresa.' using errcode = 'unique_violation';
  end if;
  select email into v_email from auth.users where id = v_uid;
  select * into v_conv from public.convites
    where status = 'pendente' and lower(email) = lower(v_email) and expira_em > now()
    order by criado_em desc limit 1;
  if v_conv.id is null then
    raise exception 'Nenhum convite pendente para o seu e-mail.' using errcode = 'P0002';
  end if;
  insert into public.usuarios (id, empresa_id, nome, papel)
    values (v_uid, v_conv.empresa_id, coalesce(nullif(btrim(p_nome), ''), 'Usuário'), v_conv.papel);
  update public.convites set status = 'aceito' where id = v_conv.id;
  return v_conv.empresa_id;
end;
$$;
grant execute on function public.aceitar_convite(text) to authenticated;
