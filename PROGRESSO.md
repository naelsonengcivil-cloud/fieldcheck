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

---

## 🧭 Fila de marcos temáticos (pós‑Marcos A/B)

> **CONCLUÍDOS e validados:** Marcos A/B (obras+auditoria; ciclo NC fiscal↔
> executora); temas Notificações, Relatórios do ciclo, App nativo; **Marco A1**
> (evidências + contadores), **Marco A2** (Pirâmide de Bird), **Marco E**
> (catálogo v2 · módulos · checklists personalizados · Kits), **Marco F**
> (operador super_admin + cortesia).
>
> **PENDÊNCIA PERMANENTE — Pix:** em espera até o cliente ajustar o **CNAE** da
> empresa + habilitar Pix no Stripe → então `PIX_HABILITADO=true` + push.
> **Lembrar o usuário do Pix ao concluir cada fase.**
>
> **PENDÊNCIA — Onboarding autônomo (verificação 2026‑07‑08):** o esqueleto está
> pronto (cadastro público → `criar_empresa_e_admin` cria empresa trial 14d +
> admin → `empresa_liberada()` libera no trial). **Elos a fechar:** (1) **e‑mail
> do Auth** — Site URL + Redirect URLs (Vercel) + template PT FieldCheck; com
> "Confirm email" ligado, é o gargalo do acesso hands‑off — **casa com o Marco
> H**; (2) **sem auto‑conversão Stripe ao fim do trial** (modelo atual = trial
> grátis sem cartão → bloqueio suave → assinatura manual); decidir junto do
> Pix/go‑live.
>
> **NA FILA (apresentar plano testável ANTES de codificar cada um):** Marco H
> (recuperação de senha) · Marco I (criticidade + prazo da NC) · Marco J
> (Relatório Geral + identidade + assinatura) · Marco K (argumentação IA nas NC).

### Marco E — Módulos, checklists personalizados e Kits de Obra

- **(a) Classificação do `checklists` em 3 dimensões:**
  - `modulo` (valores canônicos, **v2**): `civil | eletromecanica | eletrica |
    comissionamento | linhas_transmissao | telecom | transversal |
    edificacoes | reformas`;
  - `tipo`: `seguranca_nr | meio_ambiente | qualidade | documentacao |
    execucao | equipamentos`;
  - `fase`/contexto (opcional, texto — ex.: fundações, montagem, energização);
  - `nrs_relacionadas[]` para checklists técnicos que tocam NRs → **alimenta os
    KPIs de segurança e a pirâmide de Bird mesmo em inspeções técnicas** (cruza
    com o Marco A2).
- **(b) Catálogo padrão expandido — catálogo mestre v2: 83 checklists / 643
  itens** (o usuário fornecerá a planilha‑catálogo com itens e referências para o
  seed): Civil **CV‑01..08**, Eletromecânica **EM‑01..06**, Elétrica **EL‑01..07**,
  Comissionamento **CM‑01..06**, Linhas de Transmissão **LT‑01..07**, Telecom
  **TC‑01..06**, **Edificações ED‑01..14**, **Reformas RF‑01..02**.
- **(c) Criador de checklists personalizados (admin da empresa):** fluxo
  **Módulo → dados do checklist** (código gerado por prefixo do módulo +
  sequência, nome, tipo, fase) **→ itens** (texto + critério) **→ referência**.
  Checklist personalizado tem `empresa_id` (visível só à empresa), é **versionado**
  como o catálogo padrão e pode ser **clonado a partir de um checklist padrão**
  para edição.
- **(d) Referência em dois níveis:**
  - no **checklist**: `referencia_documento` (norma, manual do fabricante ou
    documento/manual do cliente a seguir) — **retroativo** aos checklists
    existentes;
  - na **inspeção** dos módulos técnicos (civil, eletromecânica, elétrica,
    comissionamento, LT, telecom): **"projeto de referência aprovado"** (nº do
    documento + revisão), preenchido ao **iniciar** a inspeção e **exibido no
    relatório** — rastreabilidade de contra o que se inspecionou.
