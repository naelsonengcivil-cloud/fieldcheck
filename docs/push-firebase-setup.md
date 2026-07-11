# RF12 — Notificações push (Firebase/FCM) · setup passo a passo

Notificações push de NC (**atribuída, prazo próximo/vencido, tratamento
aprovado/reprovado**) no **Android (APK)** e no **navegador (web push)**. Hoje o
app já tem o sino in-app; este guia liga o push "de verdade" no celular.

O **código está 100% pronto** no repositório. Falta a **sua parte**: montar o
projeto Firebase, colar 3 conjuntos de credenciais e aplicar 3 migrações. Siga na
ordem — cada passo diz exatamente onde colar o quê.

## Como as peças se encaixam

```mermaid
flowchart LR
  NC[Ciclo de NC / job de prazos] -->|insere| N[(notificacoes)]
  N -->|trigger 0027 + pg_net| F[Edge Function<br/>enviar-push]
  F -->|OAuth2 service account| G[FCM HTTP v1]
  G --> A[📱 Android APK]
  G --> W[🌐 Navegador web push]
  P[push_tokens] -.tokens dos usuários.-> F
```

- **Web push**: config pública do Firebase no `.env` (`VITE_FIREBASE_*`) + chave VAPID.
- **Android**: `google-services.json` embutido no APK (não usa o `.env`).
- **Envio (servidor)**: credenciais do **service account** nos secrets da Edge Function.

---

## Parte 1 — Criar o projeto no Firebase (uma vez)

1. Acesse <https://console.firebase.google.com> → **Adicionar projeto** →
   nome ex.: `FieldCheck` → pode **desativar** o Google Analytics → **Criar**.

## Parte 2 — App Android (para o APK)

1. No projeto, clique no ícone **Android** ("Adicionar app").
2. **Nome do pacote Android**: `com.alphainspecoes.fieldcheck`
   *(tem de bater exatamente com o `appId` do `capacitor.config.ts`).*
3. Apelido e SHA-1: **pule** por enquanto → **Registrar app**.
4. **Baixe o `google-services.json`** e guarde — ele vai para `android/app/`
   quando você gerar o projeto nativo (Parte 8).
5. Nos passos de SDK que o Firebase mostra, **pule** (o Capacitor já cuida) →
   **Continuar no console**.

## Parte 3 — App Web (para o web push) + chave VAPID

1. No projeto, **Adicionar app** → ícone **Web** (`</>`).
2. Apelido ex.: `FieldCheck Web` → **não** marque Firebase Hosting → **Registrar**.
3. O Firebase mostra o objeto `firebaseConfig`. Copie os valores para o seu `.env`
   (raiz do projeto — veja `.env.example`):

   | Firebase config       | Variável no `.env`                  |
   |-----------------------|-------------------------------------|
   | `apiKey`              | `VITE_FIREBASE_API_KEY`             |
   | `authDomain`          | `VITE_FIREBASE_AUTH_DOMAIN`        |
   | `projectId`           | `VITE_FIREBASE_PROJECT_ID`         |
   | `messagingSenderId`   | `VITE_FIREBASE_MESSAGING_SENDER_ID`|
   | `appId`               | `VITE_FIREBASE_APP_ID`             |

4. **Chave VAPID** (web push): **Configurações do projeto** (engrenagem) →
   aba **Cloud Messaging** → seção **Web Push certificates** → **Generate key pair**.
   Copie a chave gerada para `VITE_FIREBASE_VAPID_KEY`.
5. Esses valores são **públicos** (vão para todo navegador) — pode colocar também
   nas **Environment Variables** da Vercel (mesmo nomes) para o web push valer em produção.

## Parte 4 — Service account (para o servidor enviar)

1. **Configurações do projeto** → aba **Contas de serviço** →
   **Gerar nova chave privada** → confirma → baixa um **JSON**.
2. Abra o JSON. Você vai usar 3 campos:
   - `project_id`   → secret `FCM_PROJECT_ID`
   - `client_email` → secret `FCM_CLIENT_EMAIL`
   - `private_key`  → secret `FCM_PRIVATE_KEY` (a string longa que começa com
     `-----BEGIN PRIVATE KEY-----`; mantenha as quebras de linha `\n`).
3. **Guarde esse JSON com segurança — nunca commite.**

---

## Parte 5 — Aplicar as migrações (SQL Editor ou script)

Aplique **na ordem**: `0026`, `0027`, `0028`. Pelo script:

```bash
node scripts/apply-migration.js supabase/migrations/0026_push_tokens.sql
node scripts/apply-migration.js supabase/migrations/0027_push_trigger.sql
node scripts/apply-migration.js supabase/migrations/0028_prazos_job.sql
```

ou cole o conteúdo de cada uma no **SQL Editor** do Supabase e rode.
(As extensões `pg_net`/`pg_cron` vêm da `0025` — aplique-a antes se ainda não aplicou.)

## Parte 6 — Deploy da Edge Function + secrets

