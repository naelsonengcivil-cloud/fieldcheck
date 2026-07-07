# App nativo — FieldCheck (Capacitor · Android/iOS)

O app é um PWA (React+Vite) empacotado com **Capacitor 6**. A camada
`src/lib/plataforma.ts` usa recursos nativos (câmera, geolocalização, rede,
compartilhamento, status bar, splash) quando empacotado e cai para APIs web no
PWA — o mesmo código serve os dois.

As pastas nativas `android/` e `ios/` **não são versionadas** (ver `.gitignore`)
— elas são **regeneradas** a partir da configuração versionada
(`capacitor.config.ts`, os plugins do `package.json` e `assets/logo.png`). O
build do APK/AAB assinado e a submissão às lojas são feitos na **sua máquina**
(precisam de SDK/IDE). Abaixo o passo a passo.

## Primeira vez (gerar o projeto nativo)
```bash
npm install
npm run build
npx cap add android                                   # cria android/
npx @capacitor/assets generate --android \            # ícones + splash (fundo navy)
  --iconBackgroundColor '#1C2733' --splashBackgroundColor '#1C2733'
npx cap sync android
```
As permissões de **câmera** e **localização** entram automaticamente no APK pela
fusão dos manifests dos plugins (`@capacitor/camera`, `@capacitor/geolocation`);
`INTERNET` já vem por padrão. *(Opcional: para não exigir câmera na Play Store,
adicione `<uses-feature android:name="android.hardware.camera" android:required="false" />`
ao `android/app/src/main/AndroidManifest.xml`.)*

## Pré‑requisitos (Android)
- **JDK 17** (o Gradle do Capacitor 6 exige 17).
- **Android Studio** (inclui o Android SDK + build‑tools) ou o SDK via
  command‑line tools.
- Node/npm (já usados no projeto).

## Ciclo de build (web → nativo)
Sempre que o app web mudar, reconstrua e sincronize antes de gerar o APK:

```bash
npm run build          # gera dist/ (Vite)
npx cap sync android   # copia dist/ + plugins + config para android/
npx cap open android   # abre no Android Studio
```

No Android Studio: **Run** num emulador/dispositivo, ou **Build → Build Bundle(s)/APK(s)**.

## Gerar release assinado (Play Store)
1. Crie um **keystore** (uma vez; guarde bem — sem ele não dá para atualizar o app):
   ```bash
   keytool -genkey -v -keystore fieldcheck-release.keystore \
     -alias fieldcheck -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Em `android/`, crie `keystore.properties` (NÃO commitar — já está no
   `.gitignore` do Android):
   ```
   storeFile=../fieldcheck-release.keystore
   storePassword=•••
   keyAlias=fieldcheck
   keyPassword=•••
   ```
   e referencie‑o no `android/app/build.gradle` (bloco `signingConfigs`), ou
   assine pelo Android Studio (**Build → Generate Signed Bundle / APK → AAB**).
3. Suba o **.aab** no **Google Play Console** (crie o app, ficha da loja,
   política de privacidade, screenshots).

- **applicationId / appId**: `com.alphainspecoes.fieldcheck` (namespace da Alpha,
  dona do SaaS) — definido em `capacitor.config.ts` e no Gradle.
- **Versão**: suba `versionCode`/`versionName` em `android/app/build.gradle` a
  cada release.

## Permissões no APK
`INTERNET` (padrão) + `CAMERA` e `ACCESS_FINE/COARSE_LOCATION` (fundidas dos
plugins `@capacitor/camera` e `@capacitor/geolocation`). O Android pede o
consentimento em tempo de execução; os plugins Capacitor cuidam do prompt.

## Ícone e splash
Gerados por `@capacitor/assets` a partir de `assets/logo.png` (fundo navy
`#1C2733`). Para rebrandizar: troque `assets/logo.png` por um PNG **1024×1024**
(idealmente) e rode:
```bash
npx @capacitor/assets generate --android \
  --iconBackgroundColor '#1C2733' --splashBackgroundColor '#1C2733'
npx cap sync android
```

## iOS (quando houver um Mac)
```bash
npm i @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios   # Xcode: assinar com a conta Apple Developer, arquivar, subir p/ App Store Connect
```
Info.plist precisa de `NSCameraUsageDescription` e
`NSLocationWhenInUseUsageDescription` (o Xcode/os plugins avisam).

## Limitação conhecida — retorno do pagamento (Stripe)
No app nativo, o Checkout do Stripe abre no navegador e retorna para a `APP_URL`
(a URL Vercel), não de volta para dentro do app. Para uma volta "dentro do app"
seria preciso um **deep link / custom scheme** + `@capacitor/browser`. Fica como
refinamento pós‑lançamento; hoje o usuário volta ao app manualmente e o webhook
já libera o plano no servidor.
