# FieldCheck — Status Consolidado

> Reancoragem no **estado real** (código + migrations + histórico de commits), não na memória de conversa. Gerado em 2026-07-22. Onde não há evidência verificável a partir do repositório/banco, está marcado **(a confirmar)**.
>
> **Base:** branch `master` (produção); working tree limpo, sincronizado com `origin/master`. Último commit: `d0c6f8c`. **64 migrations** (`0001`→`0064`).
>
> **Branches locais obsoletas** (não são trabalho em andamento): `feature/planos-onda1` (já mergeada na master) e `claude/busy-bose-6b6184` (stale). Todo o trabalho relevante está em `master`.

---

## Seção 1 — Marcos / lotes por status

### 🟢 EM PRODUÇÃO (na master / no ar)

| Item | Descrição (1 linha) | Evidência |
|---|---|---|
| Base v1.0 (MVP) | Inspeções, checklists, NC/ciclo, RNC, Bird, offline, push, BI | migrations `0001`–`0053`; tag v1.0 no histórico |
| Catálogo v2 | 83 checklists / 643 itens / 9 módulos + curadoria RNC | `0019`, `0024`, `0038`–`0048` |
| **Monetização Onda 1** | 3 planos (Basic/Premium/Intelligence) + enforcement + checkout multi-tier | `0054`–`0058`; commits `e8bec8b`, `8b376a7`, `d0a278a` |
| Pagamentos LIVE mode | Virada test→live; smoke real aprovado (compra + churn) | commit `625be6b`; `criar-checkout`/`stripe-webhook` |
| Fix dupla cobrança | Webhook ignora `incomplete`; UI "ativando…"; idempotência no checkout | commit `5684a9a` |
| Relatório de funcionalidades | Doc de produto (comercial/manual) | `docs/RELATORIO_FUNCIONALIDADES_COMPLETO.md` (`31ca883`) |
| **Marco M — M-1** (registro de desvio) | Desvio avulso offline na base da Bird | `0059`; `NovaDesvio.tsx`; commit `da686cb` |
| **Marco M — M-2** (triagem por IA) | Edge `ia-triagem-desvio`; contrato K/L; selo "IA · revise" | `0060`; `ia-triagem-desvio/index.ts`; commit `8240bae` |
| Triagem prompt v2 + Sonnet | Catálogo NR+NBR curado, PGR≠PPRA; `prompt_version` no metering | `0061`; commits `aff14b8`, `6b90879` |
| Fix CHECK `ocorrencias_tipo_chk` | Reafirma os tipos da base da Bird (0059 aplicada parcial em prod) | `0062`; commit `edfbbf1` |
| Desvios nos relatórios | `SecaoDesvios` em Geral, Obra (PDF), TelaObra, Dashboard | commits `df21ce4`, `9d0f702` |
| Editar/excluir desvio (soft delete) | Edição + exclusão auditável (`excluido_em`) | `0063`; commit `4995b73` |
| **Entrega C — painel de erros de sync** | Faixa tocável, diagnóstico por item, tentar/descartar, robustez do flush | commit `134c04c`; ver Seção 2.1 |
| **Marco M — Fase 3a** (promover desvio a NC) | Inspeção sintética; `origem_desvio_id`; trigger de fotos | `0064`; commit `d27eb31`; ver Seção 2.2 |
| Melhorias de RNC | RNC de desvio herda a triagem; save com fila offline; toast fixo | commits `fc63d29`, `3d4e8b9` |
| Filtro "RNCs geradas" | Toggle no Painel de NCs listando RNCs + status do tratamento | commit `d0c6f8c` |

### 🟡 EM ANDAMENTO (parcial / não finalizado)

| Item | Situação | Evidência |
|---|---|---|
| — | **Nada em andamento no código.** Todo lote recente está mergeado em `master`. | `git status` limpo; sem branch de feature ativa |
| Aceite de campo Fase 3a / melhorias RNC | Código no ar; validação final de campo era do usuário (relatado "aceite passou") | `d27eb31`, `d0c6f8c` |

