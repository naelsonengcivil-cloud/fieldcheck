import { defineConfig, devices } from "@playwright/test";

// ============================================================
// Playwright e2e (RF/NFR §6). Sobe o dev server e roda os testes de
// fluxo no navegador. O fluxo autenticado completo (inspeção → sync)
// requer credenciais de teste do Supabase em variáveis de ambiente;
// o smoke test roda sem backend.
// ============================================================

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
