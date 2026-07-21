# FieldCheck — Relatório Completo de Funcionalidades

> Documento de referência do produto em produção (v1.0). Gerado a partir de varredura completa do código-fonte — telas, banco de dados, automações e integrações. Fonte para apresentação comercial e manual do usuário.
>
> **App:** https://app.fieldcheck.app.br · **Produto de:** Alpha Inspeções e Auditoria

---

## 1. Visão geral

O **FieldCheck** é um sistema de inspeções de campo para obras de construção e montagem. Ele substitui a prancheta, as planilhas soltas e os relatórios montados à mão por um fluxo único: o inspetor faz a verificação no celular (mesmo sem internet), o sistema registra evidências fotográficas com rastreabilidade, as não conformidades entram automaticamente num ciclo de tratamento com prazos e responsáveis, e a gestão acompanha tudo em painéis, relatórios em PDF e alertas inteligentes.

O produto foi desenhado para o dia a dia real do canteiro: funciona **offline** (a obra nem sempre tem sinal), roda como **aplicativo Android e como app de navegador** no mesmo código, usa botões grandes (pensados para uso com luva e sob sol) e fala **português do Brasil** em todas as telas.

**Para quem é:** construtoras, empresas de engenharia, fiscalizadoras e gerenciadoras que precisam inspecionar qualidade, segurança do trabalho, meio ambiente e documentação em obras — de edificações a linhas de transmissão. Cada empresa cliente tem seu ambiente isolado (dados de uma empresa jamais aparecem para outra) e organiza sua equipe em quatro papéis: **administrador** (configura tudo e gerencia a conta), **gestor** (acompanha, aprova tratamentos e vê painéis), **inspetor** (executa inspeções em campo) e **executora** (a empresa contratada, que enxerga somente as pendências dela e registra os tratamentos).

**O que o FieldCheck entrega, em uma frase por bloco:**

- **Inspeção em campo:** catálogo profissional de 83 checklists prontos (643 itens de verificação, 9 módulos de engenharia), checklists próprios da empresa, fotos, assinatura digital e funcionamento 100% offline.
- **Gestão de não conformidades:** cada item reprovado vira uma pendência com criticidade, prazo e responsável, num ciclo formal de tratamento e aprovação entre fiscalização e executora.
- **RNC formal:** relatório de não conformidade em padrão profissional, pré-redigido por inteligência artificial com base normativa (NBR, NR, IEC), pronto para exportar em PDF com a marca da empresa.
- **Segurança preditiva:** Pirâmide de Bird alimentada pelas inspeções e ocorrências, mostrando se a base de desvios está sendo reportada antes que vire acidente.
- **Visão executiva:** dashboards, relatório consolidado multi-obra, banco de experiência com o histórico da própria empresa e resumo semanal por e-mail.
- **Alertas inteligentes:** o sistema vigia os dados todos os dias e avisa a gestão sobre NC vencida, reincidência e queda de desempenho de contratada — com leitura explicativa gerada por IA.
- **Comercial pronto:** autosserviço completo — a empresa cria a conta sozinha, testa 30 dias com tudo liberado e assina online um dos três planos (pagamento por cartão, processado pela Stripe).

---

## 2. Funcionalidades por área

### 2.1 Acesso e conta

**Cadastro autônomo (self-service).** Qualquer pessoa cria uma conta na tela inicial em menos de um minuto: informa o nome da empresa, o próprio nome, e-mail e senha. O sistema cria a empresa, torna essa pessoa administradora e inicia um **teste grátis de 30 dias com acesso completo ao plano mais alto (Intelligence), sem pedir cartão de crédito**. Não há intervenção manual de ninguém da Alpha nesse processo.

**Login, recuperação de senha e sessão.** Acesso por e-mail e senha, com fluxo completo de "esqueci minha senha" (e-mail com link seguro de redefinição, incluindo tratamento amigável de link expirado). O usuário também pode trocar a própria senha a qualquer momento na tela "Minha conta".

