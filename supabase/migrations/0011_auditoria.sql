-- ============================================================
-- FieldCheck · Migration 0011 — Auditoria + arquivar/excluir inspeção
-- (Marco A / M14). Tabela eventos_auditoria (separada) que SOBREVIVE às
-- exclusões; campo inspecoes.arquivada; RPCs SECURITY DEFINER admin-only.
-- A exclusão administrativa passa pela imutabilidade de inspeção finalizada
-- via um GUC de sessão (fieldcheck.exclusao_admin). Aplicar no SQL Editor.
-- ============================================================

-- 1) Inspeção arquivada (fora de KPIs/listas padrão; reversível).
alter table public.inspecoes add column if not exists arquivada boolean not null default false;
create index if not exists idx_inspecoes_arquivada on public.inspecoes (empresa_id, arquivada);

-- 2) Log de auditoria (não referencia a inspeção → sobrevive à exclusão).
create table if not exists public.eventos_auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas,
  ator_id uuid references public.usuarios,
  ator_nome text,                      -- snapshot do nome (persiste)
  entidade_tipo text not null,         -- 'inspecao' | 'obra' | ...
  entidade_id uuid,                    -- pode não existir mais
  acao text not null,                  -- 'arquivar_inspecao' | 'excluir_inspecao' | ...
  motivo text,
  dados jsonb,                         -- snapshot/detalhes
  criado_em timestamptz not null default now()
);
create index if not exists idx_auditoria_empresa on public.eventos_auditoria (empresa_id, criado_em desc);
alter table public.eventos_auditoria enable row level security;
grant select on public.eventos_auditoria to authenticated;
drop policy if exists auditoria_select on public.eventos_auditoria;
create policy auditoria_select on public.eventos_auditoria
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() in ('admin', 'gestor'));
-- Inserção só via RPC (security definer); sem policy de insert para clientes.

-- 3) Imutabilidade de respostas: libera a exclusão administrativa via GUC.
create or replace function public.tg_resposta_imutavel()
returns trigger
language plpgsql
as $$
declare
  st text;
  insp uuid;
begin
  -- Exclusão administrativa (RPC excluir_inspecao) passa livre.
  if current_setting('fieldcheck.exclusao_admin', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  insp := coalesce(new.inspecao_id, old.inspecao_id);
  select status into st from public.inspecoes where id = insp;
  if st = 'finalizada' and (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    raise exception 'Respostas de inspeção finalizada são imutáveis (inspecao=%).', insp
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- 4) RPCs (admin-only).
create or replace function public.arquivar_inspecao(p_inspecao_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario(); v_uid uuid := auth.uid(); v_nome text;
begin
  if public.papel_do_usuario() <> 'admin' then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Motivo obrigatório.' using errcode = '22023'; end if;
  update public.inspecoes set arquivada = true where id = p_inspecao_id and empresa_id = v_emp;
  if not found then raise exception 'Inspeção não encontrada.' using errcode = 'P0002'; end if;
  select nome into v_nome from public.usuarios where id = v_uid;
  insert into public.eventos_auditoria (empresa_id, ator_id, ator_nome, entidade_tipo, entidade_id, acao, motivo)
    values (v_emp, v_uid, v_nome, 'inspecao', p_inspecao_id, 'arquivar_inspecao', btrim(p_motivo));
end; $$;
grant execute on function public.arquivar_inspecao(uuid, text) to authenticated;

create or replace function public.desarquivar_inspecao(p_inspecao_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario(); v_uid uuid := auth.uid(); v_nome text;
begin
  if public.papel_do_usuario() <> 'admin' then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  update public.inspecoes set arquivada = false where id = p_inspecao_id and empresa_id = v_emp;
  if not found then raise exception 'Inspeção não encontrada.' using errcode = 'P0002'; end if;
  select nome into v_nome from public.usuarios where id = v_uid;
  insert into public.eventos_auditoria (empresa_id, ator_id, ator_nome, entidade_tipo, entidade_id, acao)
    values (v_emp, v_uid, v_nome, 'inspecao', p_inspecao_id, 'desarquivar_inspecao');
end; $$;
grant execute on function public.desarquivar_inspecao(uuid) to authenticated;

create or replace function public.excluir_inspecao(p_inspecao_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario(); v_uid uuid := auth.uid(); v_nome text; v_snap jsonb;
begin
  if public.papel_do_usuario() <> 'admin' then raise exception 'Apenas administradores.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Motivo obrigatório.' using errcode = '22023'; end if;
  select to_jsonb(i) into v_snap from public.inspecoes i where i.id = p_inspecao_id and i.empresa_id = v_emp;
  if v_snap is null then raise exception 'Inspeção não encontrada.' using errcode = 'P0002'; end if;
  select nome into v_nome from public.usuarios where id = v_uid;
  -- registra ANTES de excluir; o log não referencia a inspeção → sobrevive.
  insert into public.eventos_auditoria (empresa_id, ator_id, ator_nome, entidade_tipo, entidade_id, acao, motivo, dados)
    values (v_emp, v_uid, v_nome, 'inspecao', p_inspecao_id, 'excluir_inspecao', btrim(p_motivo), v_snap);
  -- exclui (cascade remove respostas/eventos_nc/evidências); GUC libera a imutabilidade.
  perform set_config('fieldcheck.exclusao_admin', 'on', true);
  delete from public.inspecoes where id = p_inspecao_id and empresa_id = v_emp;
end; $$;
grant execute on function public.excluir_inspecao(uuid, text) to authenticated;
