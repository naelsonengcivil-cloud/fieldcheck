-- ============================================================
-- FieldCheck · Provisionar a 1ª empresa + vincular o usuário do Auth
-- Rode no SQL Editor DEPOIS de aplicar as migrations 0001–0005.
-- Idempotente. Ajuste nome da empresa / do usuário se quiser.
-- ============================================================

-- 1) Empresa (cria só se ainda não existir)
insert into public.empresas (nome, plano)
select 'G5 Engenharia', 'ativo'
where not exists (select 1 from public.empresas where nome = 'G5 Engenharia');

-- 2) Vincula o usuário do Auth (por e-mail) à empresa como admin
insert into public.usuarios (id, empresa_id, nome, papel)
select u.id, e.id, 'Naelson', 'admin'
from auth.users u
cross join lateral (
  select id from public.empresas where nome = 'G5 Engenharia' limit 1
) e
where u.email = 'naelson.engcivil@gmail.com'
on conflict (id) do update
  set empresa_id = excluded.empresa_id,
      nome = excluded.nome,
      papel = excluded.papel,
      ativo = true;

-- 3) Uma obra inicial (para conseguir abrir inspeções no app — M5)
insert into public.obras (empresa_id, nome, cliente)
select e.id, 'UFV Diamantina I', 'Cliente Exemplo'
from public.empresas e
where e.nome = 'G5 Engenharia'
  and not exists (
    select 1 from public.obras o
    where o.empresa_id = e.id and o.nome = 'UFV Diamantina I'
  );

-- Conferência:
select 'usuario' tipo, nome, papel from public.usuarios
union all select 'empresa', nome, plano from public.empresas
union all select 'obra', nome, coalesce(cliente,'') from public.obras;
