-- ============================================================
-- FieldCheck · Migration 0002 — Funções e triggers
--  - manter eventos_nc.updated_at para o last-write-wins (§7.3)
--  - imutabilidade de inspeção finalizada (§4 regras / §7.3)
-- ============================================================

-- ---------- updated_at automático em eventos_nc ----------
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_eventos_nc_touch on public.eventos_nc;
create trigger trg_eventos_nc_touch
  before update on public.eventos_nc
  for each row
  execute function public.tg_touch_updated_at();

-- ---------- imutabilidade da inspeção finalizada ----------
-- Uma inspeção 'finalizada' não pode voltar a 'rascunho' nem ter seus
-- campos de execução alterados. O RLS já bloqueia UPDATE de finalizada
-- pelo cliente; este trigger é a rede de segurança no nível do banco
-- (vale inclusive para o service_role, exceto quando explicitamente
-- desabilitado numa migração de manutenção).
create or replace function public.tg_inspecao_imutavel()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'finalizada' then
    -- Permite apenas reafirmar os mesmos valores (upsert idempotente §7.3);
    -- qualquer mudança de conteúdo é rejeitada.
    if new.status is distinct from old.status
       or new.checklist_id is distinct from old.checklist_id
       or new.obra_id is distinct from old.obra_id
       or new.inspetor_id is distinct from old.inspetor_id
       or new.finalizada_em is distinct from old.finalizada_em then
      raise exception 'Inspeção finalizada é imutável (id=%).', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inspecoes_imutavel on public.inspecoes;
create trigger trg_inspecoes_imutavel
  before update on public.inspecoes
  for each row
  execute function public.tg_inspecao_imutavel();

-- ---------- respostas de inspeção finalizada são imutáveis ----------
create or replace function public.tg_resposta_imutavel()
returns trigger
language plpgsql
as $$
declare
  st text;
  insp uuid;
begin
  insp := coalesce(new.inspecao_id, old.inspecao_id);
  select status into st from public.inspecoes where id = insp;
  if st = 'finalizada' and (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    raise exception 'Respostas de inspeção finalizada são imutáveis (inspecao=%).', insp
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_respostas_imutavel on public.respostas;
create trigger trg_respostas_imutavel
  before update or delete on public.respostas
  for each row
  execute function public.tg_resposta_imutavel();
