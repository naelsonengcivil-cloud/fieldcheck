-- ============================================================
-- 0038 — Curadoria dos textos-base da RNC: PILOTO checklist CV-02
--        (Escavações e Reaterros — execução).
--
-- Corrige as fraquezas sistêmicas detectadas na auditoria do seed 0024:
--   (a) risco/consequência era IDÊNTICO em todos os itens do checklist;
--   (b) fundamentação citava norma de nível checklist, não do item;
--   (c) vazamento de conteúdo (ação do item 1 aparecia em outros itens);
--   (d) gravidade_sugerida em frase-faixa vaga.
-- Cada item passa a ter fundamentação (norma pertinente), risco e ação
-- ESPECÍFICOS, e gravidade com regra de escalonamento própria (o parser lê a
-- 1ª palavra: Maior/Menor/Crítica/Observação). O texto_requisito_descumprido
-- já era item-específico e é mantido. Placeholders preservados.
-- Escrita restrita a super_admin (tabela de plataforma).
-- ============================================================

-- Item 1 — Cotas e dimensões conforme projeto
update public.rnc_textos_base set
  gravidade_sugerida = 'Maior — elevar a Crítica se a divergência comprometer o apoio de fundações ou de estruturas subsequentes',
  texto_fundamentacao_normativa = 'A geometria da escavação (profundidade, largura e off-sets) deve reproduzir o projeto executivo aprovado, condição verificada por levantamento topográfico. Aplicam-se a NBR 6122 (projeto e execução de fundações) e o projeto executivo aprovado nº {{projeto_num}}, rev. {{projeto_rev}}, que definem as cotas e a geometria de assentamento. O critério "Profundidade, largura e off-sets conferidos por topografia" integra o plano de inspeção da obra e constitui requisito verificável de aceitação da etapa.',
  texto_risco_consequencia = 'Escavação executada fora das cotas e da geometria de projeto compromete a interface com fundações e estruturas subsequentes, podendo exigir retrabalho e adequações de projeto, com sobrecusto e atraso de cronograma. A permanência da condição mantém ativo o desvio geométrico até a efetiva correção. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) reconferir topograficamente cotas, largura e off-sets do trecho, confrontando com o projeto executivo aprovado; (ii) corrigir a geometria da escavação (reaterro controlado ou novo corte, conforme o caso), restabelecendo o atendimento ao projeto; (iii) evidenciar a correção com registro fotográfico ({{evidencia_foto_correcao}}) e novo levantamento topográfico, submetendo à reinspeção para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 1;

-- Item 2 — Classificação do material registrada
update public.rnc_textos_base set
  gravidade_sugerida = 'Menor — elevar a Maior se a classificação incorreta induzir método de escavação inadequado ou medição indevida',
  texto_fundamentacao_normativa = 'A classificação do material escavado (1ª, 2ª ou 3ª categoria) deve ser registrada com evidência, para fins de medição contratual e de adequação do método de escavação ao tipo de terreno. Aplicam-se os critérios de medição do contrato e as boas práticas de terraplenagem, tomando por referência o projeto executivo aprovado nº {{projeto_num}}, rev. {{projeto_rev}}, e o memorial correspondente. O critério "1ª/2ª/3ª categoria para medição e adequação de método" integra o plano de inspeção da obra e constitui requisito verificável de aceitação.',
  texto_risco_consequencia = 'A ausência ou incorreção do registro de categoria do material pode gerar medição e pagamento indevidos e induzir método de escavação inadequado ao terreno (por exemplo, equipamento incompatível com rocha), com impacto em produtividade, custo e segurança da frente. A permanência da condição mantém comprometida a rastreabilidade da medição. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) registrar a categoria do material com evidência objetiva (registro fotográfico, laudo ou verificação expedita in loco); (ii) revisar o boletim de medição afetado e adequar o método e o equipamento de escavação ao material efetivamente encontrado; (iii) evidenciar a regularização ({{evidencia_foto_correcao}}) e submeter à reinspeção para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 2;

