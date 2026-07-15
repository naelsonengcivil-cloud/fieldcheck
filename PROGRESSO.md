# FieldCheck — Progresso & Backlog

> Documento vivo de acompanhamento. Não é especificação (essa é a
> `ESPECIFICACAO.md`); aqui ficam o estado dos marcos, ações pendentes e o
> backlog pós‑MVP.

## 🏁 RELEASE v1.0.0 — LANÇADA EM PRODUÇÃO (2026‑07‑13)

**v1.0.0 no ar e validada em produção** (Vercel, commit `0c4b4bf`, tag `v1.0.0`).
Fechamento após as **6 melhorias pré‑v1.0 + correção prioritária da RNC** — todo o
escopo pré‑v1.0 **concluído**. Versão em `package.json` → **1.0.0**; fonte única em
`src/version.ts` (`APP_VERSION`), selo **v1.0** discreto no login e em Perfil.

- **Validação em produção (usuário):** selo no login e Perfil ✓ · inspeção com múltiplas
  fotos ✓ · RNC gerada e exportada em PDF ✓ · logo no cabeçalho do PDF ✓.
- **Validação local (fechamento):** smoke test completo verde (painéis de obra/NC, RNC com
  e sem texto‑base, exportações, responsivo desktop 1180px) sem erros de console;
  `typecheck` + **94 testes** + `build` verdes.
- Migrações aplicadas até `0035`; nada pendente no banco.

### 🔜 PRÓXIMO — APK + push NATIVO (parte do usuário)
Web push já validado ponta a ponta; o **push nativo** é a única frente do RF12 ainda não
exercida em dispositivo. Código completo e `android/` pronto (google‑services.json + Gradle).
Passos: `npx cap sync android` → build no Android Studio → instalar no aparelho →
Perfil ▸ *Ativar notificações neste dispositivo* → testar com o mesmo `curl` da
`enviar-push`. Ref.: [[rf12-push-estado]].

### 🔻 PENDÊNCIAS ABERTAS (retomar 2026‑07‑15)
- **Excluir a inspeção‑teste "TESTE K1"** (CV‑02 na obra Teste, frente "TESTE K1 …",
  Proj. TESTE‑K1 rev 0, RNC‑2026‑0009) — criada só para validar o K1; o **usuário
  vai excluir** (Detalhe da inspeção ▸ Excluir definitivamente). Some dos KPIs depois.
- **git push** dos 3 commits à frente do origin (`ca5c166`, `784dfb4`, `955aefb`) —
  quando o usuário quiser (dispara deploy Vercel).
- **EM ANDAMENTO — curadoria dos textos‑base** (item 1 da fila; K→textos‑base→RF19→Marco G→Marco L):
  - Auditoria do seed 0024: **643 textos / 83 checklists**. Defeitos sistêmicos: risco
    **idêntico** em todos os itens de cada checklist (83/83); fundamentação/ação são
    templates de checklist (norma de nível checklist, não do item); **vazamento** de
    conteúdo entre itens; `gravidade_sugerida` em frase‑faixa vaga.
  - ✅ **Piloto CV‑02 curado e aplicado** (migração `0038`): 8 itens com risco/fundamentação/
    ação específicos + gravidade limpa com regra de escalonamento por item (normas reais:
    NBR 6122/9061/7182, NR‑18/6). Define o **padrão de qualidade** a replicar.
  - ✅ **Triagem xlsx** gerada (`~/Downloads/triagem_textos_base_rnc.xlsx`): abas "Resumo por
    checklist" (priorização) + "Textos‑base (643)" com flags. Ainda **NÃO commitada** (não é código).
  - ✅ **Curadoria dos 82 restantes via WORKFLOW multi‑agente** (autorizado): draft (1 agente/checklist)
    + verificação normativa adversarial. **82 drafts + 67 verificados**; migrações montadas por
    `assemble_sql.mjs` (0 avisos de validação — placeholders/gravidade/aspas OK em todos os 635 itens).
    Snapshot durável em `.curadoria-rnc-wip/` (gitignored). Workflow runId `wf_293f2f56-83d`.
  - ✅ **8 módulos VERIFICADOS commitados** (526 itens): `0039` Segurança (153) · `0040` Transversal (110) ·
    `0041` Civil (55) · `0042` Eletromecânica (42) · `0043` Elétrica (50) · `0044` Comissionamento (42) ·
    `0046` Linhas de Transmissão (41) · `0047` Telecom (33). **Usuário aplica no SQL Editor.**
  - ✅ **Edificações (`0045`, 93 itens) + Reformas (`0048`, 16 itens) verificados e commitados** — workflow
    100% concluído (82/82 checklists, 635 itens, 0 erros na última passada).
  - ✅ **CURADORIA COMPLETA:** 83/83 checklists do catálogo padrão curados (CV‑02 na 0038 + 0039–0048).
    **Aplicar no Supabase (super_admin), em ordem:** `0038`→`0048`. Depois, catálogo 100% item‑específico.
  - **Citações removidas pela verificação** (amostra): NR‑12 em rigging ST‑04 (mantida NR‑11); "1 bebedouro/25"
    indevido à NR‑24 (ST‑06); "Anexo II" incerto da NR‑33 (ST‑07); NR‑20 duvidosa (MA‑02); NR‑12/NR‑18 fora de
    escopo em içamento (ST‑09/ME‑03); NR‑7/PCMSO em vacinação (SO‑01).

