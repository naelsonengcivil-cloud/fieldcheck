# FieldCheck — Identidade da keystore de release (Play Store)

> ⚠️ **A senha NÃO está documentada aqui** — ela vive apenas no gerenciador de senhas do Naelson.
> **Keystore insubstituível:** perder o arquivo **ou** a senha impede publicar qualquer atualização do app sob o pacote `com.alphainspecoes.fieldcheck`. Faça e mantenha os backups (checklist abaixo).

## Identidade (para conferência futura)
| Campo | Valor |
|---|---|
| Alias | `fieldcheck` |
| Algoritmo da chave | RSA 2048 bits |
| Algoritmo de assinatura | SHA384withRSA |
| Titular (DN) | `CN=Alpha Inspecoes e Auditoria, OU=FieldCheck, O=Alpha Inspecoes e Auditoria, L=Cidade, ST=UF, C=BR` |
| Criada em | 2026-07-22 |
| Válida até | **2053-12-07** |
| **SHA-256** | `32:D4:81:73:D4:42:F1:99:67:CB:0D:12:DB:BD:38:83:DB:E6:76:99:95:95:4B:AD:AB:11:D7:D5:2B:EA:86:3C` |
| Caminho local (fora do repo) | `C:\Users\Naelson Junior\fieldcheck-release.keystore` |
| Primeiro AAB assinado | 2026-07-22 — `android/app/build/outputs/bundle/release/app-release.aab` (versionCode 2 / versionName 1.0.0) |

**Verificação:** a impressão digital SHA-256 acima foi extraída da keystore (`keytool -list -v`) **e** do certificado do AAB (`keytool -printcert -jarfile`) — **conferem** → o AAB foi assinado com esta keystore.

## Como reconferir (a senha é digitada pelo Naelson, nunca gravada)
```
"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v \
  -keystore "C:\Users\Naelson Junior\fieldcheck-release.keystore" -alias fieldcheck
```
Comparar o SHA-256 com o desta ficha.

## Checklist de backup (marcar quando feito)
- [x] Cópia em nuvem corporativa (2026-07-23 — SHA-256 da cópia confere com o original)
- [ ] Cópia em mídia física (pendrive / HD externo)
- [x] Senha registrada em gerenciador de senhas
- [x] Backup testado — `keytool -list` abriu na cópia com a senha (alias `fieldcheck`, SHA-256 termina em `2B:EA:86:3C`)
- [ ] **Play App Signing ativado** no Play Console (marcar ao criar o app — o Google guarda a chave de assinatura do app; esta keystore passa a ser a *upload key*)

> Nunca versionar a keystore nem a senha. O arquivo real de senhas é `android/keystore.properties` (gitignored); a referência sem senha é `keystore.properties.example`.
