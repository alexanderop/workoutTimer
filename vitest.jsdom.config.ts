import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * The jsdom tier exists to be wrong.
 *
 * Nothing here guards the app. Every spec under `src/__tests__/jsdom/` is the
 * test a reasonable person writes when the runner is jsdom, kept green on
 * purpose so it can be read beside the browser-tier spec that actually holds
 * the same behaviour. The suite passing is the finding.
 *
 * It is configured generously rather than minimally — `css: true` so Tailwind
 * really is compiled and handed to jsdom's cascade, the same `@` alias, the
 * same components. Where a spec still cannot see the truth, it is not because
 * the setup was starved.
 *
 * Two include globs. `src/__tests__/jsdom/` holds specs that only make sense
 * here. `src/__tests__/paired/` is shared source, read by this project and by
 * the browser projects both — a behaviour that exists in each environment and
 * answers differently is stated once, with the divergence asserted, rather
 * than copied into two files that drift.
 */
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('src', import.meta.url)),
      },
      // Specs under `src/__tests__/paired/` are read by this project and by
      // the browser projects, so they import `vitest/browser` statically. That
      // module throws on evaluation outside browser mode; the stub lets the
      // import resolve here and fails only if a jsdom test actually uses it.
      // Anchored so `vitest/browser/*` subpaths are left alone.
      {
        find: /^vitest\/browser$/,
        replacement: fileURLToPath(
          new URL('src/__tests__/helpers/browserContextStub.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    name: 'jsdom',
    root: fileURLToPath(new URL('./', import.meta.url)),
    include: ['src/__tests__/jsdom/**/*.spec.ts', 'src/__tests__/paired/**/*.spec.ts'],
    environment: 'jsdom',
    // Read by `src/__tests__/helpers/env.ts`. The paired specs branch on it
    // instead of existing twice.
    provide: { env: 'jsdom' as const },
    // Give jsdom its best shot: without this, Vitest skips CSS entirely and
    // every computed-style result below could be dismissed as a setup mistake.
    css: true,
    globals: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    setupFiles: ['./src/__tests__/jsdom/setup.ts'],
  },
})
