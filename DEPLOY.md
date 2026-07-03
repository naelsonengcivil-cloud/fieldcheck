# Deploy — FieldCheck (PWA na Vercel)

O `vercel.json` já configura framework Vite, build e rewrites de SPA. O deploy
em si exige a sua conta Vercel (login). Passo a passo:

## 1. Importar o repositório
- Acesse https://vercel.com → **Add New → Project** → importe
  `naelsonengcivil-cloud/fieldcheck` (repositório privado; autorize o GitHub).
- Framework: **Vite** (detectado). Build: `npm run build`. Output: `dist`.
  *(alternativa por CLI: `npm i -g vercel && vercel && vercel --prod`)*

## 2. Variáveis de ambiente (no painel do projeto → Settings → Environment Variables)
| Nome | Valor |
|------|-------|
| `VITE_SUPABASE_URL` | `https://vdrymhrteaxacuhcfzvy.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | a **publishable/anon key** (a mesma do `.env`) |

Defina para *Production* (e *Preview* se quiser). Estas são chaves de cliente
(públicas por natureza) — o isolamento real é o RLS.

## 3. Ajustar o Supabase Auth para a URL publicada
Como a confirmação de e-mail está **ligada**, o link do e-mail precisa voltar
para o app publicado. Em **Supabase → Authentication → URL Configuration**:
- **Site URL**: `https://SEU-APP.vercel.app`
- **Redirect URLs**: adicione `https://SEU-APP.vercel.app/**` (e mantenha
  `http://localhost:5173/**` para desenvolvimento).

## 4. Verificar
- Abrir a URL da Vercel → deve carregar o login e instalar como **PWA**.
- Criar conta (self-signup) → confirmar o e-mail → cai no onboarding.
- CI (`.github/workflows/ci.yml`) roda a cada push: typecheck + testes + build + e2e.

## 5. (Quando houver Stripe) atualizar `APP_URL`
No secret das Edge Functions (`supabase secrets set APP_URL=https://SEU-APP.vercel.app`)
para os `success_url`/`cancel_url` do Checkout apontarem ao app publicado.

## Empacotamento nativo (Capacitor)
Ver [`README.md`](README.md) → seção "Empacotamento nativo". O `webDir` é `dist`;
rode `npm run build && npm run cap:sync` numa máquina com Android Studio/Xcode.