- **(e) Kits de Obra:** entidade `kits` (por empresa) agrupando checklists
  (padrão + personalizados). A **obra adota um kit**, e o fluxo de nova inspeção
  passa a ofertar **os checklists do kit da obra** (com opção **"todos"**).
  Kits‑modelo **no seed (v2)**: **UFV**, **Subestação**, **Linha de Transmissão**,
  **Obra Vertical**, **Edificação Simples** e **Reforma**. O **"Kit
  Personalizado" NÃO é seed** — é a própria funcionalidade (E‑e): o cliente
  compõe o kit livremente a partir dos checklists padrão + personalizados.
- **(f) Filtros, dashboards e exportações** passam a suportar as novas dimensões
  (**módulo/tipo**).

**Avaliar no plano do Marco E:**
- **Impacto nas telas existentes:** o seletor de checklist (NovaInspecao) passa a
  ser **agrupado por módulo**; filtros da obra/dashboards ganham módulo/tipo.
- **Performance do seed:** o catálogo cresce para **~60 checklists** — revisar o
  gerador de seed (`scripts/gen-seed.mjs`), o tamanho da migration e a baixa do
  catálogo (`catalogo.ts`) para não pesar a carga inicial/offline.

### Marco F — Papel de operador da plataforma e cortesia de assinatura

- **(a) Novo papel `super_admin`** (operador do SaaS — **Alpha Inspeções**), acima
  das empresas: **painel de gestão de empresas** da plataforma (lista, status do
  plano, uso).
- **(b) Cortesia por tempo determinado:** `super_admin` concede acesso gratuito a
  uma empresa até data X (campo **`cortesia_ate`** em `empresas`). A função
  **`empresa_liberada()`** (M11) passa a considerar: **plano ativo OU trial
  vigente OU cortesia vigente**; expirada a cortesia → **bloqueio suave** padrão.
- **(c) Auditoria:** toda **concessão/alteração de cortesia** registrada no log de
  auditoria (quem, quando, até quando, motivo).
- **(d) RLS / privacidade por design:** `super_admin` **não** acessa dados
  operacionais das empresas (inspeções, fotos) — **apenas metadados de conta e
  faturamento**.

### Marco H — Recuperação de senha (+ troca pelo usuário logado)

- Fluxo **"Esqueci minha senha"** no login via reset nativo do Supabase Auth
  (`resetPasswordForEmail`): e‑mail → link → tela de redefinição → confirmação.
- **Template de e‑mail em português** com identidade FieldCheck; **Redirect URL**
  configurada (mesmo alicerce que destrava a confirmação de e‑mail do onboarding).
- Incluir **troca de senha pelo usuário logado** (tela de perfil).

### Marco I — Evolução do modelo de NC: criticidade e prazo estruturados
*(pré‑requisito do Marco J — relatórios)*

- **(a)** Campo **`criticidade`** na NC: `baixa | média | alta | crítica`, definido
  pelo inspetor no registro (editável pelo gestor no tratamento).
- **(b)** **Prazo de atendimento vinculado à criticidade:** ao escolher a
  criticidade, o sistema **sugere o prazo** automaticamente (parâmetros
  **configuráveis pelo admin** da empresa — ex.: crítica = 24h, alta = 3 dias,
  média = 7, baixa = 15), permanecendo **editável** caso a caso; **NCs sem prazo
  não podem ser finalizadas**.
- **(c)** Criticidade visível com **código de cores** em todas as listas, painel de
  NCs, filtros, dashboards e exportações; **NCs críticas/vencidas sempre em
  destaque**.
- **(d)** Compatibilidade futura: a criticidade alimenta a **pirâmide de Bird**
  (Marco A2/D) e os **SLAs por etapa** do ciclo fiscal↔executora (Marco B).

### Marco J — Relatório Geral da Empresa + identidade visual + assinatura

- **(a)** **Upload de logo** da empresa (admin, configurações): PNG/JPG/SVG no
  Supabase Storage com **RLS**, pré‑visualização, substituição e remoção;
  validação de tamanho (**máx. 2 MB**) e otimização no upload.
