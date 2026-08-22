import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
import { navItems } from '@/router/navigation'

/**
 * The real English catalogue, walked by key — the same trick the timer's label
 * spec uses, and for the same reason: a tab whose `labelKey` does not exist
 * would render an empty string in the app and pass against a stub.
 */
const translate = (key: string): string => {
  const message = key
    .split('.')
    .reduce<unknown>(
      (node, segment) => (node as Record<string, unknown> | undefined)?.[segment],
      en,
    )

  if (typeof message !== 'string') throw new Error(`no message at ${key}`)
  return message
}

describe('bottom navigation', () => {
  it('translates every tab from the catalogue', () => {
    expect(navItems(translate).map((item) => item.label)).toEqual(['Timer', 'History', 'Settings'])
  })

  it('names a route for each tab, and gives each an icon', () => {
    for (const item of navItems(translate)) {
      expect(item.routeName).not.toBe('')
      expect(item.icon).toBeDefined()
    }
  })

  it('re-translates rather than caching — the language can change under it', () => {
    expect(navItems(() => 'x').map((item) => item.label)).toEqual(['x', 'x', 'x'])
    expect(navItems(translate)[0]?.label).toBe('Timer')
  })
})
