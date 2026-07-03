# FieldCheck — Progresso & Backlog

> Documento vivo de acompanhamento. Não é especificação (essa é a
> `ESPECIFICACAO.md`); aqui ficam o estado dos marcos, ações pendentes e o
> backlog pós‑MVP.

## Contexto de produto (importante p/ branding, textos e pagamentos)

- **Dona do SaaS:** **Alpha Inspeções e Auditoria** — é a empresa proprietária
  da plataforma FieldCheck. O branding, textos institucionais, contratos e a
  configuração de recebimento (conta Stripe, dados fiscais) são da Alpha.
- **Empresas clientes (tenants):** cada assinante é uma `empresa` no banco. A
  **G5 Engenharia** cadastrada hoje é a **primeira empresa cliente** (tenant de
  teste/piloto), não a dona do produto.
- Implicações a considerar quando chegarmos em branding/pagamentos:
  - Telas de marketing/login podem exibir a marca **FieldCheck by Alpha**.
  - O fluxo de pagamento cobra o **cliente** (a empresa tenant); o dinheiro vai
    para a conta da **Alpha**.
  - Multi‑tenant já está isolado por `empresa_id` via RLS (§4/§7) — a Alpha,
    como operadora, terá visão administrativa à parte (fora do escopo do MVP).

## Estado dos marcos (Fase 1 — MVP)

| Marco | Escopo | Status |
|------|--------|--------|
| M0 | Fundação (Vite+React+TS, PWA, design system) | ✅ concluído e verificado |
| M1 | Schema + RLS + triggers + storage | ✅ aplicado no Supabase |
| M2 | Seed do catálogo (27 checklists / 263 itens) | ✅ aplicado no Supabase |
| M3 | Login e‑mail/senha (RF01) | ✅ validado ao vivo (login verde) |
| M4 | Núcleo offline‑first: Dexie + fila de sync (§7) | ✅ concluído · testes unitários |
| M5 | Nova inspeção + execução, grava offline (RF03–RF06) | ✅ validado ao vivo |
| M6 | Home (obras+KPIs) + tela da obra (filtros) + detalhe (RF02, RF07) | ✅ validado ao vivo |
| M7 | Gráficos + exportações XLSX/PDF/PNG + Share (RF08, RF09) | ✅ validado ao vivo |
| M8 | Capacitor + deploy/CI + e2e offline | ✅ concluído (27 unit + 2 e2e) |

**Fase 1 (MVP) concluída.** RF01–RF09 implementados; offline‑first (§7) com
27 testes unitários + 2 e2e (Playwright); banco/RLS/seed aplicados; deploy
(Vercel) e CI (GitHub Actions) configurados; empacotamento Capacitor pronto
(build nativo em máquina com Android Studio/Xcode — ver README).

### Pendências para produção (fora do código-fonte)
- Deploy na Vercel: conectar o repo + definir `VITE_SUPABASE_*` no painel.
- Build nativo: `cap add android/ios` + `cap sync` em máquina com SDK.

### Notas técnicas relevantes
- Node LTS instalado como zip portátil (sem winget/choco na máquina).
- `.env` corrigido com a publishable key real; está no `.gitignore`.
- Bug corrigido no M5: `AuthProvider` não deve chamar o Supabase dentro do
  callback de `onAuthStateChange` (causava loop/trava); perfil agora resolve em
  efeito próprio.
- Orçamento de bundle: manter XLSX/PDF/Recharts com carregamento sob demanda no
  M7 (lazy import) para respeitar o < 300 KB gzip inicial.

---

## Backlog pós‑MVP

### 🥇 Prioridade nº 1 — Onboarding autônomo + Pagamentos (antecipa RF14/RF16)

> **Status:** (a) M9, (b) M10 e (d) M12 **concluídas e verificadas ao vivo**
> (self-signup+trial, convites, e tela de plano + bloqueio suave). O
> **(c) pagamento Stripe** tem o **backend escrito** (Edge Functions
> `criar-checkout`/`stripe-webhook` + migration 0008) e **ativa quando a Alpha
> criar a conta Stripe** (cartão+Pix) e fizer o deploy das functions.

Hoje **não existe fluxo para o primeiro usuário de uma empresa**: o vínculo é
feito manualmente via `supabase/provisionar_usuario.sql`. Automatizar isso é a
prioridade nº 1 depois do MVP. Quatro entregas:

- **(a) Página pública de cadastro autônomo (self‑signup).**
  Cria, numa transação, `auth.user` + `empresas` (plano **trial**, 14 dias) +
  `usuarios` vinculando o novo usuário como **admin**. Substitui o
  `provisionar_usuario.sql` manual.
  - Implementação provável: Supabase Edge Function (ou RPC `security definer`)
    que executa o signup + criação da empresa + vínculo atomicamente, já que o
    RLS bloqueia inserir `empresas`/`usuarios` sem um usuário‑admin pré‑existente
    (problema do "ovo e galinha" do primeiro usuário).
  - Definir: campo `trial_expira_em` em `empresas` (ou derivar de `criado_em`).

- **(b) Tela de convite de usuários pelo admin (RF14).**
  Admin convida por e‑mail (Supabase Auth invite / `inviteUserByEmail` via Edge
  Function com service_role) e o convidado entra já vinculado à empresa, com
  papel (inspetor/gestor/admin). Inclui listagem/edição de papéis e
  ativar/desativar usuário.

