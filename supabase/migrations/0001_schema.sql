-- ============================================================
-- FieldCheck · Migration 0001 — Schema (ESPECIFICACAO.md §4)
-- Multi-tenant: toda tabela de negócio tem empresa_id; o RLS
-- (migration 0003) filtra por empresa do usuário autenticado.
-- Idempotente: seguro reexecutar (create table if not exists).
-- ============================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------- empresas ----------
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  plano text not null default 'trial',        -- trial | ativo | suspenso
  criado_em timestamptz not null default now()
);

-- ---------- usuarios (espelho de auth.users) ----------
create table if not exists public.usuarios (
  id uuid primary key references auth.users on delete cascade,
  empresa_id uuid not null references public.empresas,
  nome text not null,
  papel text not null default 'inspetor',     -- inspetor | gestor | admin
  ativo boolean not null default true,
  constraint usuarios_papel_chk check (papel in ('inspetor', 'gestor', 'admin'))
);
create index if not exists idx_usuarios_empresa on public.usuarios (empresa_id);

-- ---------- obras ----------
create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas,
  nome text not null,                          -- ex.: UFV Diamantina I
  cliente text,
  ativa boolean not null default true
);
create index if not exists idx_obras_empresa on public.obras (empresa_id);

-- ---------- checklists (catálogo versionado) ----------
-- empresa_id null = catálogo padrão do sistema (seed da planilha, M2).
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas,
  codigo text not null,                        -- ST-01, MA-01...
  area text not null,                          -- Segurança do Trabalho...
  referencia text,                             -- NR-01 – Gerenciamento de Riscos
  nome text not null,
  versao int not null default 1,
  ativo boolean not null default true
);
create index if not exists idx_checklists_empresa on public.checklists (empresa_id);

-- ---------- itens_checklist ----------
create table if not exists public.itens_checklist (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists on delete cascade,
  ordem int not null,
  texto text not null,                         -- APR disponível na frente de serviço
  criterio text                                -- o que verificar
);
create index if not exists idx_itens_checklist on public.itens_checklist (checklist_id, ordem);

-- ---------- inspecoes ----------
create table if not exists public.inspecoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas,
  obra_id uuid not null references public.obras,
  checklist_id uuid not null references public.checklists,
  inspetor_id uuid not null references public.usuarios,
  frente text,                                 -- frente de serviço dentro da obra
  contratada text,                             -- empresa executante inspecionada
  iniciada_em timestamptz not null,
  finalizada_em timestamptz,
  lat numeric, lng numeric,                    -- geolocalização
  status text not null default 'finalizada',   -- rascunho | finalizada
  origem_offline boolean not null default false,
  constraint inspecoes_status_chk check (status in ('rascunho', 'finalizada'))
);
create index if not exists idx_inspecoes_empresa on public.inspecoes (empresa_id);
create index if not exists idx_inspecoes_obra on public.inspecoes (obra_id);
create index if not exists idx_inspecoes_checklist on public.inspecoes (checklist_id);
create index if not exists idx_inspecoes_inspetor on public.inspecoes (inspetor_id);

-- ---------- respostas ----------
create table if not exists public.respostas (
  id uuid primary key default gen_random_uuid(),
  inspecao_id uuid not null references public.inspecoes on delete cascade,
  item_id uuid not null references public.itens_checklist,
  resposta text not null,                      -- C | NC | NA
  observacao text,
  criado_em timestamptz not null default now(),
  constraint respostas_resposta_chk check (resposta in ('C', 'NC', 'NA')),
  -- NC exige observação (RF04/RF05); reforço no banco além da validação no app.
  constraint respostas_nc_obs_chk
    check (resposta <> 'NC' or (observacao is not null and length(btrim(observacao)) > 0))
);
create index if not exists idx_respostas_inspecao on public.respostas (inspecao_id);
create unique index if not exists uq_respostas_inspecao_item on public.respostas (inspecao_id, item_id);

-- ---------- eventos_nc (1:1 com resposta NC; ciclo de tratamento) ----------
-- updated_at existe para o last-write-wins da sincronização (§7.3).
create table if not exists public.eventos_nc (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid not null unique references public.respostas on delete cascade,
  empresa_id uuid not null references public.empresas,
  obra_id uuid not null references public.obras,
  responsavel text,
  prazo date,
  status text not null default 'aberto',       -- aberto | em_andamento | fechado
  tratamento text,                             -- descrição da correção
  fechado_em timestamptz,
  fechado_por uuid references public.usuarios,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eventos_nc_status_chk check (status in ('aberto', 'em_andamento', 'fechado'))
);
create index if not exists idx_eventos_empresa on public.eventos_nc (empresa_id);
create index if not exists idx_eventos_obra on public.eventos_nc (obra_id);
create index if not exists idx_eventos_status on public.eventos_nc (status);

-- ---------- evidencias ----------
create table if not exists public.evidencias (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid references public.respostas on delete cascade,
  evento_id uuid references public.eventos_nc on delete cascade,
  tipo text not null,                          -- abertura | fechamento
  url text not null,                           -- caminho no Supabase Storage
  lat numeric, lng numeric,
  capturada_em timestamptz not null default now(),
  constraint evidencias_tipo_chk check (tipo in ('abertura', 'fechamento')),
  constraint evidencias_vinculo_chk check (resposta_id is not null or evento_id is not null)
);
create index if not exists idx_evidencias_resposta on public.evidencias (resposta_id);
create index if not exists idx_evidencias_evento on public.evidencias (evento_id);
