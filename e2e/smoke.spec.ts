import { test, expect } from "@playwright/test";

// ============================================================
// Smoke e2e: o app carrega como PWA e apresenta a tela de login
// (sem sessão persistida, sem depender do backend).
// ============================================================

test("carrega e mostra a tela de login", async ({ page }) => {
  await page.goto("/");

  // Marca do produto + faixa/design system.
  await expect(page.getByText("FieldCheck", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Entrar na sua conta")).toBeVisible();

  // Campos de e-mail e senha.
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("valida campos obrigatórios antes de autenticar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Informe e-mail e senha.")).toBeVisible();
});
