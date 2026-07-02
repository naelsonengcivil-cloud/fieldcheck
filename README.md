# FieldCheck

PWA offline-first para **inspeções de campo em obras** (canteiros, usinas
fotovoltaicas, subestações). Checklists por NR/área, registro de não
conformidades com foto/responsável/prazo, KPIs por obra e exportações.

- **Produto:** FieldCheck, da **Alpha Inspeções e Auditoria** (dona do SaaS).
- **Stack:** React 18 + Vite + TypeScript · PWA (vite-plugin-pwa) · TanStack
  Query · Dexie (IndexedDB) + fila de sync própria · Supabase (Postgres/Auth/
  Storage/RLS) · SheetJS (lazy) · Capacitor 6 (iOS/Android).
- Especificação em [`ESPECIFICACAO.md`](ESPECIFICACAO.md); progresso e backlog
  em [`PROGRESSO.md`](PROGRESSO.md).

## Desenvolvimento

```bash
npm install
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
```

Scripts: `dev` · `build` · `preview` · `typecheck` · `test` (unit, Vitest) ·
`test:e2e` (Playwright) · `gen:icons` · `gen:seed`.

## Banco (Supabase)

Aplique no **SQL Editor** as migrations em `supabase/migrations/` na ordem
`0001 → 0005` e depois `supabase/provisionar_usuario.sql` (cria a 1ª empresa,
vincula o usuário admin e uma obra inicial). Detalhes e teste de RLS em
[`supabase/README.md`](supabase/README.md).

## Testes

- **Unitários (Vitest + fake-indexeddb):** `npm test` — regras de finalização,
  fila de sync (ordem/idempotência/backoff), persistência offline, KPIs/filtros,
  dados de exportação e o **roundtrip offline→online (aceite #1)**.
- **e2e (Playwright):** `npm run test:e2e` (baixe o browser uma vez com
  `npx playwright install chromium`).

## Deploy web (Vercel)

Projeto Vite; `vercel.json` já configura build/rewrites. No painel da Vercel,
defina as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Cada push
na branch principal roda a CI (`.github/workflows/ci.yml`: typecheck + testes +
build + e2e).

## Empacotamento nativo (Capacitor)

Numa máquina com Android Studio / Xcode:

```bash
npm run build
npm run cap:add:android   # e/ou cap:add:ios
npm run cap:sync
npx cap open android      # abre o projeto nativo para gerar o APK/IPA
```

`capacitor.config.ts` define `appId com.alphainspecoes.fieldcheck`. Os recursos
nativos (Camera, Share, Network) são usados via `src/lib/plataforma.ts`, que cai
para APIs web no PWA — o app funciona igual instalado como PWA ou empacotado.
