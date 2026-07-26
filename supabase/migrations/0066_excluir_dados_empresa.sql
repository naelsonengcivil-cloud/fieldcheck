-- ============================================================
-- 0066 — Entrega B: exclusão de dados a pedido (art. 18 LGPD).
--
-- ÚNICO ponto de HARD DELETE físico do sistema (todo o resto é soft delete).
-- Acionada MANUALMENTE por operador da plataforma (super_admin) via Edge
-- Function `excluir-dados-empresa` ou SQL Editor. NUNCA por cron, NUNCA pela API
-- pública, NUNCA pelo app. `p_dry_run = true` é o DEFAULT — nada apaga sem
-- `false` explícito.
--
-- Esta migration cobre só o BANCO. Storage (bucket `evidencias`/`logos`) e as
-- contas `auth.users` são removidos pela Edge Function (SQL não os alcança).
--
-- Preserva: a linha em `empresas` (fica sem conteúdo, não some), `plan_events`
-- (histórico contratual), `exclusoes_lgpd` (a trilha), e todo o catálogo de
-- plataforma (checklists/kits com empresa_id null, rnc_modelos, plan_limits...).
-- Aplicar no SQL Editor. Idempotente.
-- ============================================================

-- 1) Flag de proteção: Alpha, contas internas e de teste marcadas manualmente.
--    A função recusa exclusão de empresa protegida.
alter table public.empresas
  add column if not exists protegida boolean not null default false;

-- 2) Trilha da exclusão (SOBREVIVE à exclusão — é a prova de que o pedido foi
--    atendido). Guarda SÓ metadados/contadores, NUNCA o conteúdo apagado.
create table if not exists public.exclusoes_lgpd (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  empresa_nome text not null,
  empresa_cnpj text,                 -- empresas não tem cnpj (só contratadas); nulo salvo preenchimento manual
  motivo text not null,
  solicitado_por text,               -- quem pediu (cliente/titular), texto livre
  executado_por uuid,                -- operador que executou (auth.uid; sem FK — operador pode não ser usuario de tenant)
  executado_em timestamptz not null default now(),
  dry_run boolean not null default true,
  contadores jsonb not null,         -- {"inspecoes": 12, "evidencias": 87, ...}
  storage_removidos integer,         -- preenchido pela Edge Function
  storage_falhas integer,
  observacoes text
);

-- Sem acesso via `authenticated`/API pública. service_role ignora RLS; o SQL
-- Editor roda como postgres. A função (security definer) insere direto.
alter table public.exclusoes_lgpd enable row level security;

