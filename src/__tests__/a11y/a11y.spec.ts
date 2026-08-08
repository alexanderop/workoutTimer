import { page } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertNoPageLevelViolations, assertNoViolations } from '../helpers/a11y'
import { renderApp } from '../helpers/renderApp'
import { resetAppState } from '../helpers/reset'

describe('accessibility', () => {
  let cleanup: (() => void) | undefined

  beforeEach(resetAppState)
  afterEach(() => cleanup?.())

  it.each([
    ['timer home', '/'],
    ['AMRAP setup', '/timer/amrap'],
    ['history', '/history'],
    ['presets', '/presets'],
    ['settings', '/settings'],
  ])('%s has no violations', async (_name, path) => {
    const app = await renderApp(path)
    cleanup = app.cleanup
    await expect.element(page.getByTestId('app')).toBeVisible()
    await assertNoViolations(app.container)
  })

  it.each([
    ['timer home', '/'],
    ['settings', '/settings'],
  ])('%s has a sound page structure', async (_name, path) => {
    const app = await renderApp(path)
    cleanup = app.cleanup
    await assertNoPageLevelViolations()
  })
})
