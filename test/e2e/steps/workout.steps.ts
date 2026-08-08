import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, When, Then, After } = createBdd()

After(async ({ context }) => {
  await context.setOffline(false)
})

Given('I open the workout timer', async ({ page }) => {
  await page.goto('/')
})

Given('the service worker controls the workout timer', async ({ page }) => {
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
})

When('I start an AMRAP workout', async ({ page }) => {
  await page.getByRole('button', { name: /AMRAP/ }).click()
  await page.getByRole('button', { name: '1 min', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
})

Then('the workout timer is running', async ({ page }) => {
  await expect(page.getByText('Work', { exact: true })).toBeVisible({ timeout: 8_000 })
})

When('I finish the workout', async ({ page }) => {
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Tap again to finish' }).click()
  await expect(page.getByRole('heading', { name: 'Workout complete' })).toBeVisible()
})

When('I save the workout result', async ({ page }) => {
  await page.getByLabel('Result notes').fill('E2E complete')
  await page.getByRole('button', { name: 'Save result' }).click()
})

Then('I see the workout details', async ({ page }) => {
  await expect(page.getByText('E2E complete')).toBeVisible()
})

Then('I still see the workout details', async ({ page }) => {
  await expect(page.getByText('E2E complete')).toBeVisible()
})

When('the workout timer network goes away', async ({ context }) => {
  await context.setOffline(true)
})

When('I reload the workout timer', async ({ page }) => {
  await page.reload()
})

Then('the workout timer shell is on screen', async ({ page }) => {
  await expect(page.getByRole('navigation')).toBeVisible()
})

Then('the workout timer service worker served it', async ({ page }) => {
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
})

Then('the workout timer document has a title and a language', async ({ page }) => {
  await expect(page).toHaveTitle(/\S/)
  await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}(-[A-Za-z]+)*$/)
})
