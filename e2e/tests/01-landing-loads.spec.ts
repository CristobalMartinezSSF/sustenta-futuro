import { test, expect } from '@playwright/test'

test('landing page loads with correct title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Sustenta Futuro/i)
})

test('hero section and CTA are visible', async ({ page }) => {
  await page.goto('/')
  const hero = page.locator('#hero')
  await expect(hero).toBeVisible()
  // At least one CTA button in hero
  const ctaBtn = hero.locator('a, button').first()
  await expect(ctaBtn).toBeVisible()
})

test('contact form section is reachable and form inputs are present', async ({ page }) => {
  await page.goto('/#contacto')
  const form = page.locator('#lead-form')
  await expect(form).toBeVisible()

  // Required fields
  await expect(page.locator('#full_name')).toBeVisible()
  await expect(page.locator('#email')).toBeVisible()
  await expect(page.locator('#phone')).toBeVisible()
  await expect(page.locator('#company')).toBeVisible()
  await expect(page.locator('#message')).toBeVisible()
})
