/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // (Sem publishable key do Stripe: o checkout é hospedado — o app chama a Edge
  //  `criar-checkout` e redireciona. Nenhum Stripe.js/Elements no cliente.)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