- **(b)** **Cabeçalho padronizado em TODOS os PDFs** (por inspeção, por obra e
  Geral): logo + nome da empresa em destaque + **nome do inspetor responsável**
  (na inspeção, o da inspeção; por obra/geral, o(s) inspetor(es) do recorte); sem
  logo, só o nome com tipografia padrão.
- **(c)** **Marca FieldCheck discreta** em todas as folhas: rodapé de cada página
  ("Gerado por FieldCheck — fieldcheck.app" com ícone, tamanho reduzido), sempre
  subordinada à marca do cliente.
- **(d)** **Assinatura do inspetor:** captura de assinatura digital (desenho na
  tela) na **finalização da inspeção**, armazenada com a inspeção; bloco de
  assinatura no fechamento do relatório (assinatura + nome completo + data da
  inspeção) — **antecipa o RF18**; no relatório geral, avaliar seção de
  assinaturas dos inspetores do período ou do gestor emissor.
- **(e)** **Datas explícitas nos eventos:** toda NC/evento exibe a **data da
  inspeção de origem** (além da data de abertura do evento) em listas, painel,
  detalhe e relatórios — linha completa: **origem → criticidade → prazo →
  situação**.
- **(f)** **Relatório Geral consolidado** (gestor/admin, todas as obras no
  período): capa (logo + empresa + período); **sumário executivo** (inspeções,
  pontos, % conformidade, NCs abertas/fechadas por criticidade, tempo médio de
  fechamento); **gráficos consolidados** (evolução mensal, NCs por obra, por
  módulo/tipo, por contratada, por criticidade, pirâmide de Bird); tabela por
  obra; anexo de **NCs críticas e vencidas** com fotos, datas e prazos.
- **(g)** **Exportável** em PDF (executivo) e xlsx (dados), reaproveitando a
  arquitetura de filtros/exportação; recorte = **empresa inteira + período**.

### Marco K — Argumentação de NC assistida por IA (1ª função de IA do sistema)

- **(a)** **Infra de IA:** Edge Function dedicada (`ia-argumentar-nc`) chamando a
  API da Anthropic (Claude) — chave nos **secrets do Supabase** (mesma arquitetura
  do Stripe); **contador de uso por empresa** (para precificação futura); timeout
  e **fallback silencioso** (indisponibilidade da IA **nunca** bloqueia o registro
  da NC).
- **(b)** **Fluxo:** inspetor descreve o desvio normalmente; botão **"Gerar
  argumentação (opcional)"** envia o contexto (descrição, item do checklist,
  critério, checklist/módulo, **NRs relacionadas** e criticidade) e recebe uma
  **argumentação técnica** fundamentada em boas práticas e nas NRs/normas
  pertinentes — citando requisitos aplicáveis (ex.: "conforme NR‑35, item…").
- **(c)** **Salvaguardas de responsabilidade (obrigatórias):** texto vai a um campo
  **separado** "Argumentação técnica (sugestão automática — opcional)", distinto da
  descrição do inspetor; **nunca salvo automaticamente** — usuário revisa e
  confirma (edita/descarta); ao confirmar, aviso: "Texto gerado automaticamente
  como apoio. A revisão e a validade técnica são de responsabilidade do gestor da
  conta."; flags **`origem_ia`** + **`editado_apos_ia`** no banco (trilha de
  auditoria).
- **(d)** **Exibição:** aparece no detalhe da NC e nos relatórios em bloco próprio,
  com rodapé "Argumentação de apoio gerada com auxílio de IA e revisada pelo
  responsável" quando aplicável.
- **(e)** **Config por empresa:** admin habilita/desabilita; incluir cláusula nos
  **termos de uso** sobre conteúdo assistido por IA e responsabilidade de revisão
  do gestor do plano (**sinalizar ao usuário para providenciar a redação
  jurídica**).
- **(f)** **Prompt interno:** fundamentar **apenas** em normas do contexto enviado
  (NRs do checklist), indicar o item normativo quando citado, linguagem técnica de
  fiscalização, **não inventar referências** — na dúvida, argumentar por boas
  práticas sem citar norma.