### 📋 FILA v1.1+ (ordem acordada 2026‑07‑13)
1. ✅ **Marco K — ABSORVIDO pela RNC + K1/K2 entregues e VERIFICADOS ao vivo**
   (commits `ca5c166` + fix `955aefb`). **K2** verificado como admin: toggle
   persiste/reflete o estado, sem bounce (fix do `buscarEmpresa` incluir `ia_habilitada`
   + `patchEmpresa`), com aviso de termos. **K1** verificado no banco: RNC‑2026‑0009
   (item de catálogo com texto‑base) gerou linha em `ia_uso` — `modelo claude-haiku-4-5`
   (secret `RNC_AI_MODEL`), 1009/700 tokens, custo est. $0.00361 (tarifa Haiku confere),
   `sucesso=true`. A
   argumentação de NC por IA (infra Anthropic, contexto normativo, campo separado
   editável, fallback silencioso, exibição em relatório) já era coberta pelo módulo RNC.
   Extraídos os transversais que faltavam: **K1** — `ia_uso` (métrica de tokens/custo por
   empresa, base do premium; migração `0036`) + captura na `rnc-generate`; **K2** —
   `empresas.ia_habilitada` (migração `0037`) + gate na função + tela admin **ConfigIA**
   (toggle + aviso de responsabilidade/termos, sinalizando redação jurídica). *(K3 —
   "argumentar" inline na NC sem RNC formal — fica opcional no backlog.)*
2. **Validação dos textos‑base da RNC** — revisão de conteúdo/curadoria dos textos‑base do
   catálogo padrão (a base já está 100% coberta; falta o passe editorial de qualidade).
3. ✅ **RF19 — 6 views SQL de leitura ENTREGUES** (migração `0049`, commit `199483e`):
   `vw_conformidade_obra`, `vw_nc_por_item`, `vw_tempo_tratamento`, `vw_desempenho_contratada`,
   `vw_nc_prazo`, `vw_nc_por_inspetor` — RLS‑safe (security_invoker + `empresa_do_usuario()`),
   grant a authenticated. Dashboard fia `vw_conformidade_obra` (card "Conformidade por obra · view BI").
   Camada de cálculo reutilizável (princípio c) e fundação da detecção do **Marco L**. **Aplicar `0049`.**
   *(v1.1: conexão externa Power BI/Looker direta exige papel de banco + tenant scoping.)*
4. **Marco G** — Internacionalização (i18n): interface + exportações multilíngues.
5. **Marco L** — Assistente de Alertas Inteligentes (IA analítica sobre eventos) —
   **implementar após o Marco K** (reutiliza infra/secrets/salvaguardas do K).

*(Backlog de plataforma — self‑signup/convites/Stripe‑Pix/plan‑gating — segue como
prioridade de negócio pós‑MVP, ver [[product-ownership]].)*

## 🎯 DIRETRIZ PERMANENTE — Arquitetura orientada a dados e IA (2026‑07‑13)

O FieldCheck evoluirá para uma **plataforma de gestão inteligente** onde módulos
futuros (Planejamento, Suprimentos, Financeiro/Medições, Documentos) e camadas de
IA (previsões, análises, assistentes) consomem os dados uns dos outros. **Toda
funcionalidade nova deve obedecer a estes princípios** (também no `ESPECIFICACAO.md`):
- **(a) Trilha de eventos:** todo evento relevante é registrado com timestamp,
  autor, entidade vinculada e contexto — nada de estados que sobrescrevem histórico
  sem trilha (o padrão do ciclo de NC/auditoria vira regra geral).
- **(b) Eixos estáveis:** entidades conectáveis por chaves estáveis — **obra,
  contratada, item de checklist, item de cronograma/EAP, inspetor** — são os eixos
  pelos quais qualquer módulo/IA cruzará dados. Novos recursos vinculam seus
  registros a esses eixos, nunca a texto solto.
- **(c) Cálculos em views/consultas nomeadas e reutilizáveis** (não embutidos em
  telas) — o relatório preditivo (melhoria 6) é o primeiro consumidor.
- **(d) Núcleo × módulos** preservado — menu e código organizados para receber
  módulos habilitáveis por empresa.
- **(e)** Ao planejar cada marco, incluir uma linha **"Prontidão para IA/dados"**
  avaliando se a modelagem atende a–c.

## 🚧 MELHORIAS PRÉ‑v1.0 (aprovadas 2026‑07‑13) — plano

Ordem sugerida (esforço × impacto): **1 → 2 → 5 → 3 → 4‑núcleo → 6‑MVP.**

