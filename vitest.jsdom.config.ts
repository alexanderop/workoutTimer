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
 */
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    name: 'jsdom',
    root: fileURLToPath(new URL('./', import.meta.url)),
    include: ['src/__tests__/jsdom/**/*.spec.ts'],
    environment: 'jsdom',
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
