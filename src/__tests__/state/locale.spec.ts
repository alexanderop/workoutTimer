import { AtomRegistry } from '@effect/atom-vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { localeAtom, localeEffectAtom } from '@/state/locale'
import { i18n } from '@/i18n'
import { resetAppState } from '../helpers/reset'

describe('locale', () => {
  beforeEach(resetAppState)

  it('keeps the document language in sync with the chosen locale', () => {
    // Mounting `localeEffectAtom` is what `useLocale()` does for a component;
    // doing it against a registry directly is the same subscription without a
    // component to own it.
    const registry = AtomRegistry.make()
    const stop = registry.subscribe(localeEffectAtom, () => {}, { immediate: true })

    registry.set(localeAtom, 'de')

    expect(i18n.global.locale.value).toBe('de')
    expect(document.documentElement.lang).toBe('de')

    registry.set(localeAtom, 'en')

    expect(document.documentElement.lang).toBe('en')

    stop()
  })
})
