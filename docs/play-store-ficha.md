# FieldCheck — Ficha da Play Store (Fase B)

Conteúdo pronto para copiar/colar no **Google Play Console**. App: `com.alphainspecoes.fieldcheck` · versionName `1.0.0`.

---

## 1. Identidade do app
| Campo | Valor |
|---|---|
| Nome do app | **FieldCheck** |
| Categoria | Empresarial (Business) — alternativa: Produtividade |
| Tags/segmento | Inspeção, qualidade, segurança do trabalho, construção civil |
| E-mail de contato | `<contato@fieldcheck.app.br>` *(ajuste para o e-mail que você monitora)* |
| Site | `https://fieldcheck.app.br` |
| Política de privacidade (URL) | `https://fieldcheck.app.br/privacidade` *(publicar `docs/politica-privacidade.md`)* |
| Público-alvo | Adultos / uso profissional (18+) |

---

## 2. Descrição curta (≤ 80 caracteres)
```
Inspeções de obra offline: checklists, não conformidades e RNC com IA.
```
*(70 caracteres)*

---

## 3. Descrição completa (≤ 4000 caracteres)
```
O FieldCheck é o app de inspeção de campo para quem faz o controle de qualidade e segurança em obras. Registre inspeções, capture evidências e trate não conformidades direto do celular — mesmo sem internet.

FUNCIONA OFFLINE DE VERDADE
Faça a inspeção no campo sem sinal. Fotos, respostas e ocorrências ficam salvas no dispositivo e sincronizam sozinhas quando a conexão volta. Um painel mostra o que está pendente e sinaliza qualquer erro de sincronização.

CHECKLISTS E INSPEÇÕES
Monte checklists por tipo de serviço e execute inspeções item a item, com foto de evidência, localização (GPS) e status de conformidade. Cada registro fica rastreável.

NÃO CONFORMIDADES E RNC
Abra não conformidades a partir da inspeção e gere o Relatório de Não Conformidade (RNC) com apoio de inteligência artificial — o texto vem pronto para você revisar e aprovar. Nada é enviado sem a sua conferência.

DESVIOS E PIRÂMIDE DE BIRD
Registre desvios avulsos direto do campo, faça a triagem com apoio de IA e acompanhe a Pirâmide de Bird para enxergar a base dos incidentes antes que virem acidentes.

PAINÉIS E RASTREABILIDADE
Acompanhe o andamento por obra, o volume de não conformidades e o histórico de tratamento em painéis objetivos.

MULTIEMPRESA E PAPÉIS
Cada empresa vê apenas os seus dados, com isolamento no banco. Perfis de administrador, gestor, inspetor e executora com as permissões certas para cada um.

NOTIFICAÇÕES
Receba avisos de prazos e um resumo semanal por e-mail (opcionais).

PARA QUEM É
Construtoras, gerenciadoras, empresas de inspeção e auditoria, engenheiros e técnicos de segurança do trabalho que precisam de evidência e rastreabilidade no campo.

Assinatura com teste gratuito. Cancele quando quiser.
```

---

## 4. Novidades desta versão (release notes)
```
Primeira versão pública do FieldCheck.
- Inspeções offline com fotos, GPS e checklists.
- Não conformidades e RNC com apoio de IA.
- Registro e triagem de desvios (Pirâmide de Bird).
- Painéis de acompanhamento e sincronização.
```

---

## 5. Segurança dos dados (formulário "Data safety")
Respostas para o questionário do Play Console.

**Coleta/compartilhamento geral**
- O app **coleta** dados do usuário: **Sim**.
- O app **compartilha** dados com terceiros (operadores): **Sim** — apenas com prestadores que viabilizam o serviço (processadores), não para publicidade.
- Todos os dados são **criptografados em trânsito**: **Sim** (HTTPS/TLS).
- O usuário pode **solicitar exclusão** dos dados: **Sim**.

**Tipos de dados coletados** (marque no formulário):
| Categoria Play | Item | Coletado | Compartilhado | Finalidade | Obrigatório |
|---|---|---|---|---|---|
| Informações pessoais | Nome | Sim | Sim (Supabase) | Funcionalidade do app; gerenciamento de conta | Sim |
| Informações pessoais | E-mail | Sim | Sim (Supabase) | Funcionalidade do app; gerenciamento de conta | Sim |
| Localização | Localização precisa | Sim | Sim (Supabase) | Funcionalidade do app (rastreabilidade da inspeção) | Opcional |
| Localização | Localização aproximada | Sim | Sim (Supabase) | Funcionalidade do app | Opcional |
| Fotos e vídeos | Fotos | Sim | Sim (Supabase; IA Anthropic p/ gerar texto) | Funcionalidade do app | Sim (para evidência) |
| ID do dispositivo | ID/token de push (FCM) | Sim | Sim (Google/Firebase) | Notificações (funcionalidade) | Opcional |
| Atividade no app | Conteúdo gerado pelo usuário (inspeções, NCs, desvios) | Sim | Sim (Supabase) | Funcionalidade do app | Sim |
| Info financeira | Pagamento | Coletado **pela Stripe**, não pelo app | — | Compra no app | Sim (se assinar) |

> **Pagamento:** os dados de cartão são coletados e processados diretamente pela **Stripe** (checkout hospedado). O app **não** recebe nem armazena número de cartão — declare conforme a orientação do Play (processado por terceiro).

**Processadores / com quem os dados são compartilhados** (para a política, não é campo do Play):
Supabase (infra: banco, storage, auth) · Stripe (pagamento) · Google/Firebase (push) · Anthropic/Claude (IA — só gera o texto, não treina modelo) · Resend (e-mail).

**Não** vendemos dados e **não** usamos para publicidade/rastreamento de terceiros.

---

## 6. Permissões declaradas (para a aba de permissões)
| Permissão Android | Uso |
|---|---|
| `CAMERA` | Fotografar evidências da inspeção |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Georreferenciar o registro |
| `INTERNET` | Sincronizar dados com o servidor |
| Notificações (FCM) | Avisos de prazos/alertas (opcional) |

---

## 7. Assets ainda necessários (checklist de upload)
- [ ] Ícone 512×512 (PNG, 32 bits, com alpha)
- [ ] Feature graphic 1024×500
- [ ] Screenshots do celular (mín. 2; recomendado 4–8) — 16:9 ou 9:16
- [ ] Política de privacidade publicada em URL pública
- [ ] Classificação de conteúdo (questionário IARC)
- [ ] Público-alvo e conteúdo
- [ ] AAB assinado: `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] **Play App Signing** ativado ao criar o app (esta keystore vira *upload key* — ver `docs/KEYSTORE_INFO.md`)
