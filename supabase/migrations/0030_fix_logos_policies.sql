-- ============================================================
-- FieldCheck · Migration 0030 — Correção das policies do bucket 'logos' (item 1)
-- O upload de logo por admin dava "new row violates row-level security policy"
-- mesmo com papel=admin e empresa correta. Re-aplica as 3 policies de escrita
-- (insert/update/delete) com a definição canônica — corrige o caso de policy
-- ausente ou com definição divergente da 0022. Idempotente (drop + create).
--
-- Condições (todas devem ser verdadeiras para escrever):
--   bucket = 'logos' · usuário é admin da empresa · a 1ª pasta do path é o
--   empresa_id do usuário (convenção {empresa_id}/arquivo).
-- ============================================================

drop policy if exists logos_insert on storage.objects;
create policy logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.papel_do_usuario() = 'admin'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  );

drop policy if exists logos_update on storage.objects;
create policy logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and public.papel_do_usuario() = 'admin'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  )
  with check (
    bucket_id = 'logos'
    and public.papel_do_usuario() = 'admin'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  );

drop policy if exists logos_delete on storage.objects;
create policy logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.papel_do_usuario() = 'admin'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  );

-- Garante que o RLS está ligado na tabela (padrão do Supabase Storage).
alter table storage.objects enable row level security;
