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
| 6 | `migrations/0006_signup.sql` | **(Fase 2/M9)** Coluna `trial_expira_em` + RPC `criar_empresa_e_admin` (self-signup com trial de 14 dias). |
| 7 | `migrations/0007_convites.sql` | **(Fase 2/M10/RF14)** Tabela `convites` + RPCs `convidar_usuario`/`meu_convite_pendente`/`aceitar_convite` (convite de usuários por e-mail). |
| 8 | `migrations/0008_stripe.sql` | **(Fase 2/M11)** Campos `stripe_*` + `empresa_liberada()`. |
| 9 | `migrations/0009_liberacao.sql` | **(Fase 2/M11 Pix)** Atualiza `empresa_liberada()` p/ cartão recorrente + Pix avulso. |
| 10 | `migrations/0010_obras_status.sql` | **(Marco A/M13)** `obras.status` (em_andamento/finalizada/arquivada) no lugar de `ativa`; RLS de obras só admin. |
| 11 | `migrations/0011_auditoria.sql` | **(Marco A/M14)** `eventos_auditoria` + `inspecoes.arquivada` + RPCs `arquivar_inspecao`/`desarquivar_inspecao`/`excluir_inspecao` (admin, com log que sobrevive à exclusão). |
| 12 | `migrations/0012_nc_ciclo.sql` | **(Marco B1/M15)** Ciclo de tratamento de NC: `nc_transicoes` (histórico) + estados `tratada`/`aprovada`/`reaberta` + evidência `tratamento` + RPCs `registrar_tratamento`/`aprovar_tratamento`/`reprovar_tratamento`. |

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

## Cadastro autônomo (self-signup — M9)

A partir da migration `0006`, o app tem **cadastro público** (tela "Criar conta"):
o usuário se registra e a RPC `criar_empresa_e_admin` cria a empresa (trial 14
dias) e o vincula como admin — dispensando o `provisionar_usuario.sql`.

> Para testar sem fricção de e-mail, em **Authentication → Providers → Email**
> você pode desativar *Confirm email* (ambiente de teste). Com a confirmação
> ligada, o usuário confirma o e-mail e conclui a criação da empresa no 1º login
> (a tela "Criar sua empresa" aparece automaticamente).

## Provisionar manualmente (alternativa ao self-signup — M3)

Também é possível criar o primeiro usuário pelo painel:
**Authentication → Users → Add user**
(defina e-mail e senha, marque *Auto Confirm*). Depois, no SQL Editor:

```sql
-- 1) empresa
insert into public.empresas (nome, plano) values ('G5 Engenharia', 'ativo')
returning id;  -- copie o id

-- 2) vincule o usuário do Auth à empresa (use os ids reais)
insert into public.usuarios (id, empresa_id, nome, papel)
values ('<uuid-do-auth-user>', '<uuid-da-empresa>', 'Seu Nome', 'admin');
```
