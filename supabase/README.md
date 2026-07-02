# Supabase — schema, RLS e seed (FieldCheck)

As migrations são aplicadas **manualmente pelo SQL Editor** do painel Supabase
(Project → SQL Editor → New query → colar → Run). Aplique **na ordem**:

| Ordem | Arquivo | O que faz |
|------:|---------|-----------|
| 1 | `migrations/0001_schema.sql` | Cria todas as tabelas da §4 (+ índices, checks). Idempotente. |
| 2 | `migrations/0002_triggers.sql` | `updated_at` de `eventos_nc` (LWW §7.3) e imutabilidade de inspeção/respostas finalizadas. |
| 3 | `migrations/0003_rls.sql` | Habilita RLS e cria as políticas de isolamento por empresa. |
| 4 | `migrations/0004_storage.sql` | Bucket privado `evidencias` + políticas de storage por empresa. |
| 5 | `migrations/0005_seed_catalogo.sql` | Catálogo padrão vindo da planilha (`empresa_id = null`): 27 checklists / 263 itens. |

Cada arquivo é idempotente/reexecutável (`create ... if not exists`,
`create or replace`, `drop policy if exists`, seed com `on conflict (id) do update`).

O `0005_seed_catalogo.sql` é **gerado** de `Programa_Inspecoes_Canteiro.xlsx`
por `npm run gen:seed` (não editar à mão). Após aplicá-lo, confira:

```sql
select count(*) as checklists from public.checklists where empresa_id is null;   -- 27
select count(*) as itens from public.itens_checklist i
  join public.checklists c on c.id = i.checklist_id where c.empresa_id is null;   -- 263
select codigo, nome, (select count(*) from public.itens_checklist i where i.checklist_id = c.id) itens
  from public.checklists c where empresa_id is null order by codigo;
```

## Validar o isolamento multi-tenant (critério de aceite #5)

`tests/rls_smoke.sql` é **autocontido e não deixa resíduo** (roda dentro de uma
transação com `ROLLBACK` no fim). Cole no SQL Editor e execute: ele cria duas
empresas com um usuário cada, popula inspeções e prova que um usuário **não
enxerga** os dados da outra empresa. As linhas de resultado devem mostrar
`ok = true` em todas as asserções.

> Observação: o teste insere usuários de teste em `auth.users` apenas dentro da
> transação e desfaz tudo ao final — nada é persistido e nenhum e-mail é enviado.

## Provisionar a primeira empresa/usuário real (para o login — M3)

Como a criação de usuários é por convite/admin (não há signup público),
crie o primeiro usuário pelo painel: **Authentication → Users → Add user**
(defina e-mail e senha, marque *Auto Confirm*). Depois, no SQL Editor:

```sql
-- 1) empresa
insert into public.empresas (nome, plano) values ('G5 Engenharia', 'ativo')
returning id;  -- copie o id

-- 2) vincule o usuário do Auth à empresa (use os ids reais)
insert into public.usuarios (id, empresa_id, nome, papel)
values ('<uuid-do-auth-user>', '<uuid-da-empresa>', 'Seu Nome', 'admin');
```
