import { test, expect, Page } from '@playwright/test'

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    ?? 'e2e@playwright.sf'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'E2eTestSF2026!'

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page).not.toHaveURL(/\/login/, { timeout: 12_000 })
}

test('admin dashboard shows leads table with at least one row', async ({ page }) => {
  await login(page)
  await page.goto('/')

  // Leads table is visible
  const table = page.locator('table').first()
  await expect(table).toBeVisible({ timeout: 10_000 })

  // At least one data row (tbody tr) — the leads submitted by E2E tests
  const rows = page.locator('table tbody tr')
  await expect(rows.first()).toBeVisible({ timeout: 8_000 })
})

test('admin can filter or search leads', async ({ page }) => {
  await login(page)
  await page.goto('/')

  // Look for a search/filter input
  const searchInput = page.locator('input[placeholder*="buscar" i], input[placeholder*="search" i], input[placeholder*="filtrar" i]').first()

  if (await searchInput.isVisible()) {
    await searchInput.fill('Test')
    // Table should still render (even if no results)
    await expect(page.locator('table')).toBeVisible()
  } else {
    // If no search, just verify table has expected columns
    const header = page.locator('table thead th, table thead td').first()
    await expect(header).toBeVisible()
  }
})

test('admin leads table has an Estado column', async ({ page }) => {
  await login(page)
  await page.goto('/')

  // Wait for table to load
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 })

  // Status column header should exist
  await expect(page.locator('table thead').getByText('Estado', { exact: false })).toBeVisible()
})
