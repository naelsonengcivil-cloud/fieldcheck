-- ============================================================
-- FieldCheck · Migration 0028 — Aviso de prazo de NC (RF12, M5)
-- Função diária que notifica NCs abertas com prazo próximo (vence hoje/amanhã)
-- ou vencido. Insere em `notificacoes` → o trigger 0027 dispara o push. A
-- deduplicação por (evento, tipo, usuário) evita repetir o mesmo aviso todo
-- dia: cada NC gera 1 aviso "próximo" e 1 "vencido" no seu ciclo.
-- Depende de 0015/0026/0027. Idempotente.
--
-- AGENDAMENTO (SQL Editor, ver docs/push-firebase-setup.md):
--   select cron.schedule('fieldcheck-prazos-nc', '0 11 * * *',  -- 08:00 BRT
--                        $$ select public.notificar_prazos(); $$);
-- ============================================================

create or replace function public.notificar_prazos()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prox integer := 0;
  v_venc integer := 0;
begin
  -- 1) Prazo PRÓXIMO (vence hoje ou amanhã) → avisa a executora responsável.
  with alvo as (
    select e.id as evento_id, e.empresa_id, e.contratada_id, e.prazo,
           o.nome as obra, coalesce(it.texto, r.observacao, 'NC') as item
    from public.eventos_nc e
    join public.respostas r on r.id = e.resposta_id
    join public.inspecoes insp on insp.id = r.inspecao_id
    join public.obras o on o.id = insp.obra_id
    left join public.itens_checklist it on it.id = r.item_id
    where e.status in ('aberto', 'em_andamento', 'reaberta')
      and e.contratada_id is not null
      and e.prazo is not null
      and e.prazo between v_hoje and v_hoje + 1
  )
  insert into public.notificacoes (empresa_id, usuario_id, tipo, titulo, corpo, evento_id)
  select a.empresa_id, u.id, 'nc_prazo_proximo',
         'NC com prazo próximo',
         a.obra || ': ' || left(a.item, 100) || ' — vence ' || to_char(a.prazo, 'DD/MM'),
         a.evento_id
  from alvo a
  join public.usuarios u
    on u.empresa_id = a.empresa_id and u.ativo
   and u.papel = 'executora' and u.contratada_id = a.contratada_id
  where not exists (
    select 1 from public.notificacoes n
    where n.evento_id = a.evento_id and n.tipo = 'nc_prazo_proximo' and n.usuario_id = u.id
  );
  get diagnostics v_prox = row_count;

  -- 2) Prazo VENCIDO → avisa a executora responsável + gestores/admins (escalada).
  with alvo as (
    select e.id as evento_id, e.empresa_id, e.contratada_id, e.prazo,
           o.nome as obra, coalesce(it.texto, r.observacao, 'NC') as item
    from public.eventos_nc e
    join public.respostas r on r.id = e.resposta_id
    join public.inspecoes insp on insp.id = r.inspecao_id
    join public.obras o on o.id = insp.obra_id
    left join public.itens_checklist it on it.id = r.item_id
    where e.status in ('aberto', 'em_andamento', 'reaberta')
      and e.prazo is not null
      and e.prazo < v_hoje
  )
  insert into public.notificacoes (empresa_id, usuario_id, tipo, titulo, corpo, evento_id)
  select a.empresa_id, u.id, 'nc_prazo_vencido',
         'NC com prazo vencido',
         a.obra || ': ' || left(a.item, 100) || ' — venceu ' || to_char(a.prazo, 'DD/MM'),
         a.evento_id
  from alvo a
  join public.usuarios u
    on u.empresa_id = a.empresa_id and u.ativo
   and (
     (u.papel = 'executora' and u.contratada_id = a.contratada_id)
     or u.papel in ('gestor', 'admin')
   )
  where not exists (
    select 1 from public.notificacoes n
    where n.evento_id = a.evento_id and n.tipo = 'nc_prazo_vencido' and n.usuario_id = u.id
  );
  get diagnostics v_venc = row_count;

  return v_prox + v_venc;
end; $$;

grant execute on function public.notificar_prazos() to service_role;
