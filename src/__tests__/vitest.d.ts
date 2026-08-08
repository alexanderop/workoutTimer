import 'vitest'

/** Keep the configured Vitest tags typed in specs and editor completions. */
declare module 'vitest' {
  interface TestTags {
    tags: 'flaky'
  }
}