**Convites de equipe.** O administrador convida colegas informando apenas o e-mail e o papel (inspetor, gestor, administrador ou executora). O convidado cria a conta com aquele e-mail e o vínculo à empresa é automático — ao entrar, o sistema reconhece o convite pendente e mostra "Você foi convidado para a empresa X como Y", bastando aceitar. Convites pendentes aparecem numa lista com opção de cancelar; usuários podem ser ativados/desativados e ter o papel alterado depois.

**Papéis e permissões.** Cada papel enxerga um aplicativo diferente. O inspetor vê as obras e faz inspeções. O gestor soma os painéis, aprovações e relatórios. O administrador soma toda a configuração (obras, equipe, checklists, kits, prazos, identidade visual, IA e plano). A **executora** tem uma tela própria: uma lista de trabalho apenas com as não conformidades da contratada dela, organizadas em "Tratar", "Em análise" e "Encerradas" — ela não vê nada além do que lhe diz respeito.

### 2.2 Obras

**Cadastro e ciclo de vida.** O administrador cadastra obras com nome e cliente. Cada obra tem um status: **em andamento** (recebe novas inspeções), **finalizada** (continua nos indicadores, mas não aceita inspeção nova) e **arquivada** (sai das listas do dia a dia, preservando o histórico). Mudanças de status pedem confirmação, e uma obra só pode ser excluída se nunca recebeu inspeção — o histórico não se perde por acidente.

**Kit de obra.** Cada obra pode adotar um "kit": um conjunto pré-montado de checklists adequado ao tipo de trabalho (o sistema traz 6 kits-modelo prontos e a empresa pode criar os seus). Na hora de iniciar uma inspeção, o aplicativo já filtra e mostra os checklists do kit daquela obra — o inspetor não precisa garimpar 83 opções; se precisar de algo fora do kit, um clique em "Todos" libera o catálogo completo.

**Contratadas.** A empresa cadastra suas contratadas/executoras (nome e CNPJ), que podem ser vinculadas às inspeções e às não conformidades. É esse vínculo que alimenta o ranking de desempenho por contratada e permite dar acesso restrito à executora para tratar as próprias pendências.

### 2.3 Catálogo de checklists

**83 checklists profissionais prontos.** O FieldCheck vem com um catálogo de **83 checklists e 643 itens de verificação**, organizado em **9 módulos de engenharia** — Civil, Edificações, Elétrica, Eletromecânica, Linhas de Transmissão, Telecom, Comissionamento, Reformas e Transversal (SSMA e gestão) — e **6 tipos** — segurança (NRs), meio ambiente, qualidade, documentação, equipamentos e execução. Cada item traz o texto da verificação e o critério de aceitação, com referências normativas (NBRs, NRs, IEC) quando aplicável. O catálogo é mantido pela Alpha e chega pronto para qualquer empresa.

**Checklists personalizados.** Além do catálogo padrão, o administrador cria checklists próprios: do zero ou **clonando um checklist padrão** e ajustando. O editor permite definir módulo, tipo, fase da obra, referência normativa, NRs relacionadas, se o checklist exige documento de projeto de referência, e cada item com texto, critério e um **texto-base para RNC** (usado pela IA quando aquele item reprova). Os checklists da empresa ficam disponíveis offline como os do catálogo.

### 2.4 Execução da inspeção em campo

**Abertura da inspeção.** O inspetor escolhe a obra, o checklist (filtrado pelo kit da obra), e pode informar: a **frente de serviço**, o **item de cronograma/escopo** ao qual a inspeção se refere, a **contratada inspecionada** e — quando o checklist exige — o **número e a revisão do projeto de referência**. A **data e hora da inspeção são editáveis**: o sistema permite registrar retroativamente uma inspeção feita ontem no papel (nunca uma data futura), avisando com clareza que se trata de registro retroativo.

**Verificação item a item.** Para cada item, três respostas possíveis: **Conforme (C)**, **Não Conforme (NC)** ou **Não se Aplica (N/A)**, com barra de progresso do preenchimento. Ao marcar NC, o sistema exige a descrição do desvio e abre os campos estruturados: **criticidade** (baixa, média, alta ou crítica), **prazo sugerido automaticamente** conforme a criticidade e a política da empresa, e **responsável** pelo tratamento. Em checklists de segurança do trabalho, cada NC ainda recebe uma **classificação comportamental** — ato inseguro, condição insegura ou quase-acidente — que alimenta a Pirâmide de Bird.

