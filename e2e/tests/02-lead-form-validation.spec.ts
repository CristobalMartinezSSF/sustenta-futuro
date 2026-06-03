import { test, expect } from '@playwright/test'

test('empty form submission triggers validation error state', async ({ page }) => {
  await page.goto('/#contacto')
  await page.waitForSelector('#lead-form')

  // Click submit without filling anything
  const submitBtn = page.locator('#lead-form button[type="submit"]')
  await submitBtn.click()

  // The form adds form-group--error to the first invalid group
  await expect(page.locator('.form-group--error')).toBeVisible({ timeout: 5_000 })
})

test('form requires valid email format', async ({ page }) => {
  await page.goto('/#contacto')
  await page.waitForSelector('#lead-form')

  await page.fill('#full_name', 'Test User')
  await page.fill('#email', 'not-an-email')
  await page.fill('#phone', '+56912345678')
  await page.fill('#company', 'Test Company')
  await page.fill('#message', 'Mensaje de prueba para test de validación')

  // Select service interest via custom dropdown
  await page.click('#sf-service .sf-select__trigger')
  await page.locator('#sf-service .sf-select__item').first().click()

  const submitBtn = page.locator('#lead-form button[type="submit"]')
  await submitBtn.click()

  // Browser native email validation or form-group--error shown
  const emailInput = page.locator('#email')
  const validationMsg = await emailInput.evaluate((el) => (el as HTMLInputElement).validationMessage)
  const hasError = await page.locator('.form-group--error').isVisible().catch(() => false)

  // Either native validation fires or JS validation catches it
  expect(validationMsg.length > 0 || hasError).toBeTruthy()
})
