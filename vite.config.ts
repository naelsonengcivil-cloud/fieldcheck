import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "FieldCheck — Inspeções de Campo",
        short_name: "FieldCheck",
        description:
          "Inspeções de campo em obras: checklists, não conformidades e KPIs, com funcionamento offline.",
        lang: "pt-BR",
        theme_color: "#1C2733",
        background_color: "#F4F4F1",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App shell precache; Supabase/API calls stay network-first (handled in app sync layer).
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // O SW do Firebase (web push) é um worker próprio, registrado à parte —
        // não deve ser precacheado nem interceptado pelo workbox.
        globIgnores: ["firebase-messaging-sw.js"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/firebase-cloud-messaging-push-scope/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Allow testing the service worker in `npm run dev`.
        enabled: true,
        type: "module",
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Runtime do React num chunk de vendor estável → cache entre deploys
        // (não muda a cada release). Supabase fica com o split automático do
        // Vite para não quebrar o lazy-load interno do realtime.
        manualChunks(id) {
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
        },
      },
    },
  },
});
