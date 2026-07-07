-- ============================================================
-- FieldCheck · Migration 0015 — Notificações do ciclo de NC (N1 in-app)
-- Feed in-app com fan-out por usuário (1 linha por destinatário → "lida"
-- é por usuário). As transições do ciclo criam notificações para o
-- público certo (executora / gestor) via helper SECURITY DEFINER.
-- Depende de 0012–0014. Aplicar no SQL Editor. Idempotente.
-- ============================================================

-- 1) Tabela (uma linha por destinatário).
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas,
  usuario_id uuid not null references public.usuarios on delete cascade,
  tipo text not null,        -- nc_atribuida | nc_reaberta | nc_aguardando_aprovacao | nc_aprovada
  titulo text not null,
  corpo text,
  evento_id uuid references public.eventos_nc on delete cascade,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists idx_notificacoes_usuario on public.notificacoes (usuario_id, lida_em);
create index if not exists idx_notificacoes_empresa on public.notificacoes (empresa_id, criado_em desc);
alter table public.notificacoes enable row level security;
grant select, update on public.notificacoes to authenticated;

drop policy if exists notificacoes_select on public.notificacoes;
create policy notificacoes_select on public.notificacoes
  for select to authenticated using (usuario_id = auth.uid());

-- Update só para marcar como lida (a própria linha). Insert só via helper.
drop policy if exists notificacoes_update on public.notificacoes;
create policy notificacoes_update on public.notificacoes
  for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- 2) Helper: fan-out da notificação para o público do tipo.
create or replace function public._notificar_nc(p_evento_id uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid; v_contr uuid; v_obra text; v_item text; v_titulo text; v_corpo text;
begin
  select e.empresa_id, e.contratada_id, o.nome, coalesce(it.texto, r.observacao, 'NC')
    into v_emp, v_contr, v_obra, v_item
  from public.eventos_nc e
  join public.respostas r on r.id = e.resposta_id
  join public.inspecoes insp on insp.id = r.inspecao_id
  join public.obras o on o.id = insp.obra_id
  left join public.itens_checklist it on it.id = r.item_id
  where e.id = p_evento_id;
  if v_emp is null then return; end if;

  v_titulo := case p_tipo
    when 'nc_atribuida' then 'Nova NC para tratar'
    when 'nc_reaberta' then 'NC reaberta — retomar tratamento'
    when 'nc_aguardando_aprovacao' then 'Tratamento aguardando aprovação'
    when 'nc_aprovada' then 'NC aprovada e encerrada'
    else 'Atualização de NC'
  end;
  v_corpo := v_obra || ': ' || left(v_item, 120);

  -- fan-out; nunca notifica o próprio autor da ação.
  insert into public.notificacoes (empresa_id, usuario_id, tipo, titulo, corpo, evento_id)
  select v_emp, u.id, p_tipo, v_titulo, v_corpo, p_evento_id
  from public.usuarios u
  where u.empresa_id = v_emp
    and u.ativo
    and u.id is distinct from auth.uid()
    and (
      (p_tipo in ('nc_atribuida', 'nc_reaberta', 'nc_aprovada')
        and u.papel = 'executora' and u.contratada_id = v_contr)
      or
      (p_tipo = 'nc_aguardando_aprovacao' and u.papel in ('gestor', 'admin'))
    );
end; $$;

-- 3) NC criada (evento inserido) → notifica a executora da contratada.
--    AFTER INSERT (contratada_id já preenchido pelo trigger tg_evento_contratada).
create or replace function public.tg_evento_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contratada_id is not null then
    perform public._notificar_nc(new.id, 'nc_atribuida');
  end if;
  return new;
end; $$;
drop trigger if exists trg_evento_notificar on public.eventos_nc;
create trigger trg_evento_notificar
  after insert on public.eventos_nc
  for each row execute function public.tg_evento_notificar();

-- 4) Notifica nas transições do ciclo (redefine as RPCs de 0012/0013
--    acrescentando o _notificar_nc; mesma lógica de estado/papel).
create or replace function public.registrar_tratamento(p_evento_id uuid, p_descricao text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.empresa_do_usuario();
  v_papel text := public.papel_do_usuario();
  v_contr uuid;
  v_ts timestamptz;
begin
  if nullif(btrim(p_descricao), '') is null then
    raise exception 'Descrição do tratamento obrigatória.' using errcode = '22023';
  end if;
  if v_papel = 'executora' then
    select contratada_id into v_contr from public.eventos_nc where id = p_evento_id and empresa_id = v_emp;
    if v_contr is distinct from public.contratada_do_usuario() then
      raise exception 'Esta NC não é da sua contratada.' using errcode = '42501';
    end if;
  end if;
  update public.eventos_nc set tratamento = btrim(p_descricao)
    where id = p_evento_id and empresa_id = v_emp;
  v_ts := public._nc_transicionar(p_evento_id, array['aberto','reaberta','em_andamento'], 'tratada', p_descricao, false);
  perform public._notificar_nc(p_evento_id, 'nc_aguardando_aprovacao');
  return v_ts;
end; $$;
grant execute on function public.registrar_tratamento(uuid, text) to authenticated;

create or replace function public.aprovar_tratamento(p_evento_id uuid, p_comentario text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario(); v_ts timestamptz;
begin
  v_ts := public._nc_transicionar(p_evento_id, array['tratada'], 'aprovada', p_comentario, true);
  update public.eventos_nc set fechado_em = now(), fechado_por = auth.uid()
    where id = p_evento_id and empresa_id = v_emp;
  perform public._notificar_nc(p_evento_id, 'nc_aprovada');
  return v_ts;
end; $$;
grant execute on function public.aprovar_tratamento(uuid, text) to authenticated;

create or replace function public.reprovar_tratamento(p_evento_id uuid, p_motivo text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.empresa_do_usuario(); v_ts timestamptz;
begin
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Motivo da reprovação obrigatório.' using errcode = '22023';
  end if;
  update public.eventos_nc set fechado_em = null, fechado_por = null
    where id = p_evento_id and empresa_id = v_emp;
  v_ts := public._nc_transicionar(p_evento_id, array['tratada'], 'reaberta', p_motivo, true);
  perform public._notificar_nc(p_evento_id, 'nc_reaberta');
  return v_ts;
end; $$;
grant execute on function public.reprovar_tratamento(uuid, text) to authenticated;
