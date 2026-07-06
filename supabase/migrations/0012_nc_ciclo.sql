-- ============================================================
-- FieldCheck · Migration 0012 — Ciclo de tratamento de NC (Marco B1)
-- Fiscal abre a NC (status 'aberto', na inspeção) → executora registra o
-- tratamento ('tratada') → gestor/admin aprova ('aprovada') ou reprova
-- ('reaberta', volta p/ a executora). Cada passo grava um histórico
-- imutável em nc_transicoes (separado da auditoria de admin do M14).
-- As transições são feitas por RPCs SECURITY DEFINER que validam a
-- máquina de estados e o papel — o cliente não escreve status à mão.
-- Aplicar no SQL Editor.
-- ============================================================

-- 1) Novos estados do ciclo (mantém os legados p/ compatibilidade).
alter table public.eventos_nc drop constraint if exists eventos_nc_status_chk;
alter table public.eventos_nc add constraint eventos_nc_status_chk
  check (status in ('aberto', 'em_andamento', 'tratada', 'aprovada', 'reaberta', 'fechado'));

-- 2) Evidência de tratamento (foto anexada pela executora).
alter table public.evidencias drop constraint if exists evidencias_tipo_chk;
alter table public.evidencias add constraint evidencias_tipo_chk
  check (tipo in ('abertura', 'fechamento', 'tratamento'));

-- 3) Histórico do ciclo — imutável, sobrevive por FK ao evento (cascade
--    só quando o próprio evento/inspeção é excluído). Sem policy de insert:
--    só as RPCs (security definer) gravam.
create table if not exists public.nc_transicoes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos_nc on delete cascade,
  empresa_id uuid not null references public.empresas,
  de_status text,
  para_status text not null,
  ator_id uuid references public.usuarios,
  ator_nome text,                      -- snapshot do nome (persiste)
  comentario text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_nc_transicoes_evento on public.nc_transicoes (evento_id, criado_em);
create index if not exists idx_nc_transicoes_empresa on public.nc_transicoes (empresa_id, criado_em desc);
alter table public.nc_transicoes enable row level security;
grant select on public.nc_transicoes to authenticated;
drop policy if exists nc_transicoes_select on public.nc_transicoes;
create policy nc_transicoes_select on public.nc_transicoes
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

-- 4) Helper interno: valida acesso, grava a transição e move o status.
--    Usado pelas três RPCs abaixo. Retorna o novo updated_at.
create or replace function public._nc_transicionar(
  p_evento_id uuid, p_de text[], p_para text, p_comentario text, p_exige_gestor boolean
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.empresa_do_usuario();
  v_uid uuid := auth.uid();
  v_papel text := public.papel_do_usuario();
  v_nome text;
  v_status text;
  v_now timestamptz := now();
begin
  if p_exige_gestor and v_papel not in ('gestor', 'admin') then
    raise exception 'Apenas gestor ou administrador.' using errcode = '42501';
  end if;
  select status into v_status from public.eventos_nc
    where id = p_evento_id and empresa_id = v_emp for update;
  if not found then raise exception 'NC não encontrada.' using errcode = 'P0002'; end if;
  if not (v_status = any(p_de)) then
    raise exception 'Transição inválida a partir de "%".', v_status using errcode = '22023';
  end if;

  update public.eventos_nc set status = p_para where id = p_evento_id;  -- trigger reescreve updated_at
  select nome into v_nome from public.usuarios where id = v_uid;
  insert into public.nc_transicoes (evento_id, empresa_id, de_status, para_status, ator_id, ator_nome, comentario)
    values (p_evento_id, v_emp, v_status, p_para, v_uid, v_nome, nullif(btrim(p_comentario), ''));
  return v_now;
end; $$;

-- 5) RPCs do ciclo.

-- Executora registra o tratamento: aberto/reaberta/em_andamento → tratada.
-- Descrição obrigatória; grava em eventos_nc.tratamento. (Qualquer membro da
-- empresa pode tratar; o papel executora dedicado chega no M17/B2.)
create or replace function public.registrar_tratamento(p_evento_id uuid, p_descricao text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario();
begin
  if nullif(btrim(p_descricao), '') is null then
    raise exception 'Descrição do tratamento obrigatória.' using errcode = '22023';
  end if;
  update public.eventos_nc set tratamento = btrim(p_descricao)
    where id = p_evento_id and empresa_id = v_emp;
  return public._nc_transicionar(
    p_evento_id, array['aberto','reaberta','em_andamento'], 'tratada', p_descricao, false);
end; $$;
grant execute on function public.registrar_tratamento(uuid, text) to authenticated;

-- Gestor/admin aprova: tratada → aprovada (encerra a NC).
create or replace function public.aprovar_tratamento(p_evento_id uuid, p_comentario text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario(); v_ts timestamptz;
begin
  v_ts := public._nc_transicionar(p_evento_id, array['tratada'], 'aprovada', p_comentario, true);
  update public.eventos_nc set fechado_em = now(), fechado_por = auth.uid()
    where id = p_evento_id and empresa_id = v_emp;
  return v_ts;
end; $$;
grant execute on function public.aprovar_tratamento(uuid, text) to authenticated;

-- Gestor/admin reprova: tratada → reaberta (volta p/ a executora). Motivo obrigatório.
create or replace function public.reprovar_tratamento(p_evento_id uuid, p_motivo text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario();
begin
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Motivo da reprovação obrigatório.' using errcode = '22023';
  end if;
  update public.eventos_nc set fechado_em = null, fechado_por = null
    where id = p_evento_id and empresa_id = v_emp;
  return public._nc_transicionar(p_evento_id, array['tratada'], 'reaberta', p_motivo, true);
end; $$;
grant execute on function public.reprovar_tratamento(uuid, text) to authenticated;
