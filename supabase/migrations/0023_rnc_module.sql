-- ============================================================
-- FieldCheck · Migration 0023 — Módulo RNC (Relatório de Não Conformidade)
-- Gera uma RNC pré-preenchida a partir de um item reprovado (resposta 'NC'),
-- com textos-base normativos + interpolação + redação assistida por IA.
-- Convive com o ciclo de NC existente (eventos_nc): a RNC é o DOCUMENTO formal,
-- gerado SOB DEMANDA pelo cliente/inspetor (nunca automático).
--
-- Reconciliado ao schema real:
--  · tenant = empresa_id (não tenant_id)
--  · checklists.codigo NÃO é único → checklist_codigo é texto sem FK (validado no seed)
--  · itens_checklist usa `ordem` → item_numero = ordem do item no catálogo (sem FK)
--  · reprovado = respostas.resposta = 'NC' → resposta_item_id → respostas(id)
--  · gravidade (ISO) tem enum próprio + mapa p/ criticidade (Marco I) via trigger
--  · numero sequencial por empresa+ano → unique (empresa_id, numero)
-- Aplicar no SQL Editor, após a 0022. Idempotente.
-- ============================================================

-- ---------- enums ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rnc_status') then
    create type public.rnc_status as enum
      ('aberta', 'em_tratamento', 'aguardando_reinspecao', 'fechada', 'cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'rnc_gravidade') then
    create type public.rnc_gravidade as enum ('critica', 'maior', 'menor', 'observacao');
  end if;
end $$;

-- ============================================================
-- Tabelas de REFERÊNCIA (catálogo da plataforma — seed via 0024).
-- Leitura: qualquer autenticado. Escrita: só super_admin (Alpha).
-- ============================================================

-- Modelos de RNC por fase/etapa (ex.: 'RNC-ELETRO').
create table if not exists public.rnc_modelos (
  id text primary key,
  nome text not null,
  fases_contextos text not null,
  particularidades text not null,
  created_at timestamptz not null default now()
);

-- Checklists abrangidos por cada modelo. checklist_codigo é texto (catálogo);
-- sem FK porque checklists.codigo não é único (catálogo + custom por empresa).
create table if not exists public.rnc_modelo_checklists (
  modelo_id text not null references public.rnc_modelos(id) on delete cascade,
  checklist_codigo text not null,
  primary key (modelo_id, checklist_codigo)
);
create index if not exists idx_rnc_modelo_checklists_codigo
  on public.rnc_modelo_checklists (checklist_codigo);

-- Estrutura padrão do relatório (12 seções).
create table if not exists public.rnc_secoes (
  ordem smallint primary key,
  secao text not null,
  conteudo_instrucao text not null,
  origem_dado text not null,   -- 'plataforma' | 'agente_ia' | 'inspetor' | 'workflow' | misto
  editavel boolean not null
);

-- Textos-base por item de verificação (coração do módulo). Chave = catálogo
-- (checklist_codigo + item_numero=ordem). Sem FK composta (itens não têm PK
-- (codigo,ordem)); o seed valida a existência.
create table if not exists public.rnc_textos_base (
  checklist_codigo text not null,
  item_numero smallint not null,
  gravidade_sugerida text not null,
  texto_requisito_descumprido text not null,
  texto_fundamentacao_normativa text not null,
  texto_risco_consequencia text not null,
  texto_acao_corretiva text not null,
  primary key (checklist_codigo, item_numero)
);

-- Dicionário de placeholders (contrato de dados plataforma → agente → relatório).
create table if not exists public.rnc_placeholders (
  placeholder text primary key,   -- ex.: '{{descricao_nc}}'
  significado text not null,
  origem_dado text not null,
  obrigatorio text not null
);

-- ============================================================
-- RNCs geradas (instâncias) — isoladas por empresa_id.
-- ============================================================

-- Contador de numeração por empresa + ano (RNC-2026-0147).
create table if not exists public.rnc_sequencias (
  empresa_id uuid not null references public.empresas on delete cascade,
  ano int not null,
  ultimo int not null default 0,
  primary key (empresa_id, ano)
);

-- Próximo número atômico p/ a empresa no ano corrente (SECURITY DEFINER:
-- roda além da RLS de rnc_sequencias, que fica trancada a acesso direto).
create or replace function public.next_rnc_numero(p_empresa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ano int := extract(year from now())::int;
  v_seq int;
begin
  insert into public.rnc_sequencias (empresa_id, ano, ultimo)
    values (p_empresa_id, v_ano, 1)
  on conflict (empresa_id, ano)
    do update set ultimo = public.rnc_sequencias.ultimo + 1
  returning ultimo into v_seq;
  return 'RNC-' || v_ano || '-' || lpad(v_seq::text, 4, '0');
end;
$$;
grant execute on function public.next_rnc_numero(uuid) to authenticated;

-- Mapa gravidade (ISO) → criticidade do projeto (Marco I) p/ prazos/SLA/Bird.
create or replace function public.rnc_gravidade_para_criticidade(g public.rnc_gravidade)
returns text
language sql
immutable
as $$
  select case g
    when 'critica'    then 'critica'
    when 'maior'      then 'alta'
    when 'menor'      then 'media'
    when 'observacao' then 'baixa'
  end;
$$;

create table if not exists public.rncs (
  id uuid primary key default gen_random_uuid(),
  numero text not null,                         -- RNC-2026-0147 (via next_rnc_numero)
  empresa_id uuid not null references public.empresas on delete cascade,
  obra_id uuid not null references public.obras,
  inspecao_id uuid not null references public.inspecoes,
  resposta_item_id uuid not null references public.respostas(id) on delete cascade,
  modelo_id text not null references public.rnc_modelos(id),
  checklist_codigo text not null,               -- denormalizado (catálogo, sem FK)
  item_numero smallint not null,
  local text,
  ativo text,
  descricao_nc text not null,
  fotos jsonb not null default '[]',            -- refs do Storage (bucket evidencias)
  gravidade public.rnc_gravidade not null,
  gravidade_sugerida_agente public.rnc_gravidade,
  criticidade text,                             -- espelho p/ Marco I (via trigger)
  -- Textos das 4 seções normativas: versão do agente (auditoria) × versão final.
  secoes_agente jsonb,                          -- null = fallback sem IA
  secoes_final jsonb not null,                  -- {requisito, fundamentacao, risco, acao}
  risco_complementar text,
  acao_complementar text,
  prazo_dias smallint,
  responsavel text,
  status public.rnc_status not null default 'aberta',
  reinspecao_resultado text,
  fotos_correcao jsonb not null default '[]',
  data_fechamento timestamptz,
  created_by uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rncs_numero_empresa_uq unique (empresa_id, numero),
  constraint rncs_criticidade_chk
    check (criticidade is null or criticidade in ('baixa', 'media', 'alta', 'critica'))
);
create index if not exists idx_rncs_empresa_obra_status on public.rncs (empresa_id, obra_id, status);
create index if not exists idx_rncs_checklist_item on public.rncs (checklist_codigo, item_numero);
create index if not exists idx_rncs_resposta on public.rncs (resposta_item_id);

-- updated_at (reusa a função padrão do projeto) + espelho de criticidade.
drop trigger if exists trg_rncs_touch on public.rncs;
create trigger trg_rncs_touch
  before update on public.rncs
  for each row execute function public.tg_touch_updated_at();

create or replace function public.tg_rnc_criticidade()
returns trigger
language plpgsql
as $$
begin
  new.criticidade := public.rnc_gravidade_para_criticidade(new.gravidade);
  return new;
end;
$$;
drop trigger if exists trg_rncs_criticidade on public.rncs;
create trigger trg_rncs_criticidade
  before insert or update of gravidade on public.rncs
  for each row execute function public.tg_rnc_criticidade();

-- ============================================================
-- RLS
-- ============================================================
alter table public.rnc_modelos            enable row level security;
alter table public.rnc_modelo_checklists  enable row level security;
alter table public.rnc_secoes             enable row level security;
alter table public.rnc_textos_base        enable row level security;
alter table public.rnc_placeholders       enable row level security;
alter table public.rnc_sequencias         enable row level security;
alter table public.rncs                   enable row level security;

-- Tabelas de referência: leitura p/ qualquer autenticado; escrita só super_admin.
do $$
declare t text;
begin
  foreach t in array array[
    'rnc_modelos', 'rnc_modelo_checklists', 'rnc_secoes', 'rnc_textos_base', 'rnc_placeholders'
  ] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format(
      'create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format(
      'create policy %1$s_write on public.%1$s for all to authenticated
         using (public.eh_super_admin()) with check (public.eh_super_admin())', t);
  end loop;
end $$;

-- rnc_sequencias: sem policy → acesso direto negado; só via next_rnc_numero (definer).

-- rncs: isolamento por empresa (mesmo padrão de eventos_nc).
drop policy if exists rncs_select on public.rncs;
create policy rncs_select on public.rncs
  for select to authenticated
  using (empresa_id = public.empresa_do_usuario());

drop policy if exists rncs_insert on public.rncs;
create policy rncs_insert on public.rncs
  for insert to authenticated
  with check (empresa_id = public.empresa_do_usuario());

drop policy if exists rncs_update on public.rncs;
create policy rncs_update on public.rncs
  for update to authenticated
  using (empresa_id = public.empresa_do_usuario())
  with check (empresa_id = public.empresa_do_usuario());
