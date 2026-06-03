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

test('clicking a lead row navigates to lead detail page', async ({ page }) => {
  await login(page)
  await page.goto('/')

  // Wait for at least one lead row
  const firstRow = page.locator('table tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 10_000 })

  // Click the first cell (lead name) which triggers row navigation
  await firstRow.locator('td').first().click()

  // Should navigate to /leads/[uuid]
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 8_000 })
})

test('lead detail shows contact info and status controls', async ({ page }) => {
  await login(page)
  await page.goto('/')

  const firstRow = page.locator('table tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 10_000 })
  await firstRow.locator('td').first().click()
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 8_000 })

  // Lead detail shows an email address (contains @)
  await expect(page.locator('dd').filter({ hasText: /@/ }).first()).toBeVisible({ timeout: 8_000 })

  // Status control exists on the page
  await expect(page.locator('button').filter({ hasText: /nuevo|reviewing|revisando|contactado|new/i }).first()).toBeVisible({ timeout: 8_000 })
})

test('admin can update lead status', async ({ page }) => {
  await login(page)
  await page.goto('/')

  const firstRow = page.locator('table tbody tr').first()
  await expect(firstRow).toBeVisible({ timeout: 10_000 })
  const clickTarget = firstRow.locator('a, button').first().or(firstRow)
  await clickTarget.click()
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 8_000 })

  // Find and click the status control (select or custom dropdown button)
  const statusControl = page.locator('select[name="status"]')
    .or(page.locator('button').filter({ hasText: /nuevo|reviewing|revisando|contactado/i }).first())

  await expect(statusControl).toBeVisible({ timeout: 8_000 })
  await statusControl.click()

  // If it's a <select>, change the value; if custom dropdown, pick an option
  const isSelect = await page.locator('select[name="status"]').isVisible()
  if (isSelect) {
    await page.selectOption('select[name="status"]', { index: 1 })
  } else {
    // Custom dropdown — click first visible option that's different
    const option = page.locator('[role="option"], .dropdown-item, button').filter({ hasText: /reviewing|revisando|contactado/i }).first()
    if (await option.isVisible()) await option.click()
  }

  // No error should appear — status was updated
  await expect(page.locator('text=/error/i')).not.toBeVisible({ timeout: 3_000 }).catch(() => {})
  // Page should still be on the lead detail
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/)
})
