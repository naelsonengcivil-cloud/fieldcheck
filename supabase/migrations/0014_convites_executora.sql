-- ============================================================
-- FieldCheck · Migration 0014 — Convite de executora (Marco B2/M17)
-- Estende as RPCs de convite para o papel 'executora' + a contratada
-- vinculada. Depende da 0013 (contratadas + convites.contratada_id).
-- Aplicar no SQL Editor, após a 0013. Idempotente.
-- ============================================================

-- convidar_usuario ganha p_contratada_id (obrigatório só p/ executora).
drop function if exists public.convidar_usuario(text, text);
create or replace function public.convidar_usuario(
  p_email text, p_papel text, p_contratada_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid := public.empresa_do_usuario();
  v_papel_atual text := public.papel_do_usuario();
  v_id uuid;
begin
  if v_empresa is null or v_papel_atual <> 'admin' then
    raise exception 'Apenas administradores podem convidar.' using errcode = '42501';
  end if;
  if p_papel not in ('inspetor', 'gestor', 'admin', 'executora') then
    raise exception 'Papel inválido.' using errcode = '22023';
  end if;
  if p_papel = 'executora' then
    if p_contratada_id is null then
      raise exception 'Selecione a contratada da executora.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.contratadas where id = p_contratada_id and empresa_id = v_empresa) then
      raise exception 'Contratada inválida.' using errcode = '22023';
    end if;
  end if;
  if exists (
    select 1 from public.usuarios u
    join auth.users au on au.id = u.id
    where u.empresa_id = v_empresa and lower(au.email) = lower(btrim(p_email))
  ) then
    raise exception 'Esse e-mail já é usuário da empresa.' using errcode = 'unique_violation';
  end if;
  update public.convites set status = 'cancelado'
    where empresa_id = v_empresa and lower(email) = lower(btrim(p_email)) and status = 'pendente';
  insert into public.convites (empresa_id, email, papel, contratada_id, criado_por)
    values (
      v_empresa, lower(btrim(p_email)), p_papel,
      case when p_papel = 'executora' then p_contratada_id else null end,
      auth.uid()
    )
    returning id into v_id;
  return v_id;
end; $$;
grant execute on function public.convidar_usuario(text, text, uuid) to authenticated;

-- aceitar_convite vincula a contratada do convite ao novo usuário.
create or replace function public.aceitar_convite(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
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
  insert into public.usuarios (id, empresa_id, nome, papel, contratada_id)
    values (v_uid, v_conv.empresa_id, coalesce(nullif(btrim(p_nome), ''), 'Usuário'), v_conv.papel, v_conv.contratada_id);
  update public.convites set status = 'aceito' where id = v_conv.id;
  return v_conv.empresa_id;
end; $$;
grant execute on function public.aceitar_convite(text) to authenticated;