1. ✅ **FECHADO — BUG upload de logo.** Causa real: **`upsert: true`** no `storage.upload`
   (o Storage avaliava o caminho de UPDATE no RLS e negava, mesmo com papel=admin,
   empresa e policy corretos). Fix: remover o upsert (path já único por timestamp).
   Extra: `logo.ts` parou de **mascarar** o erro real; auditoria confirmou **fonte de
   papel única** (`useAuth` `perfil.papel`). *(diagnóstico histórico abaixo.)* Erro é RLS do
   Storage (msg de `logo.ts:70`), não checagem de tela. Suspeita nº1: **policies
   `logos_insert/update/delete` da 0022 não aplicadas** → RLS nega todos. Confirmar
   via `pg_policies` (devem ser 3) + papel real no banco. Correção: re‑aplicar as 3
   policies → migração `0030_fix_logos_policies.sql`. Teste: admin sobe/troca/remove;
   gestor/inspetor bloqueados.
2. ✅ **FEITO — Bird "N/A" + justificativa obrigatória** (migração `0031` aplicada). Migração `0031`: add
   `'na'` ao check de `respostas.classificacao_st` + coluna
   `classificacao_st_justificativa`; trigger exige justificativa quando `='na'`. UI
   Execucao: botão N/A → caixa de argumento obrigatória. `piramideBird`/`ncKpis`
   ignoram `'na'` na pirâmide, mantêm nos demais KPIs. Justificativa no detalhe/relatórios.
3. ✅ **FEITO — Exportação de RNC** (commit `cfbc236`; `RelatorioRnc.tsx` + botão na TelaRnc;
   `exportarRncsXLSX` + botão no PainelNc). PDF individual (reusa `CabecalhoRelatorio`
   + rodapé FieldCheck + seções RNC + fotos + histórico `nc_transicoes` + assinaturas,
   via print) + xlsx em lote da lista filtrada (reusa `exportacoes.ts`). Sem migração.
4. **Referência a item de cronograma/EAP** — esforço **G**. **Faseado:**
   - ✅ **FEITO — Núcleo v1.0 (a, b‑livre, e)** (migração `0032`; commit `3c95f58`):
     `inspecoes.ref_cronograma_codigo` (+ índice); campo de código livre (opcional) na
     NovaInspecao; exibido no Detalhe; filtro na TelaObra; coluna na exportação xlsx.
     Eixo estável (princípio b) desde já.
   - **v1.1 (c, d, b‑autocomplete):** entidade `eap_itens` (obra_id, codigo, descricao,
     nivel, pai) + import por planilha (modelo/dedup/relatório) + autocomplete + visão
     **"Histórico do item"** (cronologia de inspeções/NCs/tratamentos + PDF dossiê + xlsx).
5. ✅ **FEITO — Múltiplas fotos (até 10) por registro** (commit `5f4c234`; sem migração, modelo já suportava). Modelo **já suporta N
   evidências** por resposta/evento — limite é a UI. Captura até 10 na Execucao + no
   tratamento/fechamento de NC; galeria com remoção antes de salvar; 1 evidência/foto;
   grade de miniaturas no detalhe/PDF; mantém compressão + fila de sync. Migração: talvez
   só guard `≤10`.
6. ✅ **FEITO — Relatório preditivo "banco de experiência" (MVP)** (migração `0033`; commit `54aea6b`;
   funções SQL `experiencia_itens_nc` + `experiencia_tempo_tratamento`; `TelaBancoExperiencia` na Home).
   **Relatório gerencial preditivo ("banco de experiência")** — esforço **GG**. **Corte MVP:**
   - **MVP v1.0:** **views SQL nomeadas** (taxa de NC por item de checklist, reincidência,
     tempo médio de tratamento por criticidade, com **tamanho de amostra**) + tela de
     ranking (freq de NC "baseado em N inspeções", reincidência, tempo médio); filtros
     obra + período. É a **fundação do módulo de IA** (princípio c).
   - **v1.1:** taxa por item de **cronograma** (depende da EAP/melhoria 4), tendências
     temporais, ranking de risco freq×criticidade, filtros inspetor/contratada/módulo, PDF.
>
> **Fechamento v1.0:** após as melhorias → selo **v1.0** no login/perfil + bump + push.

## ✅ CORREÇÃO PRIORITÁRIA — RNC sem texto-base (CONCLUÍDA 2026‑07‑13)

**Status:** ✅ **passo 2** (arquitetura — RNC sempre possível; commit `97eca08`, migração `0034`,
`rnc-generate` deployada) · ✅ **passo 4** (texto-base opcional em checklists personalizados;
commit `71f5ff6`, migração `0035`, redeployada) · ✅ **passos 1/3** (diagnóstico rodado no
Supabase → **"No rows returned"**: catálogo padrão 100% coberto por texto-base; geração dispensada)
· ✅ **passo 5** (validado em produção: 2 RNCs geradas sem texto-base na inspeção EM-P01, checklist
personalizado — abriram em branco para preenchimento manual; caminho com texto-base seguia OK).
Migrações `0033`, `0034`, `0035` aplicadas. **Nenhuma pendência.**

**RNC bloqueada por item sem texto‑base** — bug de teste + falha de projeto (corrigir na raiz).
Ao gerar RNC de certos itens: *"Sem texto‑base cadastrado para este item."* e a RNC **não é criada** (bloqueio total). O texto‑base deve ser **conveniência (pré‑preenchimento), nunca pré‑requisito**.

