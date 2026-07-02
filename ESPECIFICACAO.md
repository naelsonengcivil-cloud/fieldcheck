# FieldCheck — Especificação Técnica v1.0

> **Instrução para o Claude Code:** este documento é a especificação do produto. O arquivo `fieldcheck-v2-2.jsx` na raiz do projeto é o protótipo validado em campo — ele define o fluxo de telas, o design system e a UX aprovada. Construir o app real seguindo esta especificação, usando o protótipo como referência visual e de comportamento.

---

## 1. Visão do produto

App móvel (PWA + empacotamento nativo via Capacitor) para **inspeções de campo em obras de construção e engenharia** (canteiros, usinas fotovoltaicas, subestações). O inspetor executa checklists baseados em NRs e áreas de gestão (segurança, meio ambiente, qualidade, equipamentos etc.), registra não conformidades com foto/responsável/prazo, e o sistema consolida KPIs por obra com exportação de relatórios.

**Modelo de negócio:** SaaS B2B por assinatura (por empresa, com N usuários), vendido para construtoras, gerenciadoras e empresas de fiscalização. App gratuito nas lojas; acesso mediante conta da empresa assinante.

**Diferencial:** ciclo completo NC → tratamento → fechamento com evidências, e KPIs automáticos (conformidade, TF/TG, ranking de contratadas, Pareto) sem digitação dupla.

## 2. Perfis de usuário

| Perfil | Permissões |
|---|---|
| **Inspetor** | Executa inspeções, registra NCs, consulta suas inspeções |
| **Gestor da obra** | Tudo do inspetor + trata NCs (responsável/prazo/status), vê dashboards da(s) sua(s) obra(s), exporta relatórios |
| **Administrador (empresa)** | Tudo + gerencia usuários, obras, catálogo de checklists, contratadas |

## 3. Stack técnico

- **Front-end:** React 18 + Vite + TypeScript. PWA (vite-plugin-pwa) com service worker.
- **UI:** design system do protótipo (paleta e tipografia na seção 8). CSS modules ou Tailwind.
- **Estado/offline:** TanStack Query + IndexedDB (Dexie.js) com fila de sincronização própria.
- **Back-end:** Supabase — Postgres, Auth (e-mail/senha + convite), Storage (fotos), Row Level Security por empresa (multi-tenant).
- **Gráficos:** Recharts.
- **Exportações:** SheetJS (xlsx) no cliente; PDF via @react-pdf/renderer ou impressão nativa; PNG via canvas (já implementado no protótipo).
- **Empacotamento nativo:** Capacitor 6 (iOS + Android), plugins: Camera, Filesystem, Share, Network.
- **Deploy web:** Vercel. **CI:** GitHub Actions.

## 4. Modelo de dados (Postgres/Supabase)

```sql
-- Multi-tenant: toda tabela tem empresa_id; RLS filtra por empresa do usuário logado.

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  plano text default 'trial',           -- trial | ativo | suspenso
  criado_em timestamptz default now()
);

create table usuarios (                  -- espelho de auth.users
  id uuid primary key references auth.users,
  empresa_id uuid references empresas not null,
  nome text not null,
  papel text not null default 'inspetor',  -- inspetor | gestor | admin
  ativo boolean default true
);

create table obras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas not null,
  nome text not null,                   -- ex.: UFV Diamantina I
  cliente text,
  ativa boolean default true
);

create table checklists (               -- catálogo versionado
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas,  -- null = catálogo padrão do sistema
  codigo text not null,                 -- ST-01, MA-01...
  area text not null,                   -- Segurança do Trabalho, Meio Ambiente...
  referencia text,                      -- NR-01 – Gerenciamento de Riscos
  nome text not null,
  versao int default 1,
  ativo boolean default true
);

create table itens_checklist (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid references checklists not null,
  ordem int not null,
  texto text not null,                  -- APR disponível na frente de serviço
  criterio text                         -- o que verificar
);

create table inspecoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas not null,
  obra_id uuid references obras not null,
  checklist_id uuid references checklists not null,
  inspetor_id uuid references usuarios not null,
  frente text,                          -- frente de serviço dentro da obra
  contratada text,                      -- empresa executante inspecionada
  iniciada_em timestamptz not null,
  finalizada_em timestamptz,
  lat numeric, lng numeric,             -- geolocalização da inspeção
  status text default 'finalizada',     -- rascunho | finalizada
  origem_offline boolean default false
);

create table respostas (
  id uuid primary key default gen_random_uuid(),
  inspecao_id uuid references inspecoes not null,
  item_id uuid references itens_checklist not null,
  resposta text not null,               -- C | NC | NA
  observacao text,
  criado_em timestamptz default now()
);

create table eventos_nc (               -- 1:1 com resposta NC; ciclo de tratamento
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid references respostas not null unique,
  empresa_id uuid references empresas not null,
  obra_id uuid references obras not null,
  responsavel text,
  prazo date,
  status text default 'aberto',         -- aberto | em_andamento | fechado
  tratamento text,                      -- descrição da correção
  fechado_em timestamptz,
  fechado_por uuid references usuarios
);

create table evidencias (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid references respostas,
  evento_id uuid references eventos_nc, -- foto da NC ou foto do fechamento
  tipo text not null,                   -- abertura | fechamento
  url text not null,                    -- Supabase Storage
  lat numeric, lng numeric,
  capturada_em timestamptz default now()
);
```

**Regras de RLS:** todo select/insert/update filtrado por `empresa_id = empresa do usuário autenticado`. Inspetor só edita inspeções próprias em rascunho; inspeção finalizada é imutável (só `eventos_nc` evolui).

**Seed:** importar o catálogo completo do arquivo `Programa_Inspecoes_Canteiro.xlsx` (aba Checklists) para `checklists` + `itens_checklist` como catálogo padrão do sistema (empresa_id = null), ~26 checklists / ~265 itens.