-- Item 3 — Escoramento/talude conforme projeto (interface ST-14)
update public.rnc_textos_base set
  gravidade_sugerida = 'Maior — elevar a Crítica quando houver risco grave e iminente de desmoronamento com pessoas expostas (paralisação imediata)',
  texto_fundamentacao_normativa = 'Escavações com profundidade superior a 1,25 m, ou em solo instável, exigem escoramento ou talude dimensionado, conforme a NR-18 (Segurança e Saúde no Trabalho na Indústria da Construção) e a NBR 9061 (segurança de escavação a céu aberto), além do projeto geotécnico/executivo aprovado nº {{projeto_num}}, rev. {{projeto_rev}}. O critério "Obrigatório acima de 1,25 m ou solo instável (interface ST-14)" integra o plano de inspeção da obra e constitui requisito verificável de aceitação, com interface direta com a segurança do trabalho.',
  texto_risco_consequencia = 'Escavação sem escoramento ou talude adequado apresenta risco de desmoronamento e soterramento, com potencial de acidente grave ou fatal para os trabalhadores na vala (interface ST-14). Trata-se de condição de risco à vida enquanto a proteção não for implantada. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) paralisar imediatamente as atividades na vala e isolar a área; (ii) implantar o escoramento ou executar o talude conforme o projeto geotécnico e a NR-18/NBR 9061, sob responsabilidade técnica; (iii) liberar o retorno da frente somente após verificação da proteção, evidenciando a correção com registro fotográfico ({{evidencia_foto_correcao}}) e submetendo à reinspeção para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 3;

-- Item 4 — Fundo de vala regularizado
update public.rnc_textos_base set
  gravidade_sugerida = 'Maior — elevar a Crítica se comprometer a capacidade de apoio da fundação ou da tubulação assentada',
  texto_fundamentacao_normativa = 'O fundo da vala deve estar regularizado, apiloado e com lastro conforme a especificação, livre de material solto, para garantir apoio uniforme à fundação ou à tubulação. Aplicam-se a NBR 6122 (projeto e execução de fundações) e a especificação de assentamento do projeto executivo aprovado nº {{projeto_num}}, rev. {{projeto_rev}}. O critério "Apiloado/lastro conforme especificação, sem material solto" integra o plano de inspeção da obra e constitui requisito verificável de aceitação.',
  texto_risco_consequencia = 'Fundo de vala irregular ou com material solto produz apoio não uniforme, favorecendo recalques diferenciais e perda de capacidade de suporte da fundação ou da tubulação assentada, com risco de patologias estruturais e de vazamentos. A permanência da condição compromete o desempenho do elemento apoiado. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) remover o material solto e regularizar o fundo da vala; (ii) executar o apiloamento e o lastro conforme a especificação, restabelecendo apoio uniforme; (iii) evidenciar a correção com registro fotográfico ({{evidencia_foto_correcao}}) e reinspecionar antes do assentamento, para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 4;

-- Item 5 — Interferências verificadas antes do corte
update public.rnc_textos_base set
  gravidade_sugerida = 'Maior — elevar a Crítica quando houver redes energizadas ou pressurizadas no traçado (risco grave e iminente)',
  texto_fundamentacao_normativa = 'Antes do corte, as interferências enterradas (redes elétricas, de gás, água, esgoto e dados) devem ser verificadas por consulta ao cadastro de redes e, quando necessário, por sondagem/prospecção, conforme a NR-18 e as boas práticas de escavação, tomando por referência o projeto executivo aprovado nº {{projeto_num}}, rev. {{projeto_rev}}. O critério "Cadastro de redes consultado; sondagem quando necessário" integra o plano de inspeção da obra e constitui requisito verificável de aceitação.',
  texto_risco_consequencia = 'Escavar sem verificar interferências pode romper redes enterradas, causando acidentes (choque elétrico, explosão, inundação), interrupção de serviços essenciais e danos a terceiros, com responsabilização e paralisação da obra. A permanência da condição mantém o risco ativo em todo avanço do corte. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) consultar o cadastro de redes e executar sondagem/prospecção do traçado antes de prosseguir; (ii) isolar, desenergizar ou desviar as interferências identificadas, com anuência das concessionárias quando aplicável; (iii) liberar o corte somente após a verificação, evidenciando-a com registro fotográfico ({{evidencia_foto_correcao}}) e submetendo à reinspeção para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 5;

