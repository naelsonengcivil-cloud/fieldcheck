# Política de Privacidade — FieldCheck

**Última atualização:** 2026-07-23
**Controlador:** Alpha Inspeções e Auditoria — aplicativo **FieldCheck** (`com.alphainspecoes.fieldcheck`).
**Contato / Encarregado (DPO):** `<privacidade@fieldcheck.app.br>` *(ajuste para o e-mail que você monitora)*

> **Publicar em uma URL pública** (ex.: `https://fieldcheck.app.br/privacidade`) e informar essa URL no Google Play Console. O texto abaixo é a base — revise nomes/e-mail antes de publicar.

O FieldCheck é uma ferramenta **profissional (B2B)** de inspeções de campo em obras. Esta política explica quais dados tratamos, por quê, com quem compartilhamos e quais são os seus direitos, conforme a **Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018)**.

## 1. Quais dados coletamos
- **Dados de conta:** nome e e-mail (para autenticação e identificação do usuário na empresa).
- **Conteúdo de trabalho:** obras, checklists, inspeções, não conformidades, desvios/ocorrências, tratamentos e relatórios que você registra.
- **Fotos (evidências):** imagens capturadas pela câmera ou escolhidas da galeria, anexadas às inspeções/NCs/desvios.
- **Metadados de foto (EXIF):** quando a foto vem da galeria, podemos ler data/hora e localização de captura, como reforço de evidência.
- **Localização (GPS):** coordenadas do momento da inspeção, para rastreabilidade do registro. Coletada apenas durante o uso, com sua permissão.
- **Identificador de notificação (token FCM):** para enviar notificações push, se você ativar.
- **Dados de pagamento:** processados diretamente pela **Stripe**. **Não armazenamos números de cartão** nos nossos servidores.

## 2. Para que usamos
- Prestar o serviço: registrar inspeções, gerar NCs/RNCs, painéis e relatórios.
- Funcionamento offline e sincronização dos seus dados.
- Enviar notificações e o resumo semanal por e-mail (opcionais, com opt-out).
- Gerar, **por inteligência artificial**, sugestões de texto (triagem de desvios, redação de RNC) a partir das fotos e da descrição — **sempre revisáveis por você** e sem decisão automatizada final.
- Cobrança da assinatura e segurança da conta.

**Base legal (LGPD):** execução de contrato e legítimo interesse para prestar o serviço; consentimento para permissões do dispositivo (câmera, localização, notificações).

## 3. Permissões do aplicativo
- **Câmera** — tirar fotos de evidência.
- **Localização (precisa/aproximada)** — registrar onde a inspeção foi feita.
- **Notificações** — avisos de prazos e alertas (opcional).
- **Internet** — sincronizar com o servidor.

Você pode revogar essas permissões nas configurações do dispositivo; algumas funções ficam limitadas sem elas.

## 4. Com quem compartilhamos (operadores/subprocessadores)
Compartilhamos dados apenas com prestadores que viabilizam o serviço, sob contrato:
- **Supabase** — banco de dados, armazenamento de fotos e autenticação (infraestrutura).
- **Stripe** — processamento de pagamentos.
- **Google / Firebase (FCM)** — entrega de notificações push.
- **Anthropic (Claude API)** — análise por IA das fotos/descrições para gerar os textos sugeridos. Os dados são processados **apenas para gerar a resposta** e **não são usados para treinar modelos**.
- **Resend** — envio do e-mail de resumo semanal.

**Não vendemos seus dados** nem os usamos para publicidade.

## 5. Isolamento e segurança
- **Isolamento por empresa (multi-tenant):** regras de segurança em nível de banco (RLS) garantem que os dados de uma empresa não sejam acessíveis por outra.
- **Criptografia em trânsito:** toda a comunicação usa HTTPS/TLS.
- Acesso restrito por papéis (administrador, gestor, inspetor, executora).

## 6. Retenção e exclusão
- Mantemos seus dados enquanto a conta estiver ativa.
- Após o fim do teste ou cancelamento, a conta entra em **somente-leitura** por um período e depois é **arquivada** — os dados são preservados, não apagados de imediato.
- Você pode solicitar **exclusão** dos seus dados a qualquer momento pelo contato acima.

## 7. Seus direitos (LGPD)
Você pode solicitar: confirmação e acesso aos dados, correção, anonimização, portabilidade, informação sobre compartilhamento e exclusão. Basta escrever para o contato indicado no topo.

## 8. Menores
O FieldCheck é destinado a uso **profissional** e não se dirige a menores de 18 anos.

## 9. Alterações
Podemos atualizar esta política; a data de "última atualização" indica a versão vigente. Mudanças relevantes serão comunicadas no app ou por e-mail.

## 10. Contato
Dúvidas ou solicitações sobre privacidade: `<privacidade@fieldcheck.app.br>`.
