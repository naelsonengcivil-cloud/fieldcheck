-- ============================================================
-- FieldCheck · Migration 0004 — Storage (fotos de evidência)
-- Bucket privado 'evidencias'. Convenção de caminho:
--   {empresa_id}/{inspecao_id}/{arquivo}.jpg
-- O RLS de storage.objects isola por empresa usando a 1ª pasta do path.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias', 'evidencias', false,
  5242880,                                  -- 5 MB (fotos comprimidas ~1280px q0.7)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura: qualquer usuário autenticado da mesma empresa (1ª pasta = empresa_id).
drop policy if exists evidencias_read on storage.objects;
create policy evidencias_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  );

-- Upload: dentro da própria empresa.
drop policy if exists evidencias_upload on storage.objects;
create policy evidencias_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  );

-- Update/overwrite (retry de upload idempotente §7.4): mesma empresa.
drop policy if exists evidencias_update on storage.objects;
create policy evidencias_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  )
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = public.empresa_do_usuario()::text
  );