-- 3) Parte de BANCO da exclusão. Retorna jsonb com exclusao_id + contadores.
--    A Edge Function orquestra Storage/auth em volta desta função.
create or replace function public.excluir_dados_empresa_db(
  p_empresa_id uuid, p_motivo text, p_dry_run boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_nome  text;
  v_prot  boolean;
  v_stripe text;
  v_ate   timestamptz;
  v_c     jsonb;
  v_id    uuid;
  n_insp int; n_resp int; n_evid int; n_evt int; n_nctr int; n_ocor int;
  n_rnc int; n_rncseq int; n_alert int; n_ia int; n_notif int; n_push int;
  n_conv int; n_kit int; n_kitc int; n_ck int; n_itemck int; n_obra int;
  n_user int; n_contr int; n_audit int;
begin
  -- Gate: exige super_admin QUANDO há contexto de usuário (Edge com JWT
  -- encaminhado, ou qualquer chamada autenticada). SQL Editor (postgres) e
  -- service_role têm auth.uid() null → contexto confiável. Reforçado pelo grant
  -- abaixo (só service_role executa).
  if v_uid is not null and not public.eh_super_admin() then
    raise exception 'Apenas operadores da plataforma.' using errcode = '42501';
  end if;

  select nome, protegida, stripe_subscription_id, assinatura_ativa_ate
    into v_nome, v_prot, v_stripe, v_ate
    from public.empresas where id = p_empresa_id;

  -- Pré-condições (abortam sem apagar nada).
  if v_nome is null then
    raise exception 'Empresa não encontrada.' using errcode = 'P0002';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Motivo obrigatório.' using errcode = '22023';
  end if;
  if v_prot then
    raise exception 'Empresa protegida (interna/Alpha/teste). Exclusão recusada.' using errcode = '42501';
  end if;
  if v_stripe is not null or (v_ate is not null and v_ate > now()) then
    raise exception 'Empresa com assinatura Stripe ativa. Cancele a assinatura antes de excluir.' using errcode = '42501';
  end if;

  -- Inventário (contagem por entidade; respostas/evidencias via join — não têm empresa_id).
  select count(*) into n_insp  from public.inspecoes  where empresa_id = p_empresa_id;
  select count(*) into n_resp  from public.respostas
    where inspecao_id in (select id from public.inspecoes where empresa_id = p_empresa_id);
  select count(*) into n_evid  from public.evidencias e
    where e.resposta_id in (select id from public.respostas
            where inspecao_id in (select id from public.inspecoes where empresa_id = p_empresa_id))
       or e.evento_id     in (select id from public.eventos_nc where empresa_id = p_empresa_id)
       or e.ocorrencia_id in (select id from public.ocorrencias where empresa_id = p_empresa_id);
  select count(*) into n_evt   from public.eventos_nc     where empresa_id = p_empresa_id;
  select count(*) into n_nctr  from public.nc_transicoes  where empresa_id = p_empresa_id;
  select count(*) into n_ocor  from public.ocorrencias    where empresa_id = p_empresa_id;
  select count(*) into n_rnc   from public.rncs           where empresa_id = p_empresa_id;
  select count(*) into n_rncseq from public.rnc_sequencias where empresa_id = p_empresa_id;
  select count(*) into n_alert from public.alertas        where empresa_id = p_empresa_id;
  select count(*) into n_ia    from public.ia_uso         where empresa_id = p_empresa_id;
  select count(*) into n_notif from public.notificacoes   where empresa_id = p_empresa_id;
  select count(*) into n_push  from public.push_tokens    where empresa_id = p_empresa_id;
  select count(*) into n_conv  from public.convites       where empresa_id = p_empresa_id;
  select count(*) into n_kit   from public.kits           where empresa_id = p_empresa_id;
  select count(*) into n_kitc  from public.kit_checklists
    where kit_id in (select id from public.kits where empresa_id = p_empresa_id);
  select count(*) into n_ck    from public.checklists     where empresa_id = p_empresa_id;
  select count(*) into n_itemck from public.itens_checklist
    where checklist_id in (select id from public.checklists where empresa_id = p_empresa_id);
  select count(*) into n_obra  from public.obras          where empresa_id = p_empresa_id;
  select count(*) into n_user  from public.usuarios       where empresa_id = p_empresa_id;
  select count(*) into n_contr from public.contratadas    where empresa_id = p_empresa_id;
  select count(*) into n_audit from public.eventos_auditoria where empresa_id = p_empresa_id;

  v_c := jsonb_build_object(
    'inspecoes', n_insp, 'respostas', n_resp, 'evidencias', n_evid,
    'eventos_nc', n_evt, 'nc_transicoes', n_nctr, 'ocorrencias', n_ocor,
    'rncs', n_rnc, 'rnc_sequencias', n_rncseq, 'alertas', n_alert,
    'ia_uso', n_ia, 'notificacoes', n_notif, 'push_tokens', n_push,
    'convites', n_conv, 'kits', n_kit, 'kit_checklists', n_kitc,
    'checklists', n_ck, 'itens_checklist', n_itemck, 'obras', n_obra,
    'usuarios', n_user, 'contratadas', n_contr, 'eventos_auditoria', n_audit
  );

  -- DRY-RUN: não apaga. Grava a linha (dry_run=true) e devolve os contadores.
  if p_dry_run then
    insert into public.exclusoes_lgpd (empresa_id, empresa_nome, motivo, executado_por, dry_run, contadores)
      values (p_empresa_id, v_nome, btrim(p_motivo), v_uid, true, v_c)
      returning id into v_id;
    return jsonb_build_object('exclusao_id', v_id, 'dry_run', true, 'empresa_nome', v_nome, 'contadores', v_c);
  end if;

  -- ===================== HARD DELETE (IRREVERSÍVEL) =====================
  -- Libera a imutabilidade de respostas de inspeção finalizada (0011).
  perform set_config('fieldcheck.exclusao_admin', 'on', true);

  -- Anula as referências circulares inspecoes <-> ocorrencias (0059/0064) antes
  -- de deletar, senão o FK trava.
  update public.inspecoes  set origem_desvio_id      = null where empresa_id = p_empresa_id and origem_desvio_id is not null;
  update public.ocorrencias set promovida_inspecao_id = null where empresa_id = p_empresa_id and promovida_inspecao_id is not null;

  -- Filhos → pais (respeitando FKs; ver ordem no comentário da Entrega B).
  delete from public.evidencias e
    where e.resposta_id in (select id from public.respostas
            where inspecao_id in (select id from public.inspecoes where empresa_id = p_empresa_id))
       or e.evento_id     in (select id from public.eventos_nc where empresa_id = p_empresa_id)
       or e.ocorrencia_id in (select id from public.ocorrencias where empresa_id = p_empresa_id);
  delete from public.nc_transicoes where empresa_id = p_empresa_id;
  delete from public.rncs          where empresa_id = p_empresa_id;
  delete from public.eventos_nc    where empresa_id = p_empresa_id;
  delete from public.respostas
    where inspecao_id in (select id from public.inspecoes where empresa_id = p_empresa_id);
  delete from public.inspecoes     where empresa_id = p_empresa_id;
  delete from public.rnc_sequencias where empresa_id = p_empresa_id;
  delete from public.ocorrencias   where empresa_id = p_empresa_id;
  delete from public.alertas       where empresa_id = p_empresa_id;
  delete from public.ia_uso        where empresa_id = p_empresa_id;
  delete from public.notificacoes  where empresa_id = p_empresa_id;
  delete from public.push_tokens   where empresa_id = p_empresa_id;
  delete from public.convites      where empresa_id = p_empresa_id;
  delete from public.kit_checklists
    where kit_id in (select id from public.kits where empresa_id = p_empresa_id);
  delete from public.kits          where empresa_id = p_empresa_id;
  delete from public.itens_checklist
    where checklist_id in (select id from public.checklists where empresa_id = p_empresa_id);
  delete from public.checklists    where empresa_id = p_empresa_id;  -- nunca o catálogo (empresa_id null)
  delete from public.obras         where empresa_id = p_empresa_id;
  delete from public.eventos_auditoria where empresa_id = p_empresa_id;
  delete from public.usuarios      where empresa_id = p_empresa_id;  -- auth.users: na Edge Function
  delete from public.contratadas   where empresa_id = p_empresa_id;  -- por último (usuarios/eventos referenciam)

  -- Trilha final (dry_run=false). PRESERVADA (não é apagada acima).
  insert into public.exclusoes_lgpd (empresa_id, empresa_nome, motivo, executado_por, dry_run, contadores)
    values (p_empresa_id, v_nome, btrim(p_motivo), v_uid, false, v_c)
    returning id into v_id;

  return jsonb_build_object('exclusao_id', v_id, 'dry_run', false, 'empresa_nome', v_nome, 'contadores', v_c);
end; $$;

-- Só service_role executa (Edge com service key) ou postgres (SQL Editor).
-- NUNCA authenticated/anon → fora da API pública e do app.
revoke all on function public.excluir_dados_empresa_db(uuid, text, boolean) from public;
revoke all on function public.excluir_dados_empresa_db(uuid, text, boolean) from authenticated, anon;
grant execute on function public.excluir_dados_empresa_db(uuid, text, boolean) to service_role;
