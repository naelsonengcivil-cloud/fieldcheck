-- ============================================================
-- 0050 — Melhoria de campo A: data/hora da inspeção editável (registro retroativo).
-- Distingue DOIS carimbos, nenhum sobrescrito (diretriz de dados):
--   data_inspecao  = data/hora INFORMADA da inspeção (editável na criação, <= agora);
--   registrado_em  = carimbo de REGISTRO no sistema, AUTOMÁTICO e IMUTÁVEL
--                    (default now() no servidor; NÃO enviado pelo app → à prova de forja).
-- finalizada_em permanece como está. Ambos os novos carimbos ficam imutáveis após
-- a finalização (blindados no trigger, DEPOIS do backfill). Idempotente.
-- ============================================================

-- 1) Colunas novas.
alter table public.inspecoes add column if not exists data_inspecao timestamptz;
alter table public.inspecoes add column if not exists registrado_em timestamptz;
alter table public.inspecoes alter column registrado_em set default now();

-- 2) Backfill (antes de blindar no trigger): inspeções antigas não são retroativas,
--    então data_inspecao e registrado_em = finalizada_em (ou iniciada_em).
update public.inspecoes
   set data_inspecao = coalesce(data_inspecao, finalizada_em, iniciada_em),
       registrado_em = coalesce(registrado_em, finalizada_em, iniciada_em)
 where data_inspecao is null or registrado_em is null;

create index if not exists idx_inspecoes_data on public.inspecoes (empresa_id, data_inspecao);

-- 3) Imutabilidade: blindar os carimbos de auditoria junto dos demais campos
--    (o upsert idempotente reafirma os mesmos valores → permitido).
create or replace function public.tg_inspecao_imutavel()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'finalizada' then
    if new.status is distinct from old.status
       or new.checklist_id is distinct from old.checklist_id
       or new.obra_id is distinct from old.obra_id
       or new.inspetor_id is distinct from old.inspetor_id
       or new.finalizada_em is distinct from old.finalizada_em
       or new.data_inspecao is distinct from old.data_inspecao
       or new.registrado_em is distinct from old.registrado_em then
      raise exception 'Inspeção finalizada é imutável (id=%).', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