**Diagnóstico (código):** o bloqueio está na Edge Function `rnc-generate/index.ts`:
- `linha 100`: `if (!base) return json({error:"Sem texto‑base cadastrado para este item."},400)` — texto‑base (`rnc_textos_base`, chave `checklist_codigo`+`item_numero`) é **pré‑requisito**.
- `linha 108`: `if (!modelo_id) return … "Sem modelo de RNC para este checklist."` — **2º bloqueio**: sem vínculo em `rnc_modelo_checklists` também falha. Checklists **personalizados** (Marco E) nunca têm nem texto‑base nem modelo → **sempre bloqueados**. Itens do catálogo padrão sem texto cadastrado → idem.
- Agravante estrutural: `rncs.modelo_id` é `not null references rnc_modelos` → não basta remover o `if`; é preciso um **modelo padrão/fallback** (ou tornar a coluna nullable) para inserir a RNC sem modelo específico.

**Plano (apresentado; executar depois das ações de hoje):**
1. **Diagnóstico da base:** rodar a query (agrupa itens do padrão sem texto‑base por checklist/módulo, com contagem + ordens) para dimensionar a lacuna:
   ```sql
   select c.modulo, c.codigo, c.nome, count(*) sem_base,
          array_agg(i.ordem order by i.ordem) itens
   from public.itens_checklist i join public.checklists c on c.id=i.checklist_id
   left join public.rnc_textos_base tb on tb.checklist_codigo=c.codigo and tb.item_numero=i.ordem
   where c.empresa_id is null and tb.checklist_codigo is null
   group by c.modulo,c.codigo,c.nome order by c.modulo,c.codigo;
   ```
