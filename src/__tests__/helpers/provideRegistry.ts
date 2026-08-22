import { registryKey } from '@effect/atom-vue'
import type { AtomRegistry } from '@effect/atom-vue'

/**
 * The registry, in the shape `@vue/test-utils`' `global.provide` takes.
 *
 * `app.provide(registryKey, registry)` in main.ts is typed by the
 * `InjectionKey`; a `provide` *record* is keyed by `string | symbol`, and a
 * computed key drops the key's type with it. This is the one place the two
 * spellings meet, so it is the one place the assertion lives.
 */
export function provideRegistry(registry: AtomRegistry.AtomRegistry) {
  // SAFETY: `registryKey` is an `InjectionKey<AtomRegistry>`, which is a
  // symbol at runtime — the type parameter is what a computed record key
  // cannot carry, and the value beside it is the registry that key stands for.
  return { [registryKey as symbol]: registry }
}