**Fotos com rastreabilidade.** Cada item aceita até 10 fotos, tanto em NC quanto em item conforme (evidência de conformidade). As fotos vêm da **câmera** ou da **galeria** (seleção múltipla); ao importar da galeria, o sistema **extrai os metadados EXIF do arquivo original** — data/hora da captura e coordenadas GPS — e os exibe junto à foto no detalhe e nos relatórios. É o reforço probatório ideal para o registro retroativo: a foto "carrega" a prova de quando e onde foi tirada.

**Fechamento e assinatura.** A tela de resumo mostra os indicadores da inspeção (percentual de conformidade, pontos verificados, NCs, N/A) e a lista das não conformidades geradas. O inspetor pode **assinar na tela** (assinatura desenhada a dedo, que sai nos relatórios) e salvar. Se houver NCs, o sistema oferece **gerar todas as RNCs automaticamente** — a IA redige os relatórios formais em lote, e se o aparelho estiver offline a geração entra numa fila que roda sozinha quando a conexão volta. Uma vez finalizada, a inspeção se torna **imutável**: ninguém edita resposta de inspeção fechada.

### 2.5 Não conformidades, RNC e Pirâmide de Bird

**Ciclo formal de tratamento (fiscal ↔ executora).** Toda NC nasce como uma pendência viva com status próprio. O fluxo: a NC está **aberta** → a executora (ou a equipe) **registra o tratamento** com descrição e fotos da correção → a NC fica **em análise** → o gestor ou administrador **aprova** (encerra) ou **reprova** com motivo (a NC **reabre** e volta para a executora). Cada passo exige o registro adequado — tratamento sem descrição não passa, reprovação sem motivo não existe — e **todo o histórico fica gravado** com autor, data e comentário, visível na tela e nos relatórios.

**Criticidade e prazos que cobram sozinhos.** As quatro criticidades têm prazos sugeridos configuráveis pela empresa (padrão: crítica 1 dia, alta 3, média 7, baixa 15). O gestor pode reclassificar criticidade e prazo de uma NC existente. NCs vencidas ganham destaque visual em todas as listas, disparam notificação automática diária para os responsáveis e alimentam os alertas inteligentes.

**Painel de NCs.** Cada obra tem um painel de tratamento com os números do ciclo — abertas, aguardando aprovação, encerradas, reabertas, taxa de reprovação e tempo médio de tratamento — e uma lista de trabalho filtrável por situação e criticidade, com destaque para vencidas. Dali se chega a qualquer NC em dois toques.

**RNC — o documento formal.** Qualquer NC pode virar uma **RNC (Relatório de Não Conformidade)** numerada sequencialmente (RNC-ANO-NNNN), no padrão que auditor e cliente reconhecem: 12 seções, incluindo identificação, origem, descrição do desvio, evidência fotográfica, **requisito não atendido, fundamentação normativa, análise de risco e ação recomendada**, gravidade (crítica, maior, menor ou observação), disposição com prazo e responsável, e fechamento com reinspeção. A RNC tem workflow próprio (aberta → em tratamento → aguardando reinspeção → fechada, com possibilidade de cancelamento justificado) e **exporta em PDF** com o logo da empresa.

**Redação assistida por IA.** As seções técnicas da RNC chegam **pré-redigidas por inteligência artificial**, que parte do texto-base curado daquele item do checklist, da descrição do inspetor e das fotos da ocorrência (a IA "vê" até 3 fotos) para produzir uma argumentação técnica com citação das normas. Tudo que a IA escreve vem marcado com o selo "IA · revise" — o inspetor é sempre o autor final e pode comparar com o texto original do agente. Se a IA estiver indisponível, o sistema gera a RNC mesmo assim com o preenchimento padrão: o registro nunca fica bloqueado.

