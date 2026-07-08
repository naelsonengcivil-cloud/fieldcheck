# Configuração de e-mail do Supabase Auth (Marco H + onboarding)

Isso habilita **recuperação de senha** (Marco H) e **confirmação de cadastro**
(fecha o elo do onboarding autônomo). Tudo no painel Supabase → **Authentication**.

## 1. URL Configuration (Authentication → URL Configuration)
- **Site URL:** `https://fieldcheck-sigma.vercel.app`
- **Redirect URLs** (allowlist — adicione as duas):
  - `https://fieldcheck-sigma.vercel.app/**`
  - `http://localhost:5173/**`  *(para testar em desenvolvimento)*

> O app chama `resetPasswordForEmail(email, { redirectTo: window.location.origin })`,
> então a origem (prod e localhost) precisa estar na allowlist.

## 2. Email Templates (Authentication → Emails → Templates)
Troque **Subject** e **Message body (HTML)**. As variáveis `{{ .ConfirmationURL }}`
são preenchidas pelo Supabase.

### Confirm signup
**Subject:** `Confirme seu e-mail — FieldCheck`
```html
<h2 style="font-family:Arial,sans-serif;color:#1C2733">Bem-vindo ao FieldCheck</h2>
<p style="font-family:Arial,sans-serif;font-size:15px;color:#16181B">
  Confirme seu e-mail para ativar a conta e criar sua empresa (teste grátis de 14 dias).
</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;background:#F5A800;color:#16181B;font-weight:700;
            text-decoration:none;padding:12px 20px;border-radius:10px;font-family:Arial,sans-serif">
    Confirmar meu e-mail
  </a>
</p>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:24px">
  FieldCheck — inspeções de campo · produto da Alpha Inspeções e Auditoria.
</p>
```

### Reset Password
**Subject:** `Redefinição de senha — FieldCheck`
```html
<h2 style="font-family:Arial,sans-serif;color:#1C2733">Redefinir sua senha</h2>
<p style="font-family:Arial,sans-serif;font-size:15px;color:#16181B">
  Recebemos um pedido para redefinir a senha da sua conta FieldCheck. Clique abaixo
  para criar uma nova senha.
</p>
<p>
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;background:#F5A800;color:#16181B;font-weight:700;
            text-decoration:none;padding:12px 20px;border-radius:10px;font-family:Arial,sans-serif">
    Criar nova senha
  </a>
</p>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#5A5F66">
  Se você não fez este pedido, ignore este e-mail — sua senha continua a mesma.
</p>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:24px">
  FieldCheck — inspeções de campo · produto da Alpha Inspeções e Auditoria.
</p>
```

## 3. (Recomendado p/ produção) SMTP próprio
O e-mail padrão do Supabase tem **limite baixo de envio** (ok para teste). Para
produção, configure **Custom SMTP** (ex.: Resend/SendGrid) em Authentication →
Emails → SMTP Settings, para entregabilidade e volume.

## 4. Validação (depois de configurar)
1. No app (login) → **"Esqueci minha senha"** → informe um e-mail de teste → o
   e-mail deve chegar.
2. Clique no link → o app abre na tela **"Definir nova senha"** → salve → login com
   a nova senha.
3. Cadastro novo (com "Confirm email" ligado) → o e-mail de confirmação chega →
   confirmar → primeiro login cria a empresa (trial) → **acesso liberado**.
