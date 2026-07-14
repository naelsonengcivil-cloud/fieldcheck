-- ============================================================
-- 0036 — Contador de uso de IA por empresa (Marco K, K1).
-- Registra cada chamada de IA (hoje: rnc-generate) para custeio/precificação
-- futura do add-on premium. Escrita apenas pela Edge Function (service role);
-- leitura restrita a admin/gestor da própria empresa (dashboard futuro).
-- ============================================================

create table if not exists public.ia_uso (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  funcao        text not null,                 -- ex.: 'rnc-generate'
  modelo        text,                          -- ex.: 'claude-sonnet-4-6'
  tokens_in     integer not null default 0,
  tokens_out    integer not null default 0,
  custo_est_usd numeric(10,5) not null default 0,
  sucesso       boolean not null default true, -- IA respondeu (true) ou caiu no fallback (false)
  created_by    uuid references public.usuarios(id),
  criado_em     timestamptz not null default now()
);

create index if not exists ia_uso_empresa_idx on public.ia_uso (empresa_id, criado_em desc);

alter table public.ia_uso enable row level security;

-- Leitura: admin/gestor da própria empresa. Sem policy de INSERT/UPDATE/DELETE →
-- só o service role (Edge Function) escreve; o cliente nunca grava métrica.
drop policy if exists ia_uso_select on public.ia_uso;
create policy ia_uso_select on public.ia_uso
  for select
  using (
    empresa_id = public.empresa_do_usuario()
    and public.papel_do_usuario() in ('admin', 'gestor')
  );
