# FieldCheck — Build de release Android (Play Store)

> A pasta `android/` é **gitignored** (padrão Capacitor — regenerada por `npx cap add android`). A configuração de assinatura abaixo é **local** e precisa ser recriada se a pasta for regenerada. **Nenhuma senha ou keystore fica no repositório.**

## Keystore (uma vez, fora do repo)
Criada em `%USERPROFILE%\fieldcheck-release.keystore`, alias `fieldcheck`, com:
```
keytool -genkeypair -v -keystore "%USERPROFILE%\fieldcheck-release.keystore" \
  -alias fieldcheck -keyalg RSA -keysize 2048 -validity 10000
```
⚠️ **Guardar o arquivo + a senha em cofre + backup externo.** Perder = não dá mais para atualizar o app na Play Store.

## Assinatura no Gradle
`android/app/build.gradle` lê de `android/keystore.properties` (gitignored):
```properties
storeFile=C:/Users/<user>/fieldcheck-release.keystore
keyAlias=fieldcheck
storePassword=<senha>
keyPassword=<senha>
```
Se `keystore.properties` não existir, o build de release sai **sem assinatura** (proposital).

## Gerar o AAB assinado
```
npm run build            # web (Vite)
npx cap sync android     # copia dist + plugins para android/
cd android && ./gradlew bundleRelease
# saída: android/app/build/outputs/bundle/release/app-release.aab
```
(O Gradle usa o JDK do Android Studio: `C:\Program Files\Android\Android Studio\jbr` — apontar `JAVA_HOME` para ele se `java` não estiver no PATH.)

## Versionamento
`android/app/build.gradle` → `versionCode` (inteiro incremental a cada envio à loja) e `versionName` (semver visível). Atual: `versionCode 2`, `versionName "1.0.0"`.
