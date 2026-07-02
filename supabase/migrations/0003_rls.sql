-- ============================================================
-- FieldCheck · Migration 0003 — Row Level Security (§4 regras, §6 LGPD)
-- Isolamento multi-tenant: todo acesso é filtrado por empresa do
-- usuário autenticado. Catálogo padrão (empresa_id null) é legível
-- por todos os usuários autenticados.
-- ============================================================

-- ---------- helpers (SECURITY DEFINER: leem usuarios sem recursão de RLS) ----------
create or replace function public.empresa_do_usuario()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select empresa_id from public.usuarios where id = auth.uid();
$$;

create or replace function public.papel_do_usuario()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select papel from public.usuarios where id = auth.uid();
$$;

grant execute on function public.empresa_do_usuario() to authenticated;
grant execute on function public.papel_do_usuario() to authenticated;

-- ---------- privilégios de tabela (o RLS abaixo é quem restringe de fato) ----------
-- Garante que o papel `authenticated` tenha acesso às tabelas; sem isto, uma
-- base recém-criada poderia recusar por falta de GRANT em vez de filtrar por RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------- habilita RLS em todas as tabelas ----------
alter table public.empresas        enable row level security;
alter table public.usuarios        enable row level security;
alter table public.obras           enable row level security;
alter table public.checklists      enable row level security;
alter table public.itens_checklist enable row level security;
alter table public.inspecoes       enable row level security;
alter table public.respostas       enable row level security;
alter table public.eventos_nc      enable row level security;
alter table public.evidencias      enable row level security;

-- ============================================================
-- empresas — cada usuário enxerga apenas a própria empresa
-- ============================================================
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas
  for select to authenticated
  using (id = public.empresa_do_usuario());

drop policy if exists empresas_update_admin on public.empresas;
create policy empresas_update_admin on public.empresas
  for update to authenticated
  using (id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin')
  with check (id = public.empresa_do_usuario());

-- ============================================================
-- usuarios — visíveis dentro da empresa; admin gerencia (Fase 2)
-- ============================================================
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios
  for update to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and (id = auth.uid() or public.papel_do_usuario() = 'admin')
  )
  with check (empresa_id = public.empresa_do_usuario());

drop policy if exists usuarios_insert_admin on public.usuarios;
create policy usuarios_insert_admin on public.usuarios
  for insert to authenticated
  with check (
    empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin'
  );

-- ============================================================
-- obras — leitura p/ toda a empresa; escrita p/ gestor/admin
-- ============================================================
drop policy if exists obras_select on public.obras;
create policy obras_select on public.obras
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

drop policy if exists obras_write on public.obras;
create policy obras_write on public.obras
  for all to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and public.papel_do_usuario() in ('gestor', 'admin')
  )
  with check (
    empresa_id = public.empresa_do_usuario()
    and public.papel_do_usuario() in ('gestor', 'admin')
  );

-- ============================================================
-- checklists — catálogo padrão (empresa_id null) + próprios da empresa
-- ============================================================
drop policy if exists checklists_select on public.checklists;
create policy checklists_select on public.checklists
  for select to authenticated
  using (empresa_id is null or empresa_id = public.empresa_do_usuario());

drop policy if exists checklists_write_admin on public.checklists;
create policy checklists_write_admin on public.checklists
  for all to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin')
  with check (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin');

-- ============================================================
-- itens_checklist — segue a visibilidade do checklist pai
-- ============================================================
drop policy if exists itens_select on public.itens_checklist;
create policy itens_select on public.itens_checklist
  for select to authenticated
  using (
    exists (
      select 1 from public.checklists c
      where c.id = itens_checklist.checklist_id
        and (c.empresa_id is null or c.empresa_id = public.empresa_do_usuario())
    )
  );

drop policy if exists itens_write_admin on public.itens_checklist;
create policy itens_write_admin on public.itens_checklist
  for all to authenticated
  using (
    exists (
      select 1 from public.checklists c
      where c.id = itens_checklist.checklist_id
        and c.empresa_id = public.empresa_do_usuario()
    ) and public.papel_do_usuario() = 'admin'
  )
  with check (
    exists (
      select 1 from public.checklists c
      where c.id = itens_checklist.checklist_id
        and c.empresa_id = public.empresa_do_usuario()
    ) and public.papel_do_usuario() = 'admin'
  );

-- ============================================================
-- inspecoes — leitura p/ a empresa; inspetor só edita rascunho próprio;
-- finalizada é imutável (reforçado por trigger em 0002).
-- ============================================================
drop policy if exists inspecoes_select on public.inspecoes;
create policy inspecoes_select on public.inspecoes
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

drop policy if exists inspecoes_insert on public.inspecoes;
create policy inspecoes_insert on public.inspecoes
  for insert to authenticated
  with check (
    empresa_id = public.empresa_do_usuario()
    and inspetor_id = auth.uid()
  );

drop policy if exists inspecoes_update_own_draft on public.inspecoes;
create policy inspecoes_update_own_draft on public.inspecoes
  for update to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and inspetor_id = auth.uid()
    and status = 'rascunho'
  )
  with check (
    empresa_id = public.empresa_do_usuario()
    and inspetor_id = auth.uid()
  );

