-- ============================================================
-- FieldCheck · Migration 0022 — Identidade visual + assinatura (Marco J)
-- (1) Logo da empresa: coluna empresas.logo_url + bucket público 'logos'
--     (leitura pública p/ o print; escrita só do admin da própria empresa).
-- (2) Assinatura do inspetor: inspecoes.assinatura (data URL PNG comprimido),
--     viaja com a inspeção na fila de sync (offline-first).
-- Aplicar no SQL Editor, após a 0021. Idempotente.
-- ============================================================

-- 1) URL pública do logo (caminho no bucket 'logos').
alter table public.empresas add column if not exists logo_url text;

-- 2) Assinatura digital do inspetor (PNG data URL). Pequena (~5-15 KB).
alter table public.inspecoes add column if not exists assinatura text;

-- 3) Bucket de logos — PÚBLICO (marca, não é dado sensível): o PDF referencia
--    a URL direta sem signed URL. Limite 2 MB; aceita raster + SVG.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos', 'logos', true,
  2097152,                                  -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura é pública (bucket public=true) — não precisa de policy de SELECT.
-- Escrita (upload/troca/remoção): só o ADMIN da empresa, na pasta da empresa
-- (1ª pasta do path = empresa_id). Convenção: {empresa_id}/logo.<ext>
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
