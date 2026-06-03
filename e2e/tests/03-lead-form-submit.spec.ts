import { test, expect } from '@playwright/test'

test('valid lead form submission shows success confirmation', async ({ page }) => {
  // Mock API to avoid CORS issues when serving the HTML locally
  await page.route('**/leads/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'e2e-test-id', status: 'new' }),
      })
    } else {
      await route.continue()
    }
  })

  await page.goto('/#contacto')
  await page.waitForSelector('#lead-form')

  const ts = Date.now()
  await page.fill('#full_name', `Test E2E ${ts}`)
  await page.fill('#email', `e2e+${ts}@playwright.test`)
  await page.fill('#phone', '+56912345678')
  await page.fill('#company', 'Playwright Test SpA')
  await page.fill('#message', 'Submission automatica desde test E2E Playwright. Ignorar.')

  await page.click('#sf-service .sf-select__trigger')
  await page.locator('#sf-service .sf-select__item').first().click()

  const submitBtn = page.locator('#lead-form button[type="submit"]')
  await expect(submitBtn).toBeEnabled()
  await submitBtn.click()
  await expect(submitBtn).toContainText('¡Listo!', { timeout: 10_000 })
})

test('after successful submission the form fields are cleared', async ({ page }) => {
  await page.route('**/leads/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'e2e-reset-id', status: 'new' }) })
    } else { await route.continue() }
  })

  await page.goto('/#contacto')
  await page.waitForSelector('#lead-form')

  const ts = Date.now()
  await page.fill('#full_name', `Reset Test ${ts}`)
  await page.fill('#email', `reset+${ts}@playwright.test`)
  await page.fill('#phone', '+56911111111')
  await page.fill('#company', 'Reset Test SpA')
  await page.fill('#message', 'Test de reset de formulario tras envio exitoso.')

  await page.click('#sf-service .sf-select__trigger')
  await page.locator('#sf-service .sf-select__item').first().click()

  await page.locator('#lead-form button[type="submit"]').click()
  await expect(page.locator('#lead-form button[type="submit"]')).toContainText('¡Listo!', { timeout: 10_000 })

  await expect(page.locator('#full_name')).toHaveValue('')
  await expect(page.locator('#email')).toHaveValue('')
  await expect(page.locator('#message')).toHaveValue('')
})