drop policy if exists inspecoes_delete_own_draft on public.inspecoes;
create policy inspecoes_delete_own_draft on public.inspecoes
  for delete to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and inspetor_id = auth.uid()
    and status = 'rascunho'
  );

-- ============================================================
-- respostas — visibilidade/escrita seguem a inspeção pai
-- ============================================================
drop policy if exists respostas_select on public.respostas;
create policy respostas_select on public.respostas
  for select to authenticated
  using (
    exists (
      select 1 from public.inspecoes i
      where i.id = respostas.inspecao_id
        and i.empresa_id = public.empresa_do_usuario()
    )
  );

drop policy if exists respostas_write_own_draft on public.respostas;
create policy respostas_write_own_draft on public.respostas
  for all to authenticated
  using (
    exists (
      select 1 from public.inspecoes i
      where i.id = respostas.inspecao_id
        and i.empresa_id = public.empresa_do_usuario()
        and i.inspetor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.inspecoes i
      where i.id = respostas.inspecao_id
        and i.empresa_id = public.empresa_do_usuario()
        and i.inspetor_id = auth.uid()
    )
  );

-- ============================================================
-- eventos_nc — dentro da empresa; leitura p/ todos, escrita p/ membros
-- (tratamento detalhado por gestor/admin evolui na Fase 2 / RF10-11).
-- ============================================================
drop policy if exists eventos_select on public.eventos_nc;
create policy eventos_select on public.eventos_nc
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

drop policy if exists eventos_insert on public.eventos_nc;
create policy eventos_insert on public.eventos_nc
  for insert to authenticated
  with check (empresa_id = public.empresa_do_usuario());

drop policy if exists eventos_update on public.eventos_nc;
create policy eventos_update on public.eventos_nc
  for update to authenticated
  using (empresa_id = public.empresa_do_usuario())
  with check (empresa_id = public.empresa_do_usuario());

-- ============================================================
-- evidencias — visibilidade via resposta/evento vinculado (mesma empresa)
-- ============================================================
drop policy if exists evidencias_select on public.evidencias;
create policy evidencias_select on public.evidencias
  for select to authenticated
  using (
    (resposta_id is not null and exists (
      select 1 from public.respostas r
      join public.inspecoes i on i.id = r.inspecao_id
      where r.id = evidencias.resposta_id
        and i.empresa_id = public.empresa_do_usuario()
    ))
    or
    (evento_id is not null and exists (
      select 1 from public.eventos_nc e
      where e.id = evidencias.evento_id
        and e.empresa_id = public.empresa_do_usuario()
    ))
  );

drop policy if exists evidencias_insert on public.evidencias;
create policy evidencias_insert on public.evidencias
  for insert to authenticated
  with check (
    (resposta_id is not null and exists (
      select 1 from public.respostas r
      join public.inspecoes i on i.id = r.inspecao_id
      where r.id = evidencias.resposta_id
        and i.empresa_id = public.empresa_do_usuario()
        and i.inspetor_id = auth.uid()
    ))
    or
    (evento_id is not null and exists (
      select 1 from public.eventos_nc e
      where e.id = evidencias.evento_id
        and e.empresa_id = public.empresa_do_usuario()
    ))
  );
