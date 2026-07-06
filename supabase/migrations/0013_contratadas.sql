-- ============================================================
-- FieldCheck · Migration 0013 — Contratadas + papel executora (Marco B2/M17)
-- Introduz a empresa executora (contratada) como entidade e o papel
-- 'executora', que enxerga/trata APENAS as NCs da sua contratada.
-- Modelo escolhido: 1 contratada por usuário (usuarios.contratada_id);
-- eventos_nc.contratada_id é denormalizado da inspeção (RLS direto).
-- Não quebra dados atuais: inspecoes.contratada (texto) permanece.
-- Aplicar no SQL Editor. Idempotente.
-- ============================================================

-- 1) Tabela de contratadas (empresas executoras sob a empresa cliente).
create table if not exists public.contratadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas,
  nome text not null,
  cnpj text,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists idx_contratadas_empresa on public.contratadas (empresa_id);
alter table public.contratadas enable row level security;
grant select, insert, update, delete on public.contratadas to authenticated;

drop policy if exists contratadas_select on public.contratadas;
create policy contratadas_select on public.contratadas
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

drop policy if exists contratadas_write on public.contratadas;
create policy contratadas_write on public.contratadas
  for all to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() in ('gestor', 'admin'))
  with check (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() in ('gestor', 'admin'));

-- 2) Papel 'executora' + vínculo do usuário à sua contratada.
alter table public.usuarios drop constraint if exists usuarios_papel_chk;
alter table public.usuarios add constraint usuarios_papel_chk
  check (papel in ('inspetor', 'gestor', 'admin', 'executora'));
alter table public.usuarios add column if not exists contratada_id uuid references public.contratadas;

-- Convites já podem trazer papel executora + contratada (RPCs no M17.2).
alter table public.convites drop constraint if exists convites_papel_chk;
alter table public.convites add constraint convites_papel_chk
  check (papel in ('inspetor', 'gestor', 'admin', 'executora'));
alter table public.convites add column if not exists contratada_id uuid references public.contratadas;

-- 3) Vínculo da inspeção e da NC à contratada.
alter table public.inspecoes add column if not exists contratada_id uuid references public.contratadas;
alter table public.eventos_nc add column if not exists contratada_id uuid references public.contratadas;
create index if not exists idx_inspecoes_contratada on public.inspecoes (contratada_id);
create index if not exists idx_eventos_contratada on public.eventos_nc (contratada_id);

-- Helper: contratada do usuário logado (executora). SECURITY DEFINER evita
-- recursão de RLS ao ler usuarios.
create or replace function public.contratada_do_usuario()
returns uuid language sql security definer set search_path = public stable as $$
  select contratada_id from public.usuarios where id = auth.uid();
$$;
grant execute on function public.contratada_do_usuario() to authenticated;

-- 4) Denormaliza eventos_nc.contratada_id a partir da inspeção-mãe.
--    A NC herda a contratada da inspeção (via resposta → inspecao).
create or replace function public.tg_evento_contratada()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contratada_id is null then
    select i.contratada_id into new.contratada_id
      from public.respostas r
      join public.inspecoes i on i.id = r.inspecao_id
      where r.id = new.resposta_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_evento_contratada on public.eventos_nc;
create trigger trg_evento_contratada
  before insert or update of resposta_id on public.eventos_nc
  for each row execute function public.tg_evento_contratada();

-- Backfill das NCs existentes.
update public.eventos_nc e set contratada_id = i.contratada_id
  from public.respostas r
  join public.inspecoes i on i.id = r.inspecao_id
 where r.id = e.resposta_id and e.contratada_id is null and i.contratada_id is not null;

-- ============================================================
-- 5) RLS: a executora só enxerga o que é da sua contratada.
--    (papel <> 'executora' → sem restrição adicional, como antes.)
-- ============================================================
drop policy if exists inspecoes_select on public.inspecoes;
create policy inspecoes_select on public.inspecoes
  for select to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and (public.papel_do_usuario() <> 'executora' or contratada_id = public.contratada_do_usuario())
  );

drop policy if exists respostas_select on public.respostas;
create policy respostas_select on public.respostas
  for select to authenticated
  using (
    exists (
      select 1 from public.inspecoes i
      where i.id = respostas.inspecao_id
        and i.empresa_id = public.empresa_do_usuario()
        and (public.papel_do_usuario() <> 'executora' or i.contratada_id = public.contratada_do_usuario())
    )
  );

drop policy if exists eventos_select on public.eventos_nc;
create policy eventos_select on public.eventos_nc
  for select to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and (public.papel_do_usuario() <> 'executora' or contratada_id = public.contratada_do_usuario())
  );

-- Escrita direta em eventos_nc (sync de inspetor): executora nunca escreve
-- fora da sua contratada (o ciclo dela é via RPC security definer).
drop policy if exists eventos_update on public.eventos_nc;
create policy eventos_update on public.eventos_nc
  for update to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and (public.papel_do_usuario() <> 'executora' or contratada_id = public.contratada_do_usuario())
  )
  with check (empresa_id = public.empresa_do_usuario());

drop policy if exists evidencias_select on public.evidencias;
create policy evidencias_select on public.evidencias
  for select to authenticated
  using (
    (resposta_id is not null and exists (
      select 1 from public.respostas r
      join public.inspecoes i on i.id = r.inspecao_id
      where r.id = evidencias.resposta_id
        and i.empresa_id = public.empresa_do_usuario()
        and (public.papel_do_usuario() <> 'executora' or i.contratada_id = public.contratada_do_usuario())
    ))
    or
    (evento_id is not null and exists (
      select 1 from public.eventos_nc e
      where e.id = evidencias.evento_id
        and e.empresa_id = public.empresa_do_usuario()
        and (public.papel_do_usuario() <> 'executora' or e.contratada_id = public.contratada_do_usuario())
    ))
  );

drop policy if exists nc_transicoes_select on public.nc_transicoes;
create policy nc_transicoes_select on public.nc_transicoes
  for select to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and (
      public.papel_do_usuario() <> 'executora'
      or exists (
        select 1 from public.eventos_nc e
        where e.id = nc_transicoes.evento_id
          and e.contratada_id = public.contratada_do_usuario()
      )
    )
  );

-- ============================================================
-- 6) RPC do ciclo: executora só trata NCs da sua contratada.
--    (aprovar/reprovar já são gestor/admin — executora nem chega lá.)
-- ============================================================
create or replace function public.registrar_tratamento(p_evento_id uuid, p_descricao text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := public.empresa_do_usuario();
  v_papel text := public.papel_do_usuario();
  v_contr uuid;
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
  return public._nc_transicionar(
    p_evento_id, array['aberto','reaberta','em_andamento'], 'tratada', p_descricao, false);
end; $$;
grant execute on function public.registrar_tratamento(uuid, text) to authenticated;