2. **Arquitetura — RNC sempre possível** (rnc‑generate): (a) remover o bloqueio de texto‑base **e** o de modelo; (b) **com** texto‑base → comportamento atual (pré‑preenchido/IA, editável); (c) **sem** texto‑base → RNC criada com `secoes_final` **em branco** (pula IA/interpolação) → TelaRnc abre o formulário em branco, com **aviso discreto** ("item sem texto‑base — preencha a descrição"), não erro; (d) mesmo fluxo p/ catálogo padrão E personalizados. **Resolver o `modelo_id` not null:** seed de um **modelo genérico** (fallback quando não há vínculo) ou tornar a coluna nullable (decidir na execução).
3. **Completar a base (geração pelo Code + validação):** (a) gerar textos‑base p/ todos os itens do padrão sem texto (do diagnóstico), no padrão de redação existente (linguagem de fiscalização, fundamentado no critério + NRs/referências do checklist, sem inventar citações; sem norma → boas práticas); (b) entregar **relatório xlsx de validação** — colunas: Módulo · Checklist (código+nome) · Item · Critério existente · Referência do checklist · Texto‑base proposto · **Validação** (vazia) · **Observações/Correção** (vazia); (c) usuário revisa → devolve → aplico correções → migration/seed **só com aprovados**; (d) nada em produção sem esse ciclo (conteúdo técnico com responsabilidade de fiscalização).
4. **Checklists personalizados (Marco E):** campo **opcional** "texto‑base para RNC" por item no criador; quem não preencher cai no fluxo manual (2c). Orientação no formulário.
5. **Regressão:** RNCs já geradas intactas; fluxo com texto‑base existente idêntico. **Teste final:** gerar RNC de (i) item com texto‑base, (ii) item do padrão sem texto‑base, (iii) item de checklist personalizado — os **três criando a RNC com sucesso**.
> **Prontidão IA/dados:** a RNC vira registro completo mesmo sem texto‑base (eixo `resposta_item_id`/`checklist_codigo`/`item_numero` preservados); o texto‑base é camada de conveniência sobre os eixos.

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
> **✅ CONCLUÍDO — Módulo RNC (pacote de melhorias, 2026‑07‑09/10):** Relatório de Não
> Conformidade pré‑preenchido por IA a partir de item reprovado. **R1–R5 concluídos**;
> R1–R4 publicados na Vercel (`026d23e` + fix `942f9f7`). **R5:** lógica pura extraída
> p/ `functions/rnc-generate/logica.ts` (testável); testes `rncLogica.test.ts`
> (interpolação 26 placeholders com/sem projeto‑ref, gravidade, parse IA/fallback) +
> `rncSeed.test.ts` (contagens/integridade do xlsx) — **89 testes verdes, build ok**;
> RLS validado ao vivo (anon bloqueado em ref/rncs); `docs/rnc-module.md` com mermaid +
> receitas manuais (RLS multi‑tenant, e2e). ⚠️ **redeploy** da função pendente (sincroniza
> o refactor + leitura de `RNC_AI_MODEL`): `supabase functions deploy rnc-generate`.
> - **Backend ao vivo:** migrações `0023` (DDL+RLS+sequência) e `0024` (seed: 643
>   textos‑base · 9 modelos · 83 vínculos · 12 seções · 26 placeholders) aplicadas via
>   `scripts/apply-migration.js` (usa `pg` + `SUPABASE_DB_URL` do `.env`, pooler de
>   sessão). Edge Function `rnc-generate` deployada; secrets `ANTHROPIC_API_KEY` +
>   `RNC_AI_MODEL` (a função lê `RNC_AI_MODEL`, fallback `claude-sonnet-4-6`).
>   ⚠️ **Lembrete:** a função foi ajustada p/ ler `RNC_AI_MODEL` DEPOIS do 1º deploy —
>   confirmar que o **redeploy** (`supabase functions deploy rnc-generate`) foi feito.
> - **Decisões:** RNC **manual** (nunca automática) · **coexiste** com o ciclo antigo
>   `eventos_nc` ("Registrar Tratamento" = ciclo operacional/KPIs/Bird; "Gerar/Abrir
>   RNC" = documento formal com workflow próprio) · gravidade ISO (critica/maior/
>   menor/observacao) com mapa → criticidade do Marco I · seed como migração SQL.
> - **Frontend:** botão Gerar/Abrir RNC no card da NC (Detalhe), selo de status da RNC,
>   `TelaRnc` (12 seções), fila offline (`rnc_pendentes`, drena no reconnect), diálogo
>   "gerar todas" ao finalizar. Sem duplicar RNC por resposta.
> - ⚙️ **Método (lição do build):** validar SEMPRE com `npm run build` (= `tsc -b`,
>   estrito com noUnusedLocals) — `vite build`/`tsc --noEmit` sozinhos NÃO pegam tudo.
>
> **PENDÊNCIA — Marco K (argumentação de NC por IA):** adiado a pedido do usuário
> (2026‑07‑09), fica na fila **junto com o Pix** para retomar depois. Ao iniciar:
> apresentar plano testável ANTES de codar; o usuário fornecerá o texto dos termos
> legais/consentimento. Escopo já descrito na seção "Marco K" abaixo.
> **Nota:** o módulo RNC (acima) entregou boa parte do que o Marco K previa (IA na NC),
> mas como DOCUMENTO formal — revisar se o Marco K ainda é necessário ou foi absorvido.
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
> **NA FILA (apresentar plano testável ANTES de codificar cada um):**
> ✅ Marco H (recuperação de senha) · ✅ Marco I (criticidade + prazo da NC) ·
> ✅ Marco J (Relatório Geral + identidade + assinatura) · ⏸️ Marco K
> (argumentação IA nas NC) — **adiado junto com o Pix**.
>
> **🆕 FILA APROVADA (2026‑07‑09) — Módulo RNC entrou primeiro (✅ concluído).
> Ordem escolhida (2026‑07‑10): fazer RF13+B‑e ANTES do RF12 (que espera Firebase):**
> 1. ✅ **Push nativo + web (RF12)** — CÓDIGO COMPLETO (2026‑07‑11). Escopo aprovado:
>    **nativo (Android/iOS via Capacitor) + web push (Firebase Messaging)** e **opt‑out
>    por usuário (M6)**. Entregue: M1 migração `0026_push_tokens.sql` (tabela + RPCs
>    registrar/remover + coluna `usuarios.notif_push`); M2 cliente `src/lib/push.ts`
>    (ramo nativo/web, imports dinâmicos), `public/firebase-messaging-sw.js`, registro
>    no login + tap‑to‑open (`?nc=`), toggle em `TelaPerfil`; M3 Edge Function
>    `enviar-push` (FCM HTTP v1, OAuth2 service account, poda token inválido); M4
>    migração `0027_push_trigger.sql` (trigger statement em `notificacoes` → pg_net);
>    M5 migração `0028_prazos_job.sql` (`notificar_prazos()` + cron); M6 opt‑out (server
>    filtra por `notif_push`). Deps: `@capacitor/push-notifications@6` + `firebase@11`.
>    **Guia da SUA parte: `docs/push-firebase-setup.md`** (criar projeto Firebase,
>    google-services.json, `.env` VITE_FIREBASE_*, VAPID, service account nos secrets,
>    aplicar 0026/0027/0028, `push_config`, deploy `enviar-push`, rebuild APK).
>    Validado: typecheck + 93 testes + build verdes. **PENDENTE (você):** setup Firebase
>    + rebuild do APK para testar no celular.
> 2. ✅ **Relatório semanal por e‑mail (RF17)** — Edge Function `relatorio-semanal`
>    (agrega 7 dias/empresa: inspeções, %conf, NCs abertas/vencidas por criticidade,
>    top obras) → **Resend API** p/ gestores/admins. Migração `0025` (pg_cron+pg_net).
>    Setup em `docs/relatorio-semanal-setup.md` (secrets, deploy `--no-verify-jwt`,
>    `cron.schedule` seg 08:00 BRT). **⚠️ sua parte p/ validar:** domínio verificado no
>    Resend + `RESEND_API_KEY`/`RESEND_FROM`/`CRON_SECRET`/`APP_URL` + aplicar 0025 +
>    agendar. Sem opt-out por usuário nesta versão (envia a todos gestor/admin).
> 3. ✅ **Dashboard executivo in‑app (RF13)** — `TelaDashboard` (gestor/admin, entrada
>    na Home): KPIs + NCs por criticidade + Pirâmide de Bird + por obra + painel por
>    contratada (B‑e) + filtro de período; lê do Dexie (offline), sem PDF.
> 4. ✅ **Reincidência por contratada (B‑e)** — lib pura `reincidencia.ts` (ranking:
>    NCs/abertas/vencidas/reincidências=itens com ≥2 NCs/tempo médio) + testes;
>    renderizada no dashboard RF13.
>
> **✅ MIGRAÇÕES APLICADAS e validadas ao vivo:** `0021_criticidade_prazos.sql`
> · `0022_branding_assinatura.sql` (2026‑07‑09) · `0023_rnc_module.sql` · `0024_seed_rnc.sql`
> (2026‑07‑09/10 — RNC no ar). **Pendente aplicar:** `0025_cron_extensions.sql` (pg_cron+pg_net, RF17).
>
> **⏸️ ONDE PARAMOS (fim de sessão 2026‑07‑10):**
> - **Concluídos e commitados** (branch `master`): Módulo RNC (R1–R5), RF13 (dashboard
>   executivo in‑app), B‑e (reincidência por contratada), RF17 (resumo semanal por e‑mail).
> - **⚠️ ~5 commits SEM PUSH** — o usuário dá `git push` para publicar na Vercel (traz
>   RNC‑R5 + Dashboard + reincidência; RF17 é edge function, não vai no bundle web).
> - **Único item restante da fila:** **RF12 (push nativo)** — BLOQUEADO no setup Firebase/FCM
>   do usuário. Quando retomar: eu entrego o **guia Firebase passo a passo** + construo todo
>   o código (push_tokens · plugin cliente · `enviar-push` FCM v1 · disparo pg_net · job de
>   prazos · pref/validação). Plano detalhado já está no item 1 da FILA acima.
> - **Validações ao vivo pendentes do usuário** (não bloqueiam código): (a) push + testar
>   RF13/Dashboard e a RNC no app publicado; (b) redeploy `rnc-generate` (sincroniza refactor
>   R5 + lê `RNC_AI_MODEL`); (c) RF17 → verificar domínio Resend, secrets, aplicar 0025,
>   deploy `--no-verify-jwt`, agendar cron (ver `docs/relatorio-semanal-setup.md`).
>
> **⏸️ ONDE PARAMOS (fim de sessão 2026‑07‑11):**
> - **RF12 (push nativo + web) — CÓDIGO COMPLETO e commitado** neste fim de sessão.
>   Escopo: nativo (Capacitor) + web push (Firebase Messaging) + opt‑out por usuário (M6).
>   Arquivos: `0026_push_tokens.sql`, `0027_push_trigger.sql`, `0028_prazos_job.sql`,
>   `supabase/functions/enviar-push/`, `src/lib/push.ts`, `public/firebase-messaging-sw.js`,
>   toque + registro em `AppShell.tsx`, toggle em `TelaPerfil.tsx`, `desativarPush` no
>   logout (`AuthProvider.tsx`), tipos/ícones dos novos tipos de notificação. Validado:
>   typecheck + 93 testes + build. **SUA PARTE p/ ativar:** seguir `docs/push-firebase-setup.md`
>   (projeto Firebase, google-services.json, `.env` VITE_FIREBASE_* + VAPID, service account
>   nos secrets `FCM_*` + `CRON_SECRET`, aplicar 0026/0027/0028, `push_config`, deploy
>   `enviar-push --no-verify-jwt`, rebuild do APK). Enquanto `push_config` vazia → só o sino.
> - **⚠️ commits SEM PUSH** — você dá `git push` para publicar (RF12 é web+edge+migrações).
> - **FRENTES EM ABERTO p/ próxima sessão** (levantadas 2026‑07‑11):
>   1. **Monetização/go‑live:** Stripe Checkout ao vivo (criar conta + deploy functions +
>      secrets) · **Pix** (travado no CNAE + habilitar no Stripe → `PIX_HABILITADO`) ·
>      **Marco K** (argumentação de NC por IA, adiado junto do Pix).
>   2. **Spec ainda aberta:** **RF19** (views SQL de leitura p/ BI — não iniciado) ·
>      **opt‑out do e‑mail semanal** (RF17 envia a todos; espelhar `notif_email` no padrão do RF12).
>   3. **Dívida técnica:** code‑splitting do bundle (`index` 710 kB, `xlsx` 429 kB) ·
>      confirmar cobertura do Marco E (criador de checklist custom, kits, referência de projeto).
> - **Recomendação de próximo código:** RF19 ou opt‑out do e‑mail (isolados, sem dependência
>   externa) — apresentar plano antes de codar. Monetização como bloco à parte no go‑live.