**Ocorrências e Pirâmide de Bird.** Além das inspeções, a gestão registra **ocorrências** — dano material, acidente sem afastamento e acidente com afastamento — com obra, data, contratada, descrição e fotos. Esses registros formam os níveis superiores da **Pirâmide de Bird**; a base vem das classificações de segurança das inspeções (atos inseguros, condições inseguras e quase-acidentes). A pirâmide aparece por obra, por período e consolidada na empresa, sempre comparada à proporção de referência (600 : 30 : 10 : 1), e o sistema faz a leitura em texto: **quando a base está fina demais para o topo, ele aponta provável subnotificação** — o sinal clássico de que desvios não estão sendo reportados antes de virarem acidente.

### 2.6 Rastreabilidade e integridade do registro

**Dois relógios: o do fato e o do registro.** Cada inspeção guarda a **data da inspeção** (editável, permite registro retroativo honesto) e o **carimbo de registro** (gravado pelo servidor, imprevisível e à prova de edição). Relatórios e telas mostram com transparência quando um registro foi retroativo. Prazos e indicadores usam a data do fato; a auditoria tem o carimbo real.

**Amarração com o planejamento.** A inspeção referencia a **frente de serviço**, o **item de cronograma/escopo** (um código estável que permite cruzar as inspeções com o planejamento da obra) e o **documento de projeto com revisão** quando o checklist exige. Isso responde às perguntas de rastreabilidade de auditoria: *o que* foi inspecionado, *contra qual* documento e revisão, *em que* frente e etapa.

**Evidência com metadados.** Fotos de galeria carregam EXIF (quando e onde a foto foi tirada); fotos são vinculadas ao item, ao tratamento ou à ocorrência específica; a assinatura do inspetor viaja com a inspeção. Inspeções finalizadas são imutáveis, e as ações administrativas raras (arquivar, excluir) exigem motivo e deixam trilha permanente.

### 2.7 Relatórios e exportações

**Tela da obra com filtros combináveis.** A visão da obra filtra por checklist, inspetor, módulo, tipo, item de cronograma, contratada, período e "somente com NC", recalculando os indicadores para o recorte escolhido, com gráfico (NCs por checklist ou evolução da conformidade) e a Pirâmide de Bird do período.

**Relatório da obra em PDF.** Um clique gera o relatório do recorte: capa com o **logo da empresa cliente**, tabela das inspeções, gráfico, pirâmide do período, cada NC com fotos e histórico completo de tratamento, evidências de conformidade e as assinaturas dos inspetores. A marca FieldCheck aparece discreta no rodapé — o relatório é da empresa, não do fornecedor do software.

**Relatório geral (multi-obra).** Para a diretoria: sumário executivo da empresa inteira no período (inspeções, conformidade, NCs abertas, vencidas, tempo médio de fechamento, taxa de reprovação), quebra por criticidade, pirâmide consolidada, tabela comparativa por obra e anexo com as NCs críticas e vencidas fotografadas. Sai em PDF e em planilha.

**Exportações em Excel.** Três exportações prontas para quem vive de planilha: os **dados da obra** (abas de inspeções e NCs, com criticidade, situação, responsável, prazo, vencimento e reaberturas), as **RNCs em lote** da obra, e o **consolidado da empresa** (resumo, por obra e por criticidade). Os gráficos também exportam como imagem.

**Dashboard executivo.** Painel interativo para gestão com filtro de período: indicadores gerais, NCs por criticidade, Pirâmide de Bird, **ranking de contratadas** (reincidência e cumprimento de prazo), comparativo por obra e conformidade por obra calculada no servidor. É a visão "guerra" da operação em uma tela.

**Resumo semanal por e-mail.** Toda semana, gestores e administradores recebem um e-mail com a fotografia da empresa: inspeções da semana, conformidade, NCs abertas por criticidade (com cores), NCs vencidas e as 3 obras com mais pendências, com botão direto para o app. Quem não quiser, desativa na própria conta; empresas sem movimento não recebem e-mail vazio.

### 2.8 Banco de experiência

O banco de experiência transforma o histórico da própria empresa em orientação prática. A partir de todas as inspeções já feitas, ele mostra **quais itens de checklist mais reprovam** (taxa de NC por item, com marcação de reincidência) e **quanto tempo a empresa leva para tratar** cada criticidade. A apresentação é deliberadamente honesta: os números são frequências observadas — não previsões — e o tamanho da amostra aparece sempre ao lado, para que ninguém tire conclusão forte de meia dúzia de casos. Filtra por obra e período, e serve tanto para planejar a próxima obra ("esses 10 itens historicamente dão problema") quanto para dimensionar equipes de tratamento.