### ⚪ NÃO INICIADO / NA FILA

| Item | Descrição | Evidência de ausência |
|---|---|---|
| **Marco M — Fase 3b** | Desvios alimentando **alertas** (`gerar_alertas`) e **banco de experiência** (funções 0033) | ✔ Verificado: `grep` em `0051`–`0053` e `0033` — **nenhuma** referencia `ocorrencias`. Não iniciado. |
| **Play Store (Fase A)** | Keystore de release + AAB assinado + Play Console | `android/app/build.gradle` sem `signingConfig`; sem `.keystore` no repo; `versionCode 1` |
| **Landing** (`fieldcheck-site`) | Aplicar preços/planos/trial 30d/fundador | Repositório **separado** (não está neste repo) |
| **B3 — `pk_live` na Vercel** | Publishable key live no front | **(a confirmar)** — não verificável a partir deste repo (env da Vercel) |
| Marco G — i18n | Interface + exportações multilíngues | Sem biblioteca de i18n no `package.json`; manifest `lang: pt-BR` |
| Refinamentos citados | RNC direta sem promoção; undelete de descarte/desvio; staging (2º projeto Supabase); gestão de upgrade/proration; Pix (D+60); boleto/send_invoice | não implementados (backlog) |

---

## Seção 2 — Confirmação explícita dos itens em dúvida

### 2.1 Painel de erros de sincronização — ✅ **EXISTE, COMPLETO** (`134c04c`)
Todos os elementos pedidos estão no código:
- **Faixa tocável + painel**: `src/components/SyncBar.tsx` (prop `onAbrir`, vira tocável com fila/erro) → `src/features/sync/PainelSync.tsx`.
- **Detalhe por item (HTTP + tentativas + msg)**: `coletarPendencias` em `src/lib/sync.ts`; tradução de campo em `src/lib/syncErros.ts` (`traduzErroSync`, mostra código técnico + amigável).
- **Tentar novamente / Descartar**: `tentarItem` / `descartarItem` em `sync.ts` (descarte grava em `sync_descartes`, Dexie v11).
- **Refresh de sessão antes do flush**: `supabase.auth.refreshSession()` em `SyncProvider.tsx:65`.
- **Retry só para transitórios**: `ehTransitorio()` + `registrarFalha()` em `sync.ts` (PG code / 4xx = permanente aguarda ação; rede/5xx/408/429 = backoff até 3).
- **Idempotência por UUID**: `upsert(..., { onConflict: "id" })` em `supabaseSync.ts` (inspeção/resposta/evento/ocorrência).
- **Testes**: `src/lib/syncErros.test.ts` + casos transitório×permanente em `sync.test.ts`.
> Metadados por item: campos `tentativas / ultima_tentativa_em / ultimo_status_http / ultimo_erro` em `SyncMeta` (`db.ts`). **Sem migração SQL** (fila é IndexedDB).

### 2.2 Promoção de desvio a NC — ✅ **APLICADA E FUNCIONAL** (`0064`, `d27eb31`)
- **Migration `0064`**: checklist de sistema `DESVIO-CAMPO` + item; coluna `inspecoes.origem_desvio_id`; trigger `tg_copiar_fotos_desvio` (copia fotos do desvio → resposta da NC).
- **Aplicação confirmada no banco**: probe REST em 2026-07-22 → `inspecoes.origem_desvio_id` responde HTTP 200 (coluna existe).
- **Código**: `promoverDesvioLocal` em `src/lib/ocorrenciaService.ts` (cria inspeção sintética → resposta NC `classificacao_st=null` → `evento_nc`; seta `promovida_inspecao_id`); botão "Promover a NC" + badge em `SecaoDesvios.tsx`; KPIs de inspeção filtram `origem_desvio_id` (conformidade intacta).
- **Testado**: `src/lib/promoverDesvio.test.ts` (4 casos) + **aceite de campo relatado pelo usuário** (2026-07-22).