> **⏸️ ONDE PARAMOS (fim de sessão 2026‑07‑13):**
> **Feito nesta sessão (checkpoints LOCAIS, sem push):**
> - ✅ **Item 1 (code‑splitting)** — `App`/`AppShell` com `React.lazy`+`Suspense` por rota/tela +
>   `vendor-react`; bundle inicial **204→154 kB gzip**; offline preservado. Commit `8403dfc`.
> - ✅ **Item 2 (layout responsivo desktop)** — frame `.fc-screen`(560)/`--wide`(1180), escala
>   de botão/título ≥1024px, grades em home/obra/dashboard; **mobile intocado**. Verificado ao
>   vivo em 1920 (home/obra/exec/dashboard/admin/login). Commit `8403dfc`.
> - ✅ **RF12 WEB PUSH — NO AR e VALIDADO ponta a ponta.** Firebase `fieldcheck-57888`; secrets
>   `FCM_*`+`CRON_SECRET`, `enviar-push` deployada, `push_config` populada, cron agendado (job 1),
>   trigger `0027` ligado. Prova: SW cria a notificação com aba oculta (`enviados:1`, banner OK).
>   Fix da chave (`atob`/PEM) + try/catch + `diag` na função → commit `3110893`. Ver [[rf12-push-estado]].
> - **⚠️ 2 commits locais SEM PUSH:** `8403dfc` + `3110893` (sobem no fechamento do v1.0).
>
> **📋 PRÓXIMOS PASSOS (ordem):**
> 1. **Item 3 — opt‑out do e‑mail semanal** *(plano aprovado pendente de codar)*: migração
>    `0029_notif_email.sql` (coluna `usuarios.notif_email` + RPC `definir_pref_email`) · 2º toggle
>    no card Notificações da `TelaPerfil` · filtro por `notif_email` no `emailsGestores` da
>    `relatorio-semanal` (+ redeploy) · tipo `Usuario.notif_email?`. Aceite: desmarcar → não recebe.
> 2. **Fechar v1.0:** versão **v1.0 visível no login e no perfil** + atualizar `PROGRESSO.md` +
>    **`git push` de tudo** (itens 1+2+3 + fix do push).
> 3. **Push NATIVO (APK) — parte do usuário:** `npx cap sync android` + build no Android Studio +
>    instalar + Perfil→Ativar + testar (mesmo curl da `enviar-push`). `android/` já pronto
>    (google‑services.json + Gradle OK). Web push já validado.
> 4. **Validações ao vivo pendentes anteriores** (se ainda valem): RF17 (domínio Resend/secrets),
>    redeploy `rnc-generate`.
> - **v1.1+ (adiado):** Marco K (IA nas NC), RF19 (views BI), Marco G (i18n), go‑live Stripe/Pix.

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

