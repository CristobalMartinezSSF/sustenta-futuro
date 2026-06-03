import { test, expect } from '@playwright/test'

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    ?? 'e2e@playwright.sf'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'E2eTestSF2026!'

test('login page renders email and password inputs', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('invalid credentials show an error message', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'wrong@email.com')
  await page.fill('input[type="password"]', 'wrongpassword')
  await page.click('button[type="submit"]')

  // Error feedback — look for any error-style element or text
  await expect(
    page.locator('text=/credencial|inválid|incorrect|error/i').first()
  ).toBeVisible({ timeout: 8_000 })
})

test('valid admin credentials redirect to dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')

  // Should land on dashboard (URL changes away from /login)
  await expect(page).not.toHaveURL(/\/login/, { timeout: 12_000 })

  // Dashboard shows the leads table
  await expect(page.locator('table').first()).toBeVisible({ timeout: 10_000 })
})