### 2.3 Triagem IA v2 — modelo em uso = **`claude-sonnet-4-6`** (Sonnet, não Haiku)
- **Código (default)**: `const MODEL = Deno.env.get("TRIAGEM_AI_MODEL") || "claude-sonnet-4-6"` — `ia-triagem-desvio/index.ts:31`. Idem em `rnc-generate` (`RNC_AI_MODEL || claude-sonnet-4-6`).
- **Secret**: `TRIAGEM_AI_MODEL` está **setado** (atualizado 2026-07-21) — valor definido para `claude-sonnet-4-6`. *(O valor do secret é hasheado no painel, não legível por API; confirmado indiretamente abaixo.)*
- **Ground truth (metering `ia_uso`)**: linhas de 2026-07-22 mostraram `modelo='claude-sonnet-4-6'`, `sucesso=true`, `prompt_version=2` (retorno SQL colado pelo usuário).
- **Prompt v2**: catálogo NR+NBR curado embutido no `SYSTEM_PROMPT` de `ia-triagem-desvio` (`aff14b8`); nunca item numerado; "PGR/NR-01" (não "PPRA").
- **Alertas** (`ia-alertas`) permanecem em **Haiku** de propósito (`ALERTAS_AI_MODEL=claude-haiku-4-5`, custo — fora do escopo v2).

### 2.4 Desvios nos relatórios + editar/excluir soft delete — ✅ **EM PRODUÇÃO**
- **`SecaoDesvios`** usado em: `RelatorioGeral.tsx`, `RelatorioObra.tsx` (PDF), `TelaObra.tsx`, `TelaDashboard.tsx` (+ componente `SecaoDesvios.tsx`). Commits `df21ce4`, `9d0f702`.
- **Soft delete**: `0063` adiciona `excluido_em / excluido_por / motivo_exclusao` + índice parcial; `excluirDesvioLocal` em `ocorrenciaService.ts`; **todas as leituras filtram `excluido_em is null`** (TelaSeguranca, RelatorioGeral, TelaObra, TelaDashboard, download em `leitura.ts`). Edição: `atualizarOcorrenciaLocal` (`atualizado_em/por`). Commit `4995b73`.

### 2.5 Correção do CHECK `ocorrencias_tipo_chk` — ✅ **`0062`** (`edfbbf1`)
`0062_fix_ocorrencias_tipo_chk.sql` reafirma o CHECK com os 6 tipos (topo da Bird + os 3 da base: `ato_inseguro`/`condicao_insegura`/`quase_acidente`). Causa: a `0059` entrou parcial em produção e o CHECK antigo rejeitava os tipos novos (erro `23514`), travando o sync do desvio — reproduzido e corrigido.

---

## Seção 3 — Migrations (mais recente → mais antiga)

**Total: 64.** Aplicação individual em produção não auditada linha a linha aqui; as features dependentes estão no ar (pagamentos live, desvios, promoção a NC com `0064` confirmada por probe).

