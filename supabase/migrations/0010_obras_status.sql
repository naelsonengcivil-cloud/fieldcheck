-- ============================================================
-- FieldCheck · Migration 0010 — Ciclo de vida da obra (Marco A / M13)
-- Substitui o booleano obras.ativa por status:
--   em_andamento | finalizada | arquivada
-- Converte os dados existentes (ativa true→em_andamento, false→arquivada).
-- A coluna `ativa` é mantida (deprecada) para não quebrar apps antigos
-- durante a transição. Escrita de obras passa a ser SÓ admin (Marco A-f).
-- Aplicar no SQL Editor. Idempotente.
-- ============================================================

alter table public.obras add column if not exists status text;

update public.obras
  set status = case when coalesce(ativa, true) then 'em_andamento' else 'arquivada' end
  where status is null;

alter table public.obras alter column status set default 'em_andamento';
alter table public.obras alter column status set not null;
alter table public.obras drop constraint if exists obras_status_chk;
alter table public.obras
  add constraint obras_status_chk check (status in ('em_andamento', 'finalizada', 'arquivada'));
create index if not exists idx_obras_status on public.obras (empresa_id, status);

-- RLS: criar/editar/mudar status/excluir obra = só admin (antes era admin+gestor).
drop policy if exists obras_write on public.obras;
drop policy if exists obras_write_admin on public.obras;
create policy obras_write_admin on public.obras
  for all to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin')
  with check (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin');
