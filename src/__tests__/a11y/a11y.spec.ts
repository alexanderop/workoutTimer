import { describe } from 'vitest'
import { it } from '../fixtures'
import { assertNoPageLevelViolations, assertNoViolations } from '../helpers/a11y'
import { stubInstallPromptAvailable } from '../helpers/installEvent'

describe('accessibility', () => {
  it('timer home has no violations', async ({ timer }) => {
    await timer.expectHome()
    await assertNoViolations(timer.container)
  })

  it('AMRAP setup has no violations', async ({ amrapSetup }) => {
    await amrapSetup.setup.expectTimeShortcut('15 sec')
    await assertNoViolations(amrapSetup.container)
  })

  it('history has no violations', async ({ history }) => {
    await assertNoViolations(history.container)
  })

  it('presets has no violations', async ({ presets }) => {
    await assertNoViolations(presets.container)
  })

  it('settings has no violations', async ({ settings }) => {
    await assertNoViolations(settings.container)
  })

  it('install reminder has no violations', async ({ timer }) => {
    stubInstallPromptAvailable()
    await timer.install.expectVisible()
    await assertNoViolations(timer.container)
  })

  it('install dialog has no violations', async ({ timer }) => {
    stubInstallPromptAvailable()
    await timer.install.expectVisible()
    await timer.install.openDialog()
    await assertNoViolations(timer.install.dialog.element())
  })

  it('timer home has a sound page structure', async ({ timer }) => {
    await assertNoPageLevelViolations(timer.container)
  })

  it('settings has a sound page structure', async ({ settings }) => {
    await assertNoPageLevelViolations(settings.container)
  })
})