```bash
# Segredos da função (o CRON_SECRET pode ser qualquer string forte que você inventar):
supabase secrets set \
  FCM_PROJECT_ID="seu-project-id" \
  FCM_CLIENT_EMAIL="firebase-adminsdk-xxx@seu-projeto.iam.gserviceaccount.com" \
  CRON_SECRET="uma-string-secreta-forte"

# A private_key tem quebras de linha — o jeito mais seguro é a partir de um arquivo:
supabase secrets set FCM_PRIVATE_KEY="$(cat caminho/para/serviceAccount.json | python -c 'import sys,json;print(json.load(sys.stdin)["private_key"])')"

# Deploy (sem verify_jwt: a função se protege pelo x-cron-secret):
supabase functions deploy enviar-push --no-verify-jwt
```

> Dica Windows/PowerShell: se o comando acima do `private_key` complicar, abra o
> JSON, copie o valor de `private_key` inteiro (com os `\n` literais) e cole entre
> aspas em `supabase secrets set FCM_PRIVATE_KEY="...\n..."`. O código troca `\n`
> por quebras reais ao assinar.

## Parte 7 — Ligar o disparo (`push_config`) e agendar prazos

No **SQL Editor**, aponte o trigger para a função (use a URL do seu projeto e o
**mesmo** `CRON_SECRET` do passo anterior):

```sql
insert into public.push_config (id, base_url, cron_secret)
values (1, 'https://SEU-PROJETO.supabase.co', 'uma-string-secreta-forte')
on conflict (id) do update
  set base_url = excluded.base_url,
      cron_secret = excluded.cron_secret,
      atualizado_em = now();
```

Agende o aviso diário de prazos (08:00 BRT = 11:00 UTC):

```sql
select cron.schedule('fieldcheck-prazos-nc', '0 11 * * *',
                     $$ select public.notificar_prazos(); $$);
```

Enquanto `push_config` estiver vazia, o push fica **desligado** (só o sino in-app) —
útil para publicar o código antes de configurar.

## Parte 8 — Rebuild do APK com push (sua máquina, Android Studio)

O plugin `@capacitor/push-notifications` já está no `package.json`. Gere/atualize
o Android e coloque o `google-services.json`:

```bash
npm install
npm run build
npx cap add android            # se ainda não existe a pasta android/
# copie o google-services.json (Parte 2) para: android/app/google-services.json
npx cap sync android           # aplica o plugin de push ao projeto nativo
```

O `cap sync` costuma inserir o plugin `com.google.gms.google-services` no Gradle.
**Confira** (uma vez):
- `android/build.gradle` → `dependencies { classpath 'com.google.gms:google-services:4.4.2' }`
- `android/app/build.gradle` → no fim: `apply plugin: 'com.google.gms.google-services'`

Depois abra no Android Studio (`npx cap open android`), **Build → Generate Signed
Bundle/APK**, instale no celular.

## Parte 9 — Testar

**Web** (mais rápido, sem APK):
1. `npm run dev` (ou o app publicado na Vercel, em **HTTPS** — web push exige HTTPS).
2. Logue → **Perfil** → botão **"Ativar notificações neste dispositivo"** → aceite a
   permissão do navegador. Confirme que apareceu 1 linha em `public.push_tokens`.
3. Force uma NC (crie uma inspeção com item NC atribuído a uma contratada que tenha
   um usuário `executora`). O usuário executora deve receber o banner do navegador.
4. Teste manual direto na função:
   ```bash
   curl -X POST 'https://SEU-PROJETO.supabase.co/functions/v1/enviar-push' \
     -H 'x-cron-secret: uma-string-secreta-forte' \
     -H 'Content-Type: application/json' \
     -d '{"usuario_ids":["<uuid-do-usuario>"],"titulo":"Teste","corpo":"Olá 👋"}'
   ```
   Resposta esperada: `{"ok":true,"enviados":1,"podados":0}`.

**Android**: instale o APK, logue, **Perfil → Ativar** (aceite a permissão),
confirme o token na tabela e repita o passo 3.

**Prazos**: rode `select public.notificar_prazos();` no SQL Editor — retorna quantos
avisos gerou; quem tiver NC vencendo/vencida recebe push + sino.

## Preferência do usuário (opt-out, M6)

Cada usuário controla em **Perfil → Notificações**:
- **desmarcar** "Receber avisos de NC" → a função `enviar-push` para de enviar a ele
  (o servidor filtra por `usuarios.notif_push`);
- o token morto (app desinstalado / permissão revogada) é **podado** automaticamente
  quando o FCM responde `UNREGISTERED`.

## Resolução de problemas

| Sintoma | Causa provável |
|---|---|
| `{"error":"Credenciais FCM ausentes."}` | Faltou algum secret `FCM_*` na função. |
| Web: nada acontece ao clicar Ativar | `.env` sem `VITE_FIREBASE_*`/VAPID, ou site não está em HTTPS. |
| `enviados:0` mas sem erro | Usuário com `notif_push=false`, sem token, ou nenhum token da plataforma. |
| Push não chega ao criar NC | `push_config` vazia, ou a URL/segredo não batem com os secrets da função. |
| Android sem push | `google-services.json` ausente/errado, ou o plugin gms não foi aplicado no Gradle. |
