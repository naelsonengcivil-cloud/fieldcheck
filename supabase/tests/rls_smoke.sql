-- ============================================================
-- FieldCheck · Teste de fumaça de RLS (critério de aceite #5)
-- Autocontido: cria 2 empresas + 1 usuário cada, popula inspeções,
-- e prova que um usuário NÃO enxerga dados da outra empresa.
-- Roda inteiro dentro de uma transação e faz ROLLBACK no fim:
-- nada é persistido, nenhum e-mail é enviado.
--
-- Como usar: cole no SQL Editor do Supabase e clique em Run.
-- Todas as linhas de resultado devem mostrar ok = true.
-- ============================================================
begin;

-- UUIDs fixos para o teste
-- empresa A = aaaaaaaa..., usuário A = 11111111...
-- empresa B = bbbbbbbb..., usuário B = 22222222...

-- ---- usuários de teste em auth.users (desfeitos no rollback) ----
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'a@teste.local', crypt('senha123', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'b@teste.local', crypt('senha123', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email"}', '{}');

-- ---- empresas ----
insert into public.empresas (id, nome, plano) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Empresa A', 'ativo'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Empresa B', 'ativo');

-- ---- usuarios ----
insert into public.usuarios (id, empresa_id, nome, papel) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ana (A)', 'gestor'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bruno (B)', 'gestor');

-- ---- obras ----
insert into public.obras (id, empresa_id, nome) values
  ('a0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Obra A1'),
  ('b0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Obra B1');

-- ---- um checklist padrão + item (empresa_id null) ----
insert into public.checklists (id, empresa_id, codigo, area, nome)
values ('c0000000-0000-0000-0000-0000000000c1', null, 'ST-01', 'Segurança do Trabalho', 'Teste');
insert into public.itens_checklist (id, checklist_id, ordem, texto)
values ('d0000000-0000-0000-0000-0000000000d1', 'c0000000-0000-0000-0000-0000000000c1', 1, 'Item teste');

-- ---- inspeções (1 por empresa) ----
insert into public.inspecoes (id, empresa_id, obra_id, checklist_id, inspetor_id, iniciada_em, status)
values
  ('e0000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000c1',
   '11111111-1111-1111-1111-111111111111', now(), 'finalizada'),
  ('e0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'b0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000c1',
   '22222222-2222-2222-2222-222222222222', now(), 'finalizada');

-- ============================================================
-- Simula o usuário A (empresa A)
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select 'A vê só a própria empresa' as teste,
       (select count(*) from public.empresas) = 1 as ok;
select 'A vê só as próprias inspeções' as teste,
       (select count(*) from public.inspecoes) = 1
       and (select empresa_id from public.inspecoes limit 1)
           = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as ok;
select 'A NÃO vê obras da empresa B' as teste,
       not exists (select 1 from public.obras
                   where empresa_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as ok;
select 'A vê o catálogo padrão (checklist empresa_id null)' as teste,
       exists (select 1 from public.checklists where empresa_id is null) as ok;

-- ============================================================
-- Simula o usuário B (empresa B)
-- ============================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select 'B vê só as próprias inspeções' as teste,
       (select count(*) from public.inspecoes) = 1
       and (select empresa_id from public.inspecoes limit 1)
           = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' as ok;
select 'B NÃO vê inspeções da empresa A' as teste,
       not exists (select 1 from public.inspecoes
                   where empresa_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') as ok;

reset role;
rollback;  -- desfaz TUDO: nada persiste