### Marco G — Internacionalização (i18n): interface e exportações multilíngues

> ⏸️ **NÃO INICIADO — re‑registrado em 2026‑07‑12** (definido em conversa anterior,
> não constava neste arquivo). Entra na fila da v1.0 a definir com o usuário.

- **(a) Interface multilíngue:** **PT‑BR nativo** + **EN** + **ES**. Toda string de
  UI extraída para **arquivos de tradução** (i18n) — sem texto fixo no código; base
  para adicionar novos idiomas depois.
- **(b) Idioma por empresa e por relatório:** a empresa define o **idioma padrão**
  (config admin); cada **relatório/exportação** pode **sobrescrever** o idioma na
  emissão (ex.: relatório em EN para um cliente estrangeiro, com a UI em PT‑BR).
- **(c) Exportações multilíngues (PDF e xlsx):** cabeçalhos, rótulos, títulos de
  seção e legendas respeitam o idioma escolhido; **datas e números localizados**
  (formato pt‑BR/en/es) nos relatórios por inspeção, por obra e Geral.
- **(d) Seleção e persistência:** troca de idioma pelo usuário/empresa, persistida;
  fallback para PT‑BR quando uma chave não existir na tradução.

**Avaliar no plano do Marco G:**
- **Biblioteca i18n** (ex.: `i18next`/`react-i18next`) vs. solução própria leve —
  impacto no bundle (já sob atenção por causa dos 710 kB).
- **Cobertura das exportações:** os geradores de PDF (print) e **xlsx** precisam
  receber o `locale` do recorte; revisar `exportacoes.ts` e os componentes de
  relatório para parametrizar idioma + formatação de data/número.
- **Migração de dados:** idioma padrão da empresa (novo campo em `empresas`) e,
  se aplicável, idioma escolhido na emissão de cada relatório.

### Marco H — Recuperação de senha (+ troca pelo usuário logado)

- Fluxo **"Esqueci minha senha"** no login via reset nativo do Supabase Auth
  (`resetPasswordForEmail`): e‑mail → link → tela de redefinição → confirmação.
- **Template de e‑mail em português** com identidade FieldCheck; **Redirect URL**
  configurada (mesmo alicerce que destrava a confirmação de e‑mail do onboarding).
- Incluir **troca de senha pelo usuário logado** (tela de perfil).

### Marco I — Evolução do modelo de NC: criticidade e prazo estruturados
*(pré‑requisito do Marco J — relatórios)*