- **(c) Pagamento via Stripe Checkout (cartão + Pix) + webhook.**
  - Stripe Checkout Session com métodos **card** e **pix**.
  - Conta Stripe é da **Alpha** (dona do SaaS); o tenant é o cliente pagante.
  - **Webhook em Supabase Edge Function** valida a assinatura do evento Stripe e
    atualiza `empresas.plano` (`ativo`/`suspenso`) conforme
    `checkout.session.completed`, `invoice.paid`, `customer.subscription.*`.
  - Guardar `stripe_customer_id` / `stripe_subscription_id` na `empresas`.

- **(d) Tela de plano/assinatura no app + bloqueio suave (RF16).**
  Mostra plano atual, dias restantes do trial, botão para assinar (leva ao
  Checkout) e **bloqueio suave** ao expirar o trial (leitura permitida,
  ações de escrita bloqueadas com CTA de assinatura). Portal do cliente Stripe
  para gerenciar/cancelar.

**Dependências/observações:**
- Requer segredos server‑side (Stripe secret key, webhook signing secret,
  Supabase service_role) — vivem só nas Edge Functions, nunca no cliente.
- Alinha com RF14 (gestão de usuários) e RF16 (assinatura/bloqueio) da Fase 2/3
  da `ESPECIFICACAO.md`, porém **antecipados** por serem essenciais ao
  go‑to‑market (sem eles não há como uma empresa nova entrar sozinha e pagar).

## 🗺️ Roadmap pós‑M11 (a executar DEPOIS de fechar os pagamentos)

> **Processo:** quando o M11 (pagamentos) fechar, **apresentar um plano destes
> marcos em marcos testáveis para aprovação ANTES de codificar.** Não iniciar
> antes disso. **Ordem sugerida: A → B1 → B2.**
>
> **Nota de arquitetura (avaliar na fase de plano):** o **log de auditoria
> (A‑e)**, os **arquivamentos (A‑d)** e o **histórico de transições de NC (B‑a)**
> devem compartilhar a **mesma tabela de auditoria** — avaliar unificar num
> `eventos_auditoria` (quem, quando, entidade, ação, motivo, payload).

### Marco A — Gestão de Obras e Inspeções pelo admin (antecipa parte do RF14)

- **(a) `obras.status` no lugar do booleano `ativa`.** Migration convertendo os
  dados existentes para `em_andamento | finalizada | arquivada`. Comportamentos:
  - `em_andamento`: fluxo normal, aceita novas inspeções;
  - `finalizada`: **não** aceita novas inspeções, mas permanece em listas,
    dashboards e KPIs (selo visual "Finalizada");
  - `arquivada`: sai das listas e seletores padrão (visível só no filtro
    "mostrar arquivadas"); histórico preservado.
- **(b) Tela de obras (admin):** criar, editar (nome/cliente) e mudar status
  (em andamento ⇄ finalizada ⇄ arquivada) com confirmação.
- **(c) Excluir obra** somente se **não** tiver nenhuma inspeção; caso contrário,
  oferecer **finalizar** ou **arquivar**.
- **(d) Arquivamento de inspeção (só admin):** sai das listas padrão e é
  **excluída de KPIs e gráficos** (casos: teste, duplicidade), com **motivo
  obrigatório** e opção de **desarquivar**; contador de arquivadas no filtro.
- **(e) Exclusão definitiva de inspeção (só admin):** funcionalidade regular de
  administração, importante no período de adaptação das equipes (registros
  errados/mal fundamentados durante o aprendizado). Botão na visão admin da
  inspeção, com **confirmação em duas etapas** (digitar `EXCLUIR` ou
  equivalente), **motivo obrigatório**, e **registro permanente no log de
  auditoria** (quem, quando, qual inspeção, motivo) — o **log sobrevive à
  exclusão**. Remove a inspeção, suas respostas, NCs e evidências de todas as
  listas, KPIs e gráficos. **Inspetor e gestor não excluem nem arquivam**
  inspeção finalizada — ambos os poderes são **exclusivos do admin**.
- **(f) RLS** garantindo **no banco** (não só na UI) que apenas admin executa
  mudanças de status, arquivamentos e exclusões.

### Marco B — Ciclo Fiscal ↔ Executora (evolução do RF10/RF11)

- **(a) Máquina de estados da NC:** `aberta → atribuída → em_tratamento →
  aguardando_aprovacao → fechada`, com **reprovação** retornando a
  `em_tratamento` (motivo obrigatório). Toda transição com **timestamp, autor e
  comentário** (tabela de histórico).
- **(b) Tratamento** exige **descrição + foto** de evidência de fechamento;
  **aprovação/reprovação exclusiva** do papel fiscal/gestor.
- **(c) Fase B1:** fluxo completo operado por **usuários internos** (gestor
  registra o tratamento em nome da contratada).
- **(d) Fase B2:** novo papel **executora** vinculado à tabela `contratadas`,
  com **RLS** restringindo a visão apenas às NCs da própria contratada, e
  **convite de usuários por contratada**.
- **(e) Novos KPIs do histórico:** tempo médio por etapa, taxa de reprovação de
  tratamentos, NCs vencidas e **reincidência por contratada**.
- **(f) Consistência com o Marco A:** NCs de obra **finalizada** continuam
  tratáveis até fechamento (com destaque no painel); obra **arquivada** congela o
  tratamento; a **exclusão de inspeção (A‑e)** remove também as NCs vinculadas e
  seus históricos — o **log de auditoria** da exclusão é o único vestígio
  remanescente.

### Outros itens já previstos na especificação (Fases 2–3)
Ver `ESPECIFICACAO.md` §5: RF10–RF15 (ciclo de tratamento de NC, push, dashboard
executivo, editor de checklists) e RF17–RF19 (relatório semanal por e‑mail,
assinatura digital, API de BI).
