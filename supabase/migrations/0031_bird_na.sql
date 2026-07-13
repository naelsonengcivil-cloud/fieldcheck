-- ============================================================
-- FieldCheck · Migration 0031 — Classificação ST "N/A" com justificativa (melhoria 2)
-- Itens de Segurança do Trabalho de natureza documental que não se encaixam nas
-- categorias da pirâmide (ato/condição/quase-acidente) recebem "na", que EXIGE
-- justificativa e fica FORA do cálculo/gráfico da pirâmide de Bird (mas continua
-- nos demais KPIs). Depende de 0017. Idempotente.
-- ============================================================

-- 1) Aceita 'na' na classificação da resposta.
alter table public.respostas drop constraint if exists respostas_class_st_chk;
alter table public.respostas add constraint respostas_class_st_chk
  check (classificacao_st is null
         or classificacao_st in ('ato_inseguro', 'condicao_insegura', 'quase_acidente', 'na'));

-- 2) Justificativa (obrigatória quando classificacao_st = 'na').
alter table public.respostas add column if not exists classificacao_st_justificativa text;

-- 3) Trigger: mantém a obrigatoriedade de classificar NC de ST e passa a exigir
--    justificativa sempre que a classificação for 'na'.
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
      raise exception 'NC de checklist de Segurança do Trabalho exige classificação (ato inseguro / condição insegura / quase acidente / N/A).'
        using errcode = '23514';
    end if;
  end if;

  -- N/A sem justificativa não salva.
  if new.classificacao_st = 'na'
     and nullif(btrim(coalesce(new.classificacao_st_justificativa, '')), '') is null then
    raise exception 'A classificação "N/A" exige justificativa.' using errcode = '23514';
  end if;

  return new;
end; $$;
-- (o trigger trg_resposta_class_st da 0017 já aponta para esta função)