### 2.9 Inteligência artificial

O FieldCheck usa IA em dois pontos, sempre com o mesmo contrato: **a IA acelera e explica; a pessoa decide** — e nada no sistema depende dela para funcionar.

**Argumentação de RNC.** Descrita na seção 2.5: a IA redige as seções técnicas do relatório formal a partir do texto-base curado, da descrição do inspetor e das fotos. Regras invioláveis do agente: não inventa fatos, medições nem normas; não remove citações normativas; apenas lapida a redação. Saída sempre marcada como IA, com o original disponível para comparação, e fallback automático para o texto padrão se a IA falhar.

**Alertas inteligentes.** Descritos na seção 2.10: a detecção dos problemas é feita por regras determinísticas sobre os dados; a IA entra depois, para explicar o alerta em linguagem de gestão. O agente só pode raciocinar sobre os números que o próprio sistema entregou e é instruído a **se autolimitar quando a amostra é pequena** ("com amostra de 5 verificações, a conclusão é preliminar…").

**Controle e transparência.** O administrador tem interruptores separados para cada uso de IA (redação de RNC e análise de alertas) — dá para usar um sem o outro. **Todo acionamento de IA é medido**: função, modelo, volume processado e custo estimado ficam registrados por empresa, com leitura disponível à gestão. Conteúdo gerado por IA é sempre identificado como tal.

### 2.10 Alertas inteligentes (assistente de gestão)

Todos os dias, o sistema varre os dados de cada empresa e gera alertas em três severidades (crítico, atenção, informativo) para quatro situações: **NCs vencidas acumulando numa obra**, **item de checklist reincidente**, **contratada com desempenho em queda** e **conformidade baixa**. Cada alerta exibe os **dados-fonte** (os números e o tamanho da amostra que o justificam — nada de caixa-preta) e, quando a empresa habilita, a **análise por IA**: um parágrafo de gestão explicando o que está acontecendo, o que priorizar e que ação tomar. Situações agudas — NC crítica, vencida e reincidente — não esperam o horário do dia seguinte: disparam análise imediata. Os alertas chegam também como notificação no sino e push, e a frequência do resumo (diário ou semanal) é configurável.

### 2.11 Notificações

**Sino no app.** Feed de notificações dentro do aplicativo, com contador de não lidas, "marcar todas" e navegação direta: tocar numa notificação de NC abre a NC. Os eventos notificados: NC atribuída, NC reaberta, NC aguardando aprovação, NC aprovada, prazo se aproximando, prazo vencido e alerta inteligente.

**Push no celular e no navegador.** As mesmas notificações chegam como push no Android (app nativo) e no navegador (web push), mesmo com o app fechado. Tocar na notificação abre o FieldCheck já na NC certa. A ativação é opt-in por dispositivo ("Ativar notificações neste dispositivo" na conta), o opt-out é respeitado no servidor, e tokens de aparelhos desativados são limpos automaticamente.

**E-mail.** O resumo semanal executivo (seção 2.7) completa o tripé — app, push e e-mail — cada um com seu papel: o push para o urgente, o sino para o dia a dia, o e-mail para a visão da semana.

### 2.12 Planos, pagamentos e travas

**Três planos mensais.** **Basic (R$ 79,90/mês)** para começar: 1 obra ativa, 1 usuário, 3 checklists personalizados. **Premium (R$ 199/mês)** para equipe: obras e checklists ilimitados, até 5 usuários e toda a gestão de NC (ciclo fiscal-executora, push, papéis, exportações). **Intelligence (R$ 89 por usuário/mês, mínimo 3 usuários)** para operação completa: tudo ilimitado mais os recursos de inteligência — dashboard executivo, IA na RNC, alertas inteligentes, Pirâmide de Bird e relatórios multi-obra. A matriz completa está na seção 4.