> ✅ **CONCLUÍDO (I1–I7).** Migração **`0021_criticidade_prazos.sql`** escrita —
> **aplicar no SQL Editor** (adiciona `eventos_nc.criticidade` + `empresas.prazos_nc`).
> Entregue: lib `criticidade.ts` (rótulos/cores/prazo sugerido/vencida); regra de
> finalização exige criticidade+prazo em toda NC; seletor de criticidade na execução
> com auto‑sugestão de prazo (editável); tela admin **Prazos de NC** (⏱, config por
> criticidade, salva em `empresas.prazos_nc`); selo de criticidade + chip **Vencida**
> no detalhe, com **reclassificação por gestor/admin** (LWW via fila offline); painel
> de NCs com **filtro por criticidade**, contagem de vencidas e destaque; criticidade
> + coluna **Vencida** nas exportações XLSX e no relatório da obra. 72 testes verdes,
> typecheck e build OK. **Round‑trip offline→servidor** coberto (stripEvento/leitura).

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

> ✅ **CONCLUÍDO (J1–J8) · migração 0022 APLICADA e validada ao vivo (2026‑07‑09).**
> `0022_branding_assinatura.sql` (`empresas.logo_url`, bucket público **`logos`** com
> RLS de escrita só do admin — confirmado que bloqueia não‑admin, `inspecoes.assinatura`).
> Entregue: lib `logo.ts` (otimiza
> raster→PNG ≤480px, valida ≤2 MB) + tela admin **🎨 Identidade visual** (upload/
> preview/remover); componente compartilhado **`CabecalhoRelatorio`** (logo + empresa
> + inspetor) e **rodapé FieldCheck** discreto, aplicados ao relatório por obra e ao
> Geral; **assinatura do inspetor** por canvas na finalização (offline, viaja com a
> inspeção; bloco de assinaturas no relatório); **datas de origem** explícitas no
> painel/detalhe/relatórios; **Relatório Geral** (gestor/admin, empresa+período): capa,
> sumário executivo, NCs por criticidade, pirâmide de Bird, tabela por obra, anexo de
> NCs críticas/vencidas; **exportações** PDF (print) + **XLSX consolidado** (abas
> Resumo/Por_obra/Por_criticidade). 74 testes verdes, typecheck e build OK. Escopo:
> PDF por inspeção individual ficou p/ marco próprio (decidido com o usuário).

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

> ✅ **RESOLVIDO 2026‑07‑13 — absorvido pelo módulo RNC + K1/K2 (commit `ca5c166`).**
> Itens (a)–(d) e (f) já entregues pela `rnc-generate` (IA Anthropic, contexto
> normativo, `secoes_agente`×`secoes_final` editável, `origem_ia`, fallback silencioso,
> exibição no PDF). Faltavam só os transversais, agora feitos: **K1** = `ia_uso`
> (métrica por empresa) + captura de tokens; **K2** = `empresas.ia_habilitada` + gate +
> tela `ConfigIA` (item (e): toggle por empresa + aviso de termos/responsabilidade). Não
> reimplementar como spec original. Spec abaixo mantida como referência histórica.

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

### Marco L — Assistente de Alertas Inteligentes (IA analítica sobre eventos)

> ⏸️ **REGISTRADO 2026‑07‑13 — implementar APÓS o Marco K + a melhoria 6 (views
> analíticas).** Consumidor direto das views do item 6 e dos eixos da diretriz de
> arquitetura orientada a dados/IA. É a base do futuro add‑on premium **"FieldCheck
> Inteligente"**.

- **(a) Arquitetura em duas camadas:**
  - **Detecção (regras SQL determinísticas)** sobre as views analíticas, **sem IA** —
    atraso, prazo vencendo, reincidência, degradação de contratada, concentração de
    NCs por item de EAP. Alerta simples funciona mesmo sem IA.
  - **Interpretação (Edge Function `ia-alertas`)** chamando a API da Anthropic —
    **reutiliza infra, secrets e padrões do Marco K**.
- **(b) Fluxo do digest:** gatilho agendado (**cron semanal padrão; diário
  configurável por empresa**) → function consulta as views e monta um **pacote de
  fatos estruturados** (números **exclusivamente do banco**: contagens, taxas vs.
  média, tendências, amostras) → envia ao Claude com instrução de **analisar,
  priorizar, explicar em linguagem de gestão e recomendar ações** → resposta vira
  **alerta inteligente** pelos canais existentes (**sino, push, e‑mail** gestor/admin).
- **(c) Gatilhos excepcionais:** regra de **condição crítica aguda** (ex.: NC crítica
  vencida + reincidente na mesma frente) pode acionar **análise pontual imediata** —
  lista configurável, começando conservadora.
- **(d) Salvaguardas (herdadas do Marco K):** prompt instrui a IA a raciocinar **só
  sobre os fatos fornecidos** (sem inventar números/normas/causas); todo alerta exibe
  os **dados‑fonte + tamanho de amostra** junto da análise; flag **`origem_ia`** +
  trilha de auditoria; rodapé *"análise gerada por IA como apoio à gestão — validação
  humana recomendada"*; **indisponibilidade da IA não bloqueia** (a camada de detecção
  continua alertando de forma simples).
- **(e) Controles por empresa:** habilitar/desabilitar; frequência do digest;
  **contador de chamadas para custeio** (base do add‑on premium).
- **(f) Prontidão para IA/dados:** consumidor direto das views (melhoria 6) e dos
  eixos da diretriz permanente — **qualquer lacuna de modelagem encontrada ao
  implementá‑lo corrige‑se na origem (views), não se contorna na function.**
