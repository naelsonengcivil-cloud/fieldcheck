import type { CapacitorConfig } from "@capacitor/cli";

// ============================================================
// Capacitor 6 — empacotamento nativo (iOS + Android).
// appId no namespace da Alpha (dona do SaaS). webDir = build do Vite.
// Plataformas nativas são adicionadas com `npx cap add android|ios`
// numa máquina com Android Studio / Xcode (ver README).
// ============================================================

const config: CapacitorConfig = {
  appId: "com.alphainspecoes.fieldcheck",
  appName: "FieldCheck",
  webDir: "dist",
  backgroundColor: "#F4F4F1",
  plugins: {
    Camera: {
      // permissões declaradas nos manifests nativos ao adicionar as plataformas
    },
  },
};

export default config;
