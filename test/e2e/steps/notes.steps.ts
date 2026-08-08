import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'

const { Given, When, Then, After } = createBdd()

// The offline scenario cuts the network; put it back so a shared context or
// a retry never starts life disconnected.
After(async ({ context }) => {
  await context.setOffline(false)
})

Given('I open the app', async ({ page }) => {
  await page.goto('/')
})

Given('the service worker is in control', async ({ page }) => {
  // Registration is `prompt` (vite.config.ts), which deliberately leaves out
  // clientsClaim: the first load installs the worker but is not controlled
  // by it. Wait for the install to finish precaching, then reload to hand
  // the page over. Without this, the offline reload races the install and
  // hits a dead network instead of the cache.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
})

When('I add a note titled {string}', async ({ page }, title: string) => {
  await page.getByRole('button', { name: 'Add a note' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'Save' }).click()
})

When('the network goes away', async ({ context }) => {
  await context.setOffline(true)
})

When('I reload the app', async ({ page }) => {
  await page.reload()
})

Then('I see a note titled {string}', async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
})

Then('the app shell is on screen', async ({ page }) => {
  await expect(page.getByRole('navigation')).toBeVisible()
})

Then('the service worker served it', async ({ page }) => {
  // With the network cut, the reload only produced a document at all because
  // the worker answered the navigation out of its precache.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true)
})

Then('the document has a title and a language', async ({ page }) => {
  await expect(page).toHaveTitle(/\S/)
  await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}(-[A-Za-z]+)*$/)
})
