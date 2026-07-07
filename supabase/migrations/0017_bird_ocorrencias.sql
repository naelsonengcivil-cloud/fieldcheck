-- ============================================================
-- FieldCheck · Migration 0017 — Classificação ST + Ocorrências (Marco A2)
-- Base da Pirâmide de Bird (segurança preditiva):
--  - NCs de checklists de Segurança do Trabalho (código ST-*) recebem uma
--    classificação obrigatória (ato_inseguro | condicao_insegura | quase_acidente),
--    consultável pelos filtros (fica em respostas);
--  - registro de ocorrências (danos/acidentes) independente das inspeções,
--    com RLS por empresa, alimentando os níveis superiores da pirâmide.
-- Aplicar no SQL Editor, após a 0016. Idempotente.
-- ============================================================

-- 1) Classificação ST na resposta (null para não-ST).
alter table public.respostas add column if not exists classificacao_st text;
alter table public.respostas drop constraint if exists respostas_class_st_chk;
alter table public.respostas add constraint respostas_class_st_chk
  check (classificacao_st is null
         or classificacao_st in ('ato_inseguro', 'condicao_insegura', 'quase_acidente'));

-- Sugestão de classificação por item (default editável pelo fiscal).
alter table public.itens_checklist add column if not exists classificacao_st_sugerida text;
alter table public.itens_checklist drop constraint if exists itens_class_st_sugerida_chk;
alter table public.itens_checklist add constraint itens_class_st_sugerida_chk
  check (classificacao_st_sugerida is null
         or classificacao_st_sugerida in ('ato_inseguro', 'condicao_insegura', 'quase_acidente'));

-- Obrigatoriedade no banco: NC de checklist ST exige classificação.
create or replace function public.tg_resposta_class_st()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if new.resposta = 'NC' and new.classificacao_st is null then
    select c.codigo into v_codigo
      from public.itens_checklist i
      join public.checklists c on c.id = i.checklist_id
      where i.id = new.item_id;
    if v_codigo like 'ST-%' then
      raise exception 'NC de checklist de Segurança do Trabalho exige classificação (ato inseguro / condição insegura / quase acidente).'
        using errcode = '23514';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_resposta_class_st on public.respostas;
create trigger trg_resposta_class_st
  before insert on public.respostas
  for each row execute function public.tg_resposta_class_st();

-- 2) Ocorrências (danos/acidentes) — independentes das inspeções.
create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas,
  obra_id uuid not null references public.obras,
  contratada_id uuid references public.contratadas,
  tipo text not null,          -- dano_material | acidente_sem_afastamento | acidente_com_afastamento
  data date not null,
  descricao text not null,
  criado_por uuid references public.usuarios,
  criado_em timestamptz not null default now(),
  constraint ocorrencias_tipo_chk
    check (tipo in ('dano_material', 'acidente_sem_afastamento', 'acidente_com_afastamento'))
);
create index if not exists idx_ocorrencias_empresa on public.ocorrencias (empresa_id, data);
create index if not exists idx_ocorrencias_obra on public.ocorrencias (obra_id);
alter table public.ocorrencias enable row level security;
grant select, insert, update, delete on public.ocorrencias to authenticated;

drop policy if exists ocorrencias_select on public.ocorrencias;
create policy ocorrencias_select on public.ocorrencias
  for select to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and (public.papel_do_usuario() <> 'executora' or contratada_id = public.contratada_do_usuario())
  );

drop policy if exists ocorrencias_insert on public.ocorrencias;
create policy ocorrencias_insert on public.ocorrencias
  for insert to authenticated
  with check (empresa_id = public.empresa_do_usuario() and criado_por = auth.uid());

drop policy if exists ocorrencias_update on public.ocorrencias;
create policy ocorrencias_update on public.ocorrencias
  for update to authenticated
  using (
    empresa_id = public.empresa_do_usuario()
    and (criado_por = auth.uid() or public.papel_do_usuario() in ('gestor', 'admin'))
  )
  with check (empresa_id = public.empresa_do_usuario());

drop policy if exists ocorrencias_delete on public.ocorrencias;
create policy ocorrencias_delete on public.ocorrencias
  for delete to authenticated
  using (empresa_id = public.empresa_do_usuario() and public.papel_do_usuario() in ('gestor', 'admin'));

-- 3) Evidências também podem pertencer a uma ocorrência.
alter table public.evidencias add column if not exists ocorrencia_id uuid references public.ocorrencias on delete cascade;
create index if not exists idx_evidencias_ocorrencia on public.evidencias (ocorrencia_id);

alter table public.evidencias drop constraint if exists evidencias_tipo_chk;
alter table public.evidencias add constraint evidencias_tipo_chk
  check (tipo in ('abertura', 'fechamento', 'tratamento', 'conformidade', 'ocorrencia'));

alter table public.evidencias drop constraint if exists evidencias_vinculo_chk;
alter table public.evidencias add constraint evidencias_vinculo_chk
  check (resposta_id is not null or evento_id is not null or ocorrencia_id is not null);

-- RLS de evidências: acrescenta o vínculo por ocorrência (mesma empresa).
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
    or
    (ocorrencia_id is not null and exists (
      select 1 from public.ocorrencias o
      where o.id = evidencias.ocorrencia_id
        and o.empresa_id = public.empresa_do_usuario()
        and (public.papel_do_usuario() <> 'executora' or o.contratada_id = public.contratada_do_usuario())
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
    or
    (ocorrencia_id is not null and exists (
      select 1 from public.ocorrencias o
      where o.id = evidencias.ocorrencia_id
        and o.empresa_id = public.empresa_do_usuario()
    ))
  );

-- 4) Seed (1º palpite) da classificação sugerida por item de checklist ST.
--    Heurística: itens sobre comportamento/EPI/procedimento/permissão → ato
--    inseguro; os demais (estado físico do ambiente/instalação) → condição
--    insegura. O fiscal edita na inspeção. Só toca itens de checklists ST-*.
update public.itens_checklist i set classificacao_st_sugerida = 'ato_inseguro'
  from public.checklists c
 where c.id = i.checklist_id and c.codigo like 'ST-%'
   and i.classificacao_st_sugerida is null
   and (i.texto ilike '%epi%' or i.texto ilike '%uso %' or i.texto ilike '%utiliza%'
        or i.texto ilike '%procedimento%' or i.texto ilike '%apr%' or i.texto ilike '%permiss%'
        or i.texto ilike '%treina%' or i.texto ilike '%capacita%' or i.texto ilike '%comportament%'
        or i.texto ilike '%conduta%' or i.texto ilike '%integra%' or i.texto ilike '%habilita%');

update public.itens_checklist i set classificacao_st_sugerida = 'condicao_insegura'
  from public.checklists c
 where c.id = i.checklist_id and c.codigo like 'ST-%'
   and i.classificacao_st_sugerida is null;
