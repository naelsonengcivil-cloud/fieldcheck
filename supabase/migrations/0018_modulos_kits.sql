-- ============================================================
-- FieldCheck · Migration 0018 — Módulos, dimensões, Kits e projeto de
-- referência (Marco E). Prepara o schema para o catálogo mestre v2
-- (83 checklists) e os Kits de Obra. O seed em si vem na 0019.
-- Aplicar no SQL Editor, após a 0017. Idempotente.
-- ============================================================

-- 1) Dimensões do checklist (v2).
alter table public.checklists add column if not exists modulo text;
alter table public.checklists add column if not exists tipo text;
alter table public.checklists add column if not exists fase text;
alter table public.checklists add column if not exists referencia_documento text;
alter table public.checklists add column if not exists nrs_relacionadas text[];
alter table public.checklists add column if not exists exige_projeto_ref boolean not null default false;

alter table public.checklists drop constraint if exists checklists_modulo_chk;
alter table public.checklists add constraint checklists_modulo_chk
  check (modulo is null or modulo in (
    'civil', 'eletromecanica', 'eletrica', 'comissionamento',
    'linhas_transmissao', 'telecom', 'edificacoes', 'reformas', 'transversal'));

alter table public.checklists drop constraint if exists checklists_tipo_chk;
alter table public.checklists add constraint checklists_tipo_chk
  check (tipo is null or tipo in (
    'seguranca_nr', 'meio_ambiente', 'qualidade', 'documentacao', 'equipamentos', 'execucao'));

create index if not exists idx_checklists_modulo on public.checklists (modulo);
create index if not exists idx_checklists_tipo on public.checklists (tipo);

-- 2) Projeto de referência aprovado na inspeção (módulos técnicos).
alter table public.inspecoes add column if not exists projeto_ref_numero text;
alter table public.inspecoes add column if not exists projeto_ref_revisao text;

-- 3) Kits de Obra: modelos do sistema (empresa_id null) + kits da empresa.
create table if not exists public.kits (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas,   -- null = modelo do sistema (seed)
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists idx_kits_empresa on public.kits (empresa_id);

create table if not exists public.kit_checklists (
  kit_id uuid not null references public.kits on delete cascade,
  checklist_id uuid not null references public.checklists on delete cascade,
  primary key (kit_id, checklist_id)
);

alter table public.kits enable row level security;
alter table public.kit_checklists enable row level security;
grant select, insert, update, delete on public.kits to authenticated;
grant select, insert, update, delete on public.kit_checklists to authenticated;

-- Kits: modelos do sistema visíveis a todos; kits próprios da empresa.
drop policy if exists kits_select on public.kits;
create policy kits_select on public.kits
  for select to authenticated
  using (empresa_id is null or empresa_id = public.empresa_do_usuario());

-- Escrita apenas de kits da própria empresa (admin). Modelos (null) só via seed.
drop policy if exists kits_write_admin on public.kits;
create policy kits_write_admin on public.kits
  for all to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin')
  with check (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin');

-- kit_checklists: visibilidade segue o kit; escrita segue o kit da empresa.
drop policy if exists kit_checklists_select on public.kit_checklists;
create policy kit_checklists_select on public.kit_checklists
  for select to authenticated
  using (exists (
    select 1 from public.kits k where k.id = kit_checklists.kit_id
      and (k.empresa_id is null or k.empresa_id = public.empresa_do_usuario())
  ));

drop policy if exists kit_checklists_write_admin on public.kit_checklists;
create policy kit_checklists_write_admin on public.kit_checklists
  for all to authenticated
  using (exists (
    select 1 from public.kits k where k.id = kit_checklists.kit_id
      and k.empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin'
  ))
  with check (exists (
    select 1 from public.kits k where k.id = kit_checklists.kit_id
      and k.empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() = 'admin'
  ));

-- 4) Obra adota um kit (opcional).
alter table public.obras add column if not exists kit_id uuid references public.kits;

-- 5) Exigência de classificação de segurança (Bird) generalizada: além do
--    código ST-*, passa a valer para qualquer checklist de tipo 'seguranca_nr'
--    (checklists técnicos marcados como segurança também alimentam a Bird).
create or replace function public.tg_resposta_class_st()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_codigo text; v_tipo text;
begin
  if new.resposta = 'NC' and new.classificacao_st is null then
    select c.codigo, c.tipo into v_codigo, v_tipo
      from public.itens_checklist i
      join public.checklists c on c.id = i.checklist_id
      where i.id = new.item_id;
    if v_tipo = 'seguranca_nr' or v_codigo like 'ST-%' then
      raise exception 'NC de checklist de Segurança do Trabalho exige classificação (ato inseguro / condição insegura / quase acidente).'
        using errcode = '23514';
    end if;
  end if;
  return new;
end; $$;
