# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.0.0] — 2026-07-13

Primeira versão de produção do FieldCheck. Lançada e validada em produção
(Vercel). Tag `v1.0.0` no commit de release.

### Adicionado

**Plataforma & acesso**
- Multi-tenant por empresa com papéis (inspetor, gestor, admin, executora) e RLS no Postgres.
- PWA offline-first (Dexie/IndexedDB com fila de sincronização própria) e app nativo via Capacitor.
- Layout responsivo desktop (frame 560/1180px) preservando o mobile.

**Inspeções & checklists**
- Catálogo padrão por módulo (civil, eletromecânica, elétrica, comissionamento, linhas de transmissão, telecom, edificações, reformas, transversal).
- Checklists personalizados por empresa e kits de obra.
- Execução de inspeção offline com critério por item.

**Não conformidades (NC)**
- Ciclo de tratamento com trilha de eventos auditável (aberto → tratada → aprovada | reaberta).
- Criticidade estruturada e prazos por criticidade.
- Pirâmide de Bird e classificação de Segurança do Trabalho; resposta "N/A" com justificativa obrigatória (fora do Bird, mantida nos demais KPIs).

**Evidências**
- Múltiplas fotos (até 10) por item de inspeção e por registro de tratamento (antes/depois).

**RNC (Relatório de Não Conformidade)**
- Geração com IA em 4 seções normativas (requisito, fundamentação, risco, ação).
- Texto-base opcional por item em checklists personalizados.
- Exportação em PDF individual (cabeçalho com logo, seções, fotos, histórico e assinaturas) e xlsx em lote da lista filtrada.

**Cronograma & dados**
- Referência a item de cronograma/EAP por código na inspeção.
- Banco de experiência (MVP): ranking de NC por item, reincidência e tempo médio de tratamento por criticidade, via consultas SQL nomeadas.

**Relatórios & identidade**
- Relatório por obra e relatório geral executivo.
- Identidade visual (logo no cabeçalho) e assinatura nos relatórios.

**Notificações**
- Push web (FCM) validado ponta a ponta; push nativo pronto (validação em dispositivo pendente).
- Resumo semanal por e-mail com opt-out por usuário; sino de notificações no app.

### Corrigido

- RNC deixou de ser bloqueada por item sem texto-base: o texto-base virou conveniência e nunca pré-requisito (a RNC abre em branco para preenchimento manual quando não há base).
- Upload de logo: removido `upsert` no Storage que disparava avaliação do caminho de UPDATE no RLS e negava o envio mesmo com papel/empresa/policy corretos.

[1.0.0]: https://github.com/naelsonengcivil-cloud/fieldcheck/releases/tag/v1.0.0
