-- ============================================================
-- 0064 — Marco M (Fase 3a): promoção de desvio avulso a NC.
--
-- Abordagem: inspeção SINTÉTICA de 1 item carrega a NC (evento_nc é 1:1 com
-- respostas; resposta exige inspecao+item). Reaproveita toda a maquinaria de
-- NC (tratamento, aprovação, prazos, RNC, RLS, views) sem alterá-la.
--   • checklist de sistema "Desvio de campo" (empresa_id null) + 1 item;
--   • inspecoes.origem_desvio_id → trilha da inspeção sintética ao desvio;
--   • trigger copia as fotos do desvio para a resposta da NC (server-side,
--     robusto para fotos já no Storage). A resposta nasce com classificacao_st
--     NULL (o desvio segue como único ponto da base da Pirâmide de Bird).
-- ============================================================

-- 1) Checklist de sistema carregador + item genérico.
insert into public.checklists (codigo, area, nome, versao, ativo, modulo, tipo)
select 'DESVIO-CAMPO', 'Segurança do Trabalho', 'Desvio de campo (promovido)', 1, true, 'transversal', 'seguranca_nr'
where not exists (select 1 from public.checklists where codigo = 'DESVIO-CAMPO' and empresa_id is null);

insert into public.itens_checklist (checklist_id, ordem, texto, criterio)
select c.id, 1, 'Desvio registrado em campo', 'Desvio observado e promovido a não conformidade para tratamento.'
from public.checklists c
where c.codigo = 'DESVIO-CAMPO' and c.empresa_id is null
  and not exists (select 1 from public.itens_checklist i where i.checklist_id = c.id);

-- 2) Trilha reversa: inspeção sintética → desvio de origem.
alter table public.inspecoes
  add column if not exists origem_desvio_id uuid references public.ocorrencias;
create index if not exists idx_inspecoes_origem_desvio on public.inspecoes (origem_desvio_id);

-- 3) Ao inserir a resposta da NC promovida, copia as fotos do desvio de origem
--    para a resposta (reusa o mesmo arquivo no Storage — sem re-upload).
create or replace function public.copiar_fotos_desvio_promovido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_desvio uuid;
begin
  select origem_desvio_id into v_desvio from public.inspecoes where id = new.inspecao_id;
  if v_desvio is not null then
    insert into public.evidencias (id, resposta_id, tipo, url, lat, lng, capturada_em)
    select gen_random_uuid(), new.id, 'abertura', ev.url, ev.lat, ev.lng, ev.capturada_em
    from public.evidencias ev
    where ev.ocorrencia_id = v_desvio and ev.url is not null;
  end if;
  return new;
end; $$;

drop trigger if exists tg_copiar_fotos_desvio on public.respostas;
create trigger tg_copiar_fotos_desvio
  after insert on public.respostas
  for each row execute function public.copiar_fotos_desvio_promovido();
