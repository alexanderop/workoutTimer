/**
 * Stands in for `vitest/browser` inside the `jsdom` project.
 *
 * The real module (`packages/vitest/browser/context.js` in the Vitest source)
 * throws the moment it is evaluated outside browser mode. That is a good
 * default, but it makes a shared spec impossible: a file included by both the
 * jsdom project and a browser project cannot statically import `page` or
 * `userEvent` without exploding on the jsdom side, even when every test that
 * touches them is skipped there.
 *
 * So `vitest.jsdom.config.ts` aliases the specifier here. Importing is free;
 * *using* any of it still fails loudly, which keeps the safety net the real
 * module provides — a browser API reached from a jsdom test is a mistake, and
 * this says so by name rather than handing back a silent `null`.
 */
function unavailable<T>(name: string): T {
  const fail = (): never => {
    throw new Error(
      `\`${name}\` from "vitest/browser" was used in the jsdom project. ` +
        'It only exists in browser mode — mark the test `browserOnly` ' +
        '(src/__tests__/helpers/env.ts), or assert the jsdom answer instead.',
    )
  }

  // A function target so both `page.getByRole(…)` and `userEvent(…)` trap.
  return new Proxy(() => {}, {
    get: (_target, key) =>
      // `then` is exempt so an accidental `await` reports the error below
      // rather than hanging on a thenable that throws mid-resolution.
      key === 'then' ? undefined : fail(),
    apply: fail,
  }) as T
}

export const page = unavailable<unknown>('page')
export const server = unavailable<unknown>('server')
export const userEvent = unavailable<unknown>('userEvent')
export const cdp = unavailable<unknown>('cdp')
export const commands = unavailable<unknown>('commands')
export const locators = unavailable<unknown>('locators')
export const utils = unavailable<unknown>('utils')
