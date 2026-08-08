export interface StubbedInstallPrompt {
  promptCalls: () => number
}

/** Simulates Chromium making the current origin installable. */
export function stubInstallPromptAvailable(
  outcome: 'accepted' | 'dismissed' = 'accepted',
): StubbedInstallPrompt {
  let promptCalls = 0
  const event = new Event('beforeinstallprompt', { cancelable: true })

  Object.assign(event, {
    platforms: ['web'],
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
    prompt: (): Promise<void> => {
      promptCalls += 1
      return Promise.resolve()
    },
  })

  window.dispatchEvent(event)
  return { promptCalls: () => promptCalls }
}