**Teste grátis e transições suaves.** Toda conta nova tem 30 dias de Intelligence completo, sem cartão. Ao fim do teste sem assinatura, a conta entra em **somente leitura por 30 dias** — tudo continua visível e exportável, nada se perde, apenas a criação fica suspensa — e depois é arquivada preservando os dados. Assinou, reativa na hora.

**Assinatura online (Stripe).** O administrador assina dentro do app: escolhe o plano (no Intelligence, seleciona o número de assentos com o total calculado na tela), paga com cartão no checkout seguro da Stripe e volta para o app com o plano ativado automaticamente — o sistema confirma a ativação em segundos, sem intervenção humana. Cancelamentos e falhas de pagamento também são refletidos automaticamente. Contas da primeira onda têm **preço de fundador travado por 12 meses**.

**Travas honestas.** Os limites do plano são aplicados **no servidor** — não é maquiagem de interface. Ao atingir um limite (obras, usuários, checklists) ou tocar um recurso de plano superior, o usuário vê uma **vitrine clara**: o cadeado explica o que o recurso faz, informa em qual plano está disponível e oferece o upgrade — o recurso nunca "some" da interface, e **dados já gerados continuam sempre legíveis**, mesmo em plano menor ou em somente leitura.

### 2.13 Aplicativo, offline e experiência de campo

**Um produto, três formas de usar.** O FieldCheck roda como **aplicativo Android nativo** (APK instalável), como **PWA** (instala direto do navegador, com ícone e tela cheia) e como sistema web no desktop — mesmo código, mesmos dados, visual consistente.

**Offline de verdade (offline-first).** O aplicativo não "tolera" ficar sem internet — ele é desenhado para isso. Todo o catálogo (obras, checklists, kits, contratadas, equipe) e o histórico de leitura ficam armazenados no aparelho. A inspeção inteira — respostas, fotos, assinatura, NCs — é salva localmente e entra numa **fila de sincronização** que roda sozinha: quando a conexão volta, a cada minuto, ou sob demanda. Fotos pesadas não travam a fila (têm reenvio próprio com espera progressiva), e uma barra de status mostra quantos registros aguardam envio. O trabalho de campo nunca fica refém do sinal.

**Feito para o canteiro.** Interface com alvos de toque grandes (uso com luva), alto contraste (sol), navegação em poucos toques, câmera integrada, GPS registrado na inspeção, e compressão automática das fotos para economizar dados móveis.

**Identidade da empresa.** O administrador sobe o logo da empresa, que passa a estampar o cabeçalho de todos os relatórios PDF — inspeção, consolidado e RNC.

### 2.14 Administração e operação da plataforma

**Ferramentas do administrador.** Além de tudo já descrito (equipe, obras, contratadas, checklists, kits, identidade visual, IA e plano), o administrador define a **política de prazos por criticidade** da empresa e tem poderes administrativos com trilha: **arquivar** uma inspeção (com motivo, reversível, sai dos indicadores) e **excluir** definitivamente (confirmação digitada + motivo, com registro permanente de auditoria que sobrevive à exclusão — quem, quando, o quê e por quê).

**Operação da plataforma (Alpha).** A equipe da Alpha tem um painel de operador separado que mostra **apenas metadados** das empresas clientes — plano, situação, número de usuários e inspeções, última atividade — **sem nenhum acesso aos dados operacionais** (obras, inspeções, fotos são invisíveis ao operador, por construção). A ação disponível é conceder **cortesia** (acesso gratuito por período determinado, com motivo registrado), usada para parcerias e casos especiais.

---

## 3. Diferenciais técnicos (em linguagem simples)

**Offline-first.** A maioria dos sistemas "aguenta" perder conexão; o FieldCheck foi construído a partir do cenário sem sinal. O aparelho carrega tudo que precisa antes, o trabalho é salvo localmente com identificadores à prova de duplicação, e a sincronização é automática, idempotente (reenviar nunca duplica) e tolerante a falha parcial (uma foto problemática não trava o resto).

**Isolamento total entre empresas (multi-tenant com RLS).** A separação dos dados de cada empresa é imposta pelo **banco de dados**, não pela boa vontade da aplicação: cada consulta passa por regras de segurança em nível de linha (Row-Level Security) que tornam tecnicamente impossível uma empresa enxergar dados de outra — inclusive para a executora, que só vê o recorte da própria contratada, e para o operador da plataforma, que não vê dados operacionais de ninguém.