```
0064_promover_desvio_nc          — Fase 3a: checklist DESVIO-CAMPO, inspecoes.origem_desvio_id, trigger de fotos
0063_ocorrencias_edicao_softdelete — editar + soft delete de desvio (excluido_em/por, atualizado_em/por)
0062_fix_ocorrencias_tipo_chk    — reafirma CHECK de tipo (tipos da base da Bird)
0061_ia_uso_prompt_version       — ia_uso.prompt_version (rastreabilidade do prompt)
0060_triagem_ia                  — ocorrencias.triagem_ia/origem_ia/editado_apos_ia (M-2)
0059_desvios                     — ocorrencias += tipos base + criticidade/frente/EAP/ocorrida_em/promovida_inspecao_id (M-1)
0058_signup_trial_30d            — signup cria trial de 30 dias (Intelligence)
0057_planos_enforcement_leitura  — gate de leitura (alertas SELECT + views RF19)
0056_planos_migracao             — migração de contas + cron transição + plan_events
0055_planos_enforcement          — triggers de limite + bloqueio readonly
0054_planos_schema               — plan_limits/plan_features + plano_vigente/tem_feature/limite_de
0053_alertas_fase3               — gatilho agudo + frequência
0052_ia_alertas_trigger          — trigger da IA de alertas
0051_alertas                     — detecção de alertas (Marco L)
0050_data_inspecao               — data da inspeção editável / registro retroativo
0049_bi_views                    — 6 views RF19
0048_curadoria_rnc_reformas      — curadoria RNC (módulo)
0047_curadoria_rnc_telecom       — curadoria RNC
0046_curadoria_rnc_linhas_transmissao — curadoria RNC
0045_curadoria_rnc_edificacoes   — curadoria RNC
0044_curadoria_rnc_comissionamento — curadoria RNC
0043_curadoria_rnc_eletrica      — curadoria RNC
0042_curadoria_rnc_eletromecanica — curadoria RNC
0041_curadoria_rnc_civil         — curadoria RNC
0040_curadoria_rnc_transversal   — curadoria RNC
0039_curadoria_rnc_seguranca     — curadoria RNC
0038_curadoria_rnc_cv02          — curadoria RNC
0037_ia_habilitada               — empresas.ia_habilitada (gate K2)
0036_ia_uso                      — metering de IA
0035_item_texto_base_rnc         — texto-base de RNC por item
0034_rnc_sem_texto_base          — RNC sem texto-base (fallback)
0033_experiencia                 — funções do banco de experiência
0032_ref_cronograma              — item de cronograma/EAP
0031_bird_na                     — Bird: N/A fora da pirâmide
0030_fix_logos_policies          — policies do bucket de logos
0029_notif_email                 — resumo semanal por e-mail
0028_prazos_job                  — job de prazos de NC
0027_push_trigger                — trigger de push
0026_push_tokens                 — tokens FCM
0025_cron_extensions             — pg_cron / pg_net
0024_seed_rnc                    — seed RNC (textos-base, modelos)
0023_rnc_module                  — módulo RNC (schema)
0022_branding_assinatura         — logo + assinatura do inspetor
0021_criticidade_prazos          — criticidade + prazos de NC
0020_super_admin_cortesia        — super_admin + cortesia
0019_seed_catalogo_v2            — catálogo v2 (83/643/kits)
0018_modulos_kits                — dimensões + kits
0017_bird_ocorrencias            — Pirâmide de Bird + ocorrências
0016_evidencia_conformidade      — evidência de conformidade
0015_notificacoes                — feed de notificações
0014_convites_executora          — convites executora
0013_contratadas                 — contratadas + papel executora
0012_nc_ciclo                    — ciclo fiscal↔executora
0011_auditoria                   — auditoria + arquivar/excluir
0010_obras_status                — status de obra
0009_liberacao                   — liberação/assinatura
0008_stripe                      — Stripe (monetização v1)
0007_convites                    — convites
0006_signup                      — provisionamento de empresa
0005_seed_catalogo               — catálogo v1
0004_storage                     — bucket evidencias + RLS
0003_rls                         — RLS + funções de tenant
0002_triggers                    — triggers de imutabilidade
0001_schema                      — schema base multi-tenant
```

---

### Notas de confiança
- **Verificado no código**: tudo da Seção 2 (arquivos/símbolos/migrations citados existem no repo).
- **Verificado no banco (probe)**: `inspecoes.origem_desvio_id` (0064) presente.
- **Verificado por metering** (SQL colado pelo usuário): modelo `claude-sonnet-4-6`, `prompt_version=2`.
- **Verificado por grep**: Fase 3b NÃO iniciada — `ocorrencias` não aparece em `0051`–`0053` (alertas) nem `0033` (banco de experiência).
- **(a confirmar)**: valor bruto dos secrets (hasheado); `pk_live` na Vercel (env externo); aplicação individual de cada uma das 64 migrations no ambiente de produção.
