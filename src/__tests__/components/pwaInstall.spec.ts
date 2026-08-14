import { describe, expect } from 'vitest'
import { page } from 'vitest/browser'
import { INSTALL_HINT_STORAGE_KEY } from '@/state/install'
import { it } from '../fixtures'
import { stubInstallPromptAvailable } from '../helpers/installEvent'

describe('PWA install reminder', () => {
  it('stays hidden when the browser cannot install the app', async ({ timer }) => {
    await timer.install.expectNeverAppears()
  })

  it('appears after the browser offers installation', async ({ timer }) => {
    stubInstallPromptAvailable()
    await timer.install.expectVisible()
  })

  it('triggers the deferred browser prompt and closes after acceptance', async ({ timer }) => {
    const prompt = stubInstallPromptAvailable('accepted')
    await timer.install.expectVisible()

    await timer.install.openDialog()
    await timer.install.confirmButton.click()

    await expect.poll(() => prompt.promptCalls()).toBe(1)
    await timer.install.expectDialogClosed()
    await timer.install.expectHidden()
  })

  it('keeps its instructions open when the browser prompt is dismissed', async ({ timer }) => {
    stubInstallPromptAvailable('dismissed')
    await timer.install.expectVisible()

    await timer.install.openDialog()
    await timer.install.confirmButton.click()

    await timer.install.expectDialogOpen()
  })

  it('persists Not now and keeps installation available from settings', async ({ settings }) => {
    stubInstallPromptAvailable()
    await settings.install.expectVisible()
    await settings.install.dismiss()

    expect(localStorage.getItem(INSTALL_HINT_STORAGE_KEY)).toBe('true')
    await page.getByRole('button', { name: 'How to install' }).click()
    await settings.install.expectDialogOpen()
  })
})