**Trilha de auditoria em camadas.** O histórico de cada NC é imutável e assinado (quem fez cada transição, quando, com que comentário — e o nome fica gravado mesmo se o usuário sair da empresa). Ações administrativas destrutivas deixam registro permanente com snapshot do que existia. Mudanças de plano têm trilha própria (o quê, de onde para onde, por qual via). Inspeção finalizada não se edita.

**Registro retroativo com honestidade.** Permitir registrar o fato na data em que ocorreu é necessidade real de campo; o FieldCheck permite — e ao mesmo tempo carimba a data real do registro num campo à prova de edição, sinaliza o retroativo nas telas e relatórios, e usa o EXIF das fotos (data e GPS de captura) como reforço probatório.

**IA com salvaguardas de engenharia.** A IA nunca é ponto único de falha (tudo funciona sem ela), nunca inventa dados (raciocina apenas sobre o que o sistema entrega), declara as próprias limitações (amostra pequena → conclusão modulada), é sempre identificada como IA, é controlada por interruptores independentes da empresa e tem **medição completa de uso e custo** por acionamento. Detecção de problemas é código determinístico; a IA apenas explica.

**Enforcement no servidor.** Limites e permissões de plano são aplicados no banco de dados e nas funções do servidor. A interface reflete as regras, mas não é a guardiã delas — não existe "destravar pelo navegador".

---

## 4. Matriz de planos

Preços mensais, sem fidelidade. Teste grátis de 30 dias com Intelligence completo, sem cartão. Pagamento por cartão de crédito, processado pela Stripe; cobrança da Alpha Inspeções e Auditoria.

| | **Basic** | **Premium** | **Intelligence** |
|---|---|---|---|
| **Preço** | R$ 79,90/mês | R$ 199/mês | R$ 89 por usuário/mês (mín. 3 → a partir de R$ 267/mês) |
| **Para quem** | Profissional começando | Equipe de obra | Operação completa com IA e BI |
| Obras ativas | 1 | Ilimitadas | Ilimitadas |
| Usuários | 1 | Até 5 | Por assento (contratados) |
| Checklists personalizados | 3 | Ilimitados | Ilimitados |
| Armazenamento | 2 GB | 20 GB | 100 GB |
| Retenção do histórico | 30 dias | 365 dias | Ilimitada |
| Inspeções, catálogo 83 checklists, offline, PDF, APK | ✓ | ✓ | ✓ |
| NC completo (criticidade + prazos estruturados) | — | ✓ | ✓ |
| Ciclo fiscal–executora | — | ✓ | ✓ |
| Papéis e permissões | — | ✓ | ✓ |
| Notificações push | — | ✓ | ✓ |
| Exportações Excel/CSV | — | ✓ | ✓ |
| Banco de experiência | — | ✓ | ✓ |
| Dashboard executivo (BI completo) | — | — | ✓ |
| Redação de RNC por IA | — | — | ✓ |
| Alertas inteligentes com IA | — | — | ✓ |
| Pirâmide de Bird + ocorrências | — | — | ✓ |
| Relatórios consolidados multi-obra | — | — | ✓ |
| Análise de tendências | — | — | ✓ |

**Regras de transição:** fim do teste sem assinatura → 30 dias em somente leitura (tudo visível e exportável) → conta arquivada com dados preservados. Assinantes da primeira onda: preço travado por 12 meses (condição de fundador). Dados já gerados permanecem sempre legíveis, independentemente do plano.

---

## 5. Números do produto

