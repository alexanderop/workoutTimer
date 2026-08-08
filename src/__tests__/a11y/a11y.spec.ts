import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertNoPageLevelViolations, assertNoViolations } from '../helpers/a11y'
import { renderApp } from '../helpers/renderApp'
import { resetAppState } from '../helpers/reset'

describe('accessibility', () => {
  let cleanup: (() => void) | undefined

  beforeEach(resetAppState)
  afterEach(() => cleanup?.())

  it('notes home has no violations', async () => {
    const app = await renderApp()
    cleanup = app.cleanup

    await assertNoViolations(app.container)
  })

  it('settings has no violations', async () => {
    const app = await renderApp('/settings')
    cleanup = app.cleanup

    await assertNoViolations(app.container)
  })

  it('quick-add sheet has no violations while open', async () => {
    const app = await renderApp()
    cleanup = app.cleanup

    await page.getByRole('button', { name: 'Add a note' }).click()
    // The sheet is lazy-loaded, so wait for it before handing it to axe.
    await expect.element(page.getByRole('dialog')).toBeVisible()

    await assertNoViolations(page.getByRole('dialog').element())
  })

  // Container-scoped sweeps skip every rule axe classifies as page-level —
  // landmark structure, heading-one, region. These run against the document
  // so they actually execute; see the helper for what is and isn't included.
  it.each([
    ['notes home', '/'],
    ['settings', '/settings'],
  ])('%s has a sound page structure', async (_name, path) => {
    const app = await renderApp(path)
    cleanup = app.cleanup

    await assertNoPageLevelViolations()
  })
})
