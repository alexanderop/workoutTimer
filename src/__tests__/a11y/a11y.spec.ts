import { describe } from 'vitest'
import { it } from '../fixtures'
import { assertNoPageLevelViolations, assertNoViolations } from '../helpers/a11y'

describe('accessibility', () => {
  it('timer home has no violations', async ({ timer }) => {
    await timer.expectHome()
    await assertNoViolations(timer.container)
  })

  it('AMRAP setup has no violations', async ({ timer }) => {
    await timer.chooseMode('AMRAP')
    await timer.setup.expectTimeShortcut('15 sec')
    await assertNoViolations(timer.container)
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

  it('timer home has a sound page structure', async ({ timer }) => {
    await assertNoPageLevelViolations(timer)
  })

  it('settings has a sound page structure', async ({ settings }) => {
    await assertNoPageLevelViolations(settings)
  })
})