| Métrica | Valor |
|---|---|
| Versão em produção | **1.0.0** |
| Checklists profissionais no catálogo | **83** |
| Itens de verificação | **643** |
| Módulos de engenharia | **9** (Civil, Edificações, Elétrica, Eletromecânica, Linhas de Transmissão, Telecom, Comissionamento, Reformas, Transversal/SSMA) |
| Tipos de checklist | **6** (segurança/NR, meio ambiente, qualidade, documentação, equipamentos, execução) |
| Kits de obra prontos | **6** modelos (mais kits próprios ilimitados) |
| Textos-base de RNC curados | **643** (um por item do catálogo, curadoria técnica por módulo) |
| Telas do aplicativo | **25** |
| Evoluções de banco de dados (migrations) | **58** |
| Automações de servidor (Edge Functions) | **6** (checkout, webhook de pagamento, push, IA de alertas, e-mail semanal, geração de RNC) |
| Rotinas agendadas diárias | **3** (prazos de NC, alertas inteligentes, transição de planos) + resumo semanal |
| Testes automatizados | **103** (19 suítes) |
| Papéis de acesso | **4** + operador de plataforma |
| Idioma | Português do Brasil |
| Plataformas | Android (APK) · PWA instalável · Web desktop |

---

## 6. Glossário

- **NC (Não Conformidade)** — item de inspeção reprovado; vira uma pendência com criticidade, prazo e responsável até ser tratada e aprovada.
- **RNC (Relatório de Não Conformidade)** — documento formal numerado (RNC-ANO-NNNN) que descreve o desvio com base normativa, evidências e disposição; exporta em PDF.
- **Checklist** — roteiro de verificação de um serviço ou tema, composto de itens com critério de aceitação.
- **Item de verificação** — cada pergunta do checklist, respondida como Conforme, Não Conforme ou Não se Aplica.
- **Kit de obra** — conjunto pré-montado de checklists adequado a um tipo de obra; filtra o catálogo na hora da inspeção.
- **Módulo** — disciplina de engenharia do checklist (Civil, Elétrica, Telecom…).
- **Criticidade** — gravidade da NC (baixa, média, alta, crítica); define o prazo sugerido de tratamento.
- **Ciclo fiscal–executora** — fluxo em que a executora trata a NC e a fiscalização aprova ou reprova, com histórico completo.
- **Executora / Contratada** — empresa que executa o serviço inspecionado; no FieldCheck, tem acesso restrito às próprias pendências.
- **Pirâmide de Bird** — modelo clássico de segurança (600 desvios : 30 danos : 10 acidentes leves : 1 grave); no FieldCheck, é alimentada pelas inspeções e ocorrências e denuncia subnotificação.
- **Ato inseguro / Condição insegura / Quase-acidente** — classificações comportamentais de NC de segurança que formam a base da pirâmide.
- **Ocorrência** — registro de dano material ou acidente (com ou sem afastamento), níveis superiores da pirâmide.
- **Frente de serviço** — local/equipe da obra onde a inspeção foi feita.
- **Item de cronograma / EAP** — código do planejamento da obra ao qual a inspeção se amarra, para rastreabilidade com o cronograma (EAP = Estrutura Analítica do Projeto).
- **Projeto de referência** — documento técnico (com revisão) contra o qual o serviço foi inspecionado.
- **Registro retroativo** — inspeção registrada com a data em que o fato ocorreu, sinalizada como tal e com carimbo real de registro preservado.
- **EXIF** — metadados da foto (data/hora e GPS de captura), extraídos das fotos de galeria como reforço de evidência.
- **Evidência de conformidade** — foto anexada a item aprovado, provando o que estava correto.
- **Banco de experiência** — estatísticas históricas da própria empresa: itens que mais reprovam e tempos de tratamento.
- **Alertas inteligentes** — avisos automáticos diários (NC vencida, reincidência, contratada em queda, conformidade baixa), com explicação por IA opcional.
- **Texto-base de RNC** — redação técnica curada de cada item do catálogo, usada como matéria-prima pela IA na RNC.
- **Trial** — teste grátis de 30 dias com acesso completo (Intelligence), sem cartão.
- **Somente leitura (readonly)** — estado da conta após o teste ou cancelamento: tudo visível e exportável, criação suspensa.
- **Cortesia** — acesso gratuito por período determinado, concedido pela Alpha.
- **Assento (seat)** — unidade de cobrança do plano Intelligence (por usuário/mês).
- **PWA** — aplicativo instalável direto do navegador, com ícone e funcionamento offline.
- **Sincronização (sync)** — envio automático do trabalho feito offline quando há conexão, sem duplicar registros.
