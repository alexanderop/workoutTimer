import 'vitest'

/** Keep the configured Vitest tags typed in specs and editor completions. */
declare module 'vitest' {
  interface TestTags {
    tags: 'flaky'
  }

  /**
   * Which environment the current project runs in, supplied per project via
   * `test.provide`. Specs under `src/__tests__/paired/` read it through
   * `src/__tests__/helpers/env.ts` to branch on the runner they got.
   */
  interface ProvidedContext {
    env: 'jsdom' | 'browser'
  }
}