-- Item 6 — Esgotamento de água controlado
update public.rnc_textos_base set
  gravidade_sugerida = 'Maior — elevar a Crítica se o carreamento de finos instabilizar taludes ou provocar recalque em áreas vizinhas',
  texto_fundamentacao_normativa = 'O esgotamento/rebaixamento de água na escavação deve ser controlado, sem carrear finos do solo, preservando a estabilidade do talude e do fundo. Aplicam-se a NBR 6122 e as boas práticas de rebaixamento de lençol freático, com referência ao projeto executivo aprovado nº {{projeto_num}}, rev. {{projeto_rev}}. O critério "Bombeamento sem carrear finos; estabilidade preservada" integra o plano de inspeção da obra e constitui requisito verificável de aceitação.',
  texto_risco_consequencia = 'O bombeamento que carreia finos remove material de suporte do solo, podendo instabilizar taludes e o fundo da vala e provocar recalques em estruturas e vias vizinhas, além de assoreamento e impacto na drenagem. A permanência da condição mantém a instabilização progressiva. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) adequar o sistema de esgotamento (poços, filtros ou ponteiras) para captar água sem arrastar finos; (ii) controlar a vazão e monitorar a estabilidade do talude, do fundo e das estruturas vizinhas; (iii) evidenciar a correção com registro fotográfico ({{evidencia_foto_correcao}}) e submeter à reinspeção para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 6;

-- Item 7 — Reaterro com material e compactação controlados
update public.rnc_textos_base set
  gravidade_sugerida = 'Maior — elevar a Crítica se o reaterro sem controle comprometer a estabilidade de estrutura, via ou tubulação apoiada',
  texto_fundamentacao_normativa = 'O reaterro deve ser executado em camadas, com material e grau de compactação (GC) conforme a especificação, comprovados por ensaio. Aplicam-se a NBR 7182 (ensaio de compactação — Proctor) e a especificação do projeto executivo aprovado nº {{projeto_num}}, rev. {{projeto_rev}}, para controle de umidade e densidade. O critério "Camadas e GC conforme especificação; ensaios executados" integra o plano de inspeção da obra e constitui requisito verificável de aceitação.',
  texto_risco_consequencia = 'Reaterro sem controle de camadas e de compactação resulta em recalques posteriores, com afundamento de pavimentos e estruturas apoiadas e possível ruptura de tubulações enterradas. A permanência da condição posterga a detecção do defeito para a fase de uso, quando a correção é mais onerosa. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) executar o reaterro em camadas conforme a especificação, controlando a umidade do material; (ii) comprovar o grau de compactação por ensaio (densidade in loco / Proctor) antes de liberar a etapa; (iii) evidenciar a correção com registro fotográfico ({{evidencia_foto_correcao}}) e os laudos de ensaio, submetendo à reinspeção para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 7;

-- Item 8 — Sinalização e proteção do perímetro (interface ST-14)
update public.rnc_textos_base set
  gravidade_sugerida = 'Maior — elevar a Crítica quando houver vala aberta com circulação de pessoas ou veículos sem proteção',
  texto_fundamentacao_normativa = 'O perímetro da escavação deve dispor de barreira física contínua e sinalização de segurança em todo o contorno, como proteção coletiva, conforme a NR-18 e a NR-6, com interface direta com a segurança do trabalho (ST-14). O critério "Barreira física em todo o contorno (interface ST-14)" integra o plano de inspeção da obra e constitui requisito verificável de aceitação.',
  texto_risco_consequencia = 'Perímetro de escavação sem barreira e sinalização adequadas expõe trabalhadores e terceiros à queda na vala e a atropelamento por veículos da obra, configurando risco de acidente grave (interface ST-14). Trata-se de condição de risco enquanto a proteção coletiva não for restabelecida. {{risco_complementar}}',
  texto_acao_corretiva = 'Recomenda-se: (i) instalar barreira física contínua e sinalização de segurança em todo o contorno da escavação, conforme a NR-18; (ii) isolar o acesso e manter a proteção até o fechamento definitivo da vala; (iii) evidenciar a correção com registro fotográfico ({{evidencia_foto_correcao}}) e submeter à reinspeção para fechamento desta RNC. Prazo: {{prazo}} dia(s) | Responsável: {{responsavel}}. {{acao_complementar}}'
where checklist_codigo = 'CV-02' and item_numero = 8;