## 5. Requisitos funcionais (por fase)

### Fase 1 — MVP (paridade com o protótipo + banco)
- RF01. Login por e-mail/senha; usuário pertence a uma empresa.
- RF02. Home lista obras da empresa com KPIs (inspeções, NCs, % conformidade).
- RF03. Nova inspeção: escolher obra, frente, contratada e checklist do catálogo.
- RF04. Execução: resposta C/NC/NA por item; NC exige observação; foto (câmera nativa via Capacitor), responsável e prazo opcionais na abertura.
- RF05. Regra de finalização: 100% dos itens respondidos e toda NC com observação.
- RF06. **Offline-first:** inspeção gravada localmente (IndexedDB); fila de sincronização sobe quando houver rede; indicador visual de pendências de sync; fotos comprimidas no aparelho antes do upload.
- RF07. Tela da obra: filtros combináveis (checklist, inspetor, período, contratada, só com NC); lista de inspeções; detalhe somente leitura.
- RF08. Gráficos reagindo ao filtro: NCs por checklist; % conformidade por inspeção (evolução).
- RF09. Exportações do filtro atual: .xlsx (abas Inspeções / Eventos / Info), PDF (relatório com fotos), PNG do gráfico — com compartilhamento nativo (Capacitor Share).

### Fase 2 — Ciclo de tratamento e gestão
- RF10. Painel de NCs: lista, filtros por status/prazo (vencidas em destaque), atribuição de responsável.
- RF11. Fechamento de NC exige descrição do tratamento + foto de fechamento.
- RF12. Notificações push (NC atribuída, prazo vencendo) — Capacitor Push / FCM.
- RF13. Dashboard executivo por empresa: tendência mensal, desvios por NR, ranking de contratadas, Pareto de itens.
- RF14. Gestão de usuários (convite por e-mail), obras e contratadas (admin).
- RF15. Editor de checklists: clonar catálogo padrão, criar itens próprios (versionamento: resposta guarda a versão respondida).

### Fase 3 — Produto/SaaS
- RF16. Assinatura de plano (Stripe) com portal do cliente; bloqueio suave ao expirar.
- RF17. Relatório semanal automático por e-mail (PDF da obra).
- RF18. Assinatura digital do inspetor e do responsável da contratada na finalização.
- RF19. API de leitura para BI (Power BI/Looker) via views SQL.

## 6. Requisitos não funcionais
- Uso com luvas e sob sol: alvos de toque ≥ 44px, alto contraste (design do protótipo).
- Funcionamento 100% offline durante a inspeção; sync automática e manual.
- Foto: máx. 1280px, JPEG q=0,7 para upload; miniatura local 480px.
- Tempo de abertura do app < 3s em 4G; bundle inicial < 300KB gzip (code-splitting).
- LGPD: dados por empresa isolados via RLS; exclusão de conta remove dados pessoais.
- Testes: unitários para fila de sync e regras de finalização; e2e (Playwright) do fluxo inspeção completa.

## 7. Fluxo de sincronização (crítico)
1. Toda escrita vai primeiro ao IndexedDB com `sync_status: 'pendente'` e UUID gerado no cliente.
2. Worker de sync (online + a cada 60s + botão manual): envia inspeções → respostas → eventos → fotos (nesta ordem); marca `sincronizado`.
3. Conflito: inspeção finalizada é imutável ⇒ inserção idempotente por UUID (upsert). Eventos_nc: last-write-wins com `updated_at`.
4. Falha de upload de foto não bloqueia o restante; item permanece na fila com retry exponencial.

## 8. Design system (do protótipo aprovado)
- **Cores:** fundo #F4F4F1 · tinta #16181B · amarelo sinalização #F5A800 (ação primária + faixa zebrada do header) · navy #1C2733 (header) · verde #1F8A4C (Conforme) · vermelho #C6362B (NC) · cinza #6B7178 (N/A).
- **Tipografia:** títulos Barlow Condensed 600/700 caixa-alta; corpo system-ui.
- **Assinatura visual:** faixa zebrada amarela/preta no topo (sinalização de obra).
- **Padrões:** botões C/NC/NA em grade tripla; borda esquerda colorida indicando status do item; barra de progresso amarela na execução.

## 9. Estrutura sugerida do projeto
```
fieldcheck/
├── ESPECIFICACAO.md            ← este arquivo
├── fieldcheck-v2-2.jsx         ← protótipo de referência
├── Programa_Inspecoes_Canteiro.xlsx  ← catálogo p/ seed
├── src/
│   ├── app/                    (rotas/telas)
│   ├── components/             (design system)
│   ├── features/inspecao/      (execução, resumo)
│   ├── features/obra/          (filtros, gráficos, exportações)
│   ├── features/nc/            (tratamento — fase 2)
│   ├── lib/supabase.ts
│   ├── lib/db.ts               (Dexie/IndexedDB)
│   └── lib/sync.ts             (fila de sincronização)
├── supabase/migrations/        (SQL da seção 4)
└── capacitor.config.ts
```

## 10. Critérios de aceite do MVP
1. Inspetor executa inspeção completa em modo avião; ao religar a rede, tudo sobe sozinho (inclusive fotos) e aparece no dashboard de outro usuário da mesma empresa.
2. Nenhuma inspeção finaliza com NC sem observação.
3. Filtro por período + checklist reflete simultaneamente em KPIs, gráfico, lista e nas três exportações.
4. .xlsx exportado abre no Excel com 3 abas corretas; PDF contém fotos das NCs.
5. Usuário de outra empresa não enxerga nenhum dado (teste de RLS).
6. App instala como PWA no Android/iOS e roda empacotado via Capacitor.
