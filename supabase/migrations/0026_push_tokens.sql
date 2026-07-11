-- ============================================================
-- FieldCheck · Migration 0026 — Push nativo/web (RF12, M1)
-- Tabela de tokens de dispositivo (FCM) + preferência de opt-out por
-- usuário. O registro/remoção é feito por RPCs SECURITY DEFINER (o
-- cliente não escreve direto). O envio (Edge Function `enviar-push`)
-- lê os tokens dos destinatários respeitando `usuarios.notif_push`.
-- Depende de 0001 (usuarios) e 0003 (empresa_do_usuario). Idempotente.
-- ============================================================

-- 1) Preferência de push por usuário (M6). Default: recebe.
alter table public.usuarios
  add column if not exists notif_push boolean not null default true;

-- 2) Tokens de dispositivo. 1 linha por (dispositivo × instalação); o token
--    FCM é único globalmente — se migrar de usuário (aparelho compartilhado),
--    o upsert por `token` reatribui ao usuário atual.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios on delete cascade,
  empresa_id uuid not null references public.empresas,
  token text not null unique,
  plataforma text not null,                    -- android | ios | web
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint push_tokens_plataforma_chk check (plataforma in ('android', 'ios', 'web'))
);
create index if not exists idx_push_tokens_usuario on public.push_tokens (usuario_id);
create index if not exists idx_push_tokens_empresa on public.push_tokens (empresa_id);

alter table public.push_tokens enable row level security;
grant select on public.push_tokens to authenticated;

-- Só enxerga os próprios tokens. Escrita é exclusivamente via RPCs abaixo.
drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens
  for select to authenticated using (usuario_id = auth.uid());

-- 3) Registrar/atualizar o token do dispositivo do usuário logado.
--    Upsert por token: reatribui ao usuário atual e renova atualizado_em.
create or replace function public.registrar_push_token(p_token text, p_plataforma text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_emp uuid := public.empresa_do_usuario();
begin
  if v_uid is null or v_emp is null then
    raise exception 'Sem sessão/empresa.' using errcode = '42501';
  end if;
  if nullif(btrim(p_token), '') is null then
    raise exception 'Token vazio.' using errcode = '22023';
  end if;
  if p_plataforma not in ('android', 'ios', 'web') then
    raise exception 'Plataforma inválida.' using errcode = '22023';
  end if;

  insert into public.push_tokens (usuario_id, empresa_id, token, plataforma)
  values (v_uid, v_emp, btrim(p_token), p_plataforma)
  on conflict (token) do update
    set usuario_id = excluded.usuario_id,
        empresa_id = excluded.empresa_id,
        plataforma = excluded.plataforma,
        atualizado_em = now();
end; $$;
grant execute on function public.registrar_push_token(text, text) to authenticated;

-- 4) Remover um token (logout / permissão revogada). Só o dono remove.
create or replace function public.remover_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_tokens
  where token = btrim(p_token) and usuario_id = auth.uid();
end; $$;
grant execute on function public.remover_push_token(text) to authenticated;

-- 5) Definir a preferência de push do próprio usuário (M6).
create or replace function public.definir_pref_push(p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.usuarios set notif_push = coalesce(p_ativo, true)
  where id = auth.uid();
end; $$;
grant execute on function public.definir_pref_push(boolean) to authenticated;
