-- ============================================================
-- 0055 — Monetização Onda 1, Frente 2 (parte 2/4): ENFORCEMENT.
-- Limites por plano (obras/usuários/checklists) + modo READONLY.
--
-- SEGURANÇA DA ORDEM (ponto crítico #3): como `plano_vigente()` mapeia
-- trial/ativo → 'intelligence' (limites null = ilimitado), aplicar esta
-- migração ANTES da migração das contas (0056) NÃO bloqueia ninguém — contas
-- existentes seguem como Intelligence até a migração formal.
--
-- Erro estruturado: as violações levantam exceção com HINT 'upgrade:<recurso>'
-- e ERRCODE 'P0001' → o frontend converte em modal/CTA de upgrade.
-- Retenção por visibilidade: tratada à parte (parte 2b) — NUNCA deletar dado.
-- Depende de 0054. Idempotente.
-- ============================================================

-- Helper: levanta erro de limite de forma padronizada (o front lê o hint).
create or replace function public._erro_limite(p_recurso text, p_limite int)
returns void language plpgsql as $$
begin
  raise exception 'Limite do plano atingido para % (máximo %). Faça upgrade para continuar.', p_recurso, p_limite
    using errcode = 'P0001', hint = 'upgrade:' || p_recurso;
end; $$;

-- Helper: a conta está em modo somente-leitura (readonly/archived)?
create or replace function public._conta_readonly(p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.plano_vigente(p_empresa) in ('readonly', 'archived');
$$;

-- ---------- Limite de OBRAS ativas ----------
create or replace function public.tg_limite_obras()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int; v_atual int;
begin
  v_lim := public.limite_de('obras', new.empresa_id);
  if v_lim is null then return new; end if;           -- ilimitado
  if v_lim <= 0 then perform public._erro_limite('obras', 0); end if;  -- readonly/archived
  select count(*) into v_atual from public.obras
   where empresa_id = new.empresa_id and coalesce(status, 'em_andamento') <> 'arquivada';
  if v_atual >= v_lim then perform public._erro_limite('obras', v_lim); end if;
  return new;
end; $$;
drop trigger if exists trg_limite_obras on public.obras;
create trigger trg_limite_obras before insert on public.obras
  for each row execute function public.tg_limite_obras();

-- ---------- Limite de USUÁRIOS (ativos + convites pendentes) ----------
-- Gate no ponto do convite: ao convidar, projeta usuários + convites pendentes.
create or replace function public.tg_limite_convites()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int; v_usuarios int; v_pendentes int;
begin
  v_lim := public.limite_de('usuarios', new.empresa_id);
  if v_lim is null then return new; end if;           -- ilimitado (Intelligence sem seats)
  if v_lim <= 0 then perform public._erro_limite('usuarios', 0); end if;
  select count(*) into v_usuarios from public.usuarios where empresa_id = new.empresa_id and ativo;
  select count(*) into v_pendentes from public.convites where empresa_id = new.empresa_id and status = 'pendente';
  if (v_usuarios + v_pendentes) >= v_lim then perform public._erro_limite('usuarios', v_lim); end if;
  return new;
end; $$;
drop trigger if exists trg_limite_convites on public.convites;
create trigger trg_limite_convites before insert on public.convites
  for each row execute function public.tg_limite_convites();

-- ---------- Limite de CHECKLISTS PERSONALIZADOS (empresa_id não nulo) ----------
create or replace function public.tg_limite_checklists()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int; v_atual int;
begin
  if new.empresa_id is null then return new; end if;  -- catálogo padrão não conta
  v_lim := public.limite_de('checklists', new.empresa_id);
  if v_lim is null then return new; end if;
  if v_lim <= 0 then perform public._erro_limite('checklists', 0); end if;
  select count(*) into v_atual from public.checklists
   where empresa_id = new.empresa_id and coalesce(ativo, true);
  if v_atual >= v_lim then perform public._erro_limite('checklists', v_lim); end if;
  return new;
end; $$;
drop trigger if exists trg_limite_checklists on public.checklists;
create trigger trg_limite_checklists before insert on public.checklists
  for each row execute function public.tg_limite_checklists();

-- ---------- Modo READONLY: bloqueia escrita nas tabelas operacionais ----------
-- SELECT continua liberado (não mexemos nas policies de leitura → dado gerado
-- permanece legível, conforme a exceção sagrada). Só INSERT/UPDATE/DELETE.
create or replace function public.tg_bloqueia_readonly()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  v_emp := coalesce(
    case when tg_op = 'DELETE' then null else new.empresa_id end,
    case when tg_op = 'INSERT' then null else old.empresa_id end
  );
  if v_emp is not null and public._conta_readonly(v_emp) then
    raise exception 'Conta em modo somente-leitura — reative a assinatura para editar.'
      using errcode = 'P0001', hint = 'reativar';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

-- Anexa o bloqueio às tabelas operacionais com empresa_id.
do $$
declare t text;
begin
  foreach t in array array['inspecoes','obras','ocorrencias','eventos_nc','convites','checklists','contratadas']
  loop
    execute format('drop trigger if exists trg_readonly on public.%I', t);
    execute format(
      'create trigger trg_readonly before insert or update or delete on public.%I
         for each row execute function public.tg_bloqueia_readonly()', t);
  end loop;
end $$;
