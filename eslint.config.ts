import { existsSync, readdirSync } from 'node:fs'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import oxlint from 'eslint-plugin-oxlint'
import pluginVue from 'eslint-plugin-vue'

/**
 * Architecture boundaries, enforced twice.
 *
 * `src/__tests__/architecture/` (ArchUnitTS) reads the TypeScript module
 * graph — which means it is blind to `<script setup>` blocks in .vue files.
 * Most of this app's imports live in .vue files, so the arch tier alone
 * would let a component reach straight into another feature or into the
 * database internals. These `no-restricted-imports` configs close that hole:
 * ESLint lints .vue and .ts alike.
 *
 * Patterns are gitignore-style, matched against the import *specifier*, so
 * they cover the `@/…` alias this codebase uses for every cross-directory
 * import. A relative import that escapes its own directory would slip past
 * them — that case is what the ArchUnitTS tier still covers for .ts files.
 *
 * One caveat drives the shape of the code below: flat config does not merge
 * rule options, it replaces them. Two configs that both set
 * `no-restricted-imports` on the same file means the last one silently wins,
 * so every scope here is disjoint and carries the full set of patterns that
 * applies to it.
 */
// The directory may legitimately be gone: the README tells you to delete the
// example feature, and git does not track empty directories — so a fresh
// clone of a featureless app has no src/features/ at all. Lint must not
// crash on that; the feature-isolation rules simply have nothing to guard.
const featuresDir = new URL('src/features/', import.meta.url)
const FEATURES = existsSync(featuresDir)
  ? readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : []

const SOURCES = '**/*.{ts,mts,tsx,vue}'

/** Reusable layers — they may never point at a feature. */
const SHARED_LAYERS = ['components', 'composables', 'stores', 'lib', 'types'] as const

// `**/…` rather than `@/…` so the relative spelling of the same import is
// caught too. `ignore` applies gitignore's parent-directory rule, so the
// groups below must not exclude `features/` or `db/` wholesale — a broader
// pattern would make the `!` re-includes below dead letters.
const ANY_FEATURE = ['**/features/*', '**/features/*/**']

const NO_FEATURES = {
  group: ANY_FEATURE,
  message:
    'Shared layers may not depend on a feature — the arrow points the other way. Views and the app shell are where features get composed.',
}

/** A feature may import itself; every sibling is off limits. */
const onlyOwnFeature = (feature: string) => ({
  group: [...ANY_FEATURE, `!**/features/${feature}`, `!**/features/${feature}/**`],
  message:
    'Features are independent: move the shared part into src/lib, src/components or src/stores instead of importing another feature.',
})

/** Everything below src/db is internal; `@/db` (src/db/index.ts) is the door. */
const NO_DB_INTERNALS = {
  group: ['**/db/*', '**/db/*/**'],
  message:
    'The database has one public surface: import from @/db. Add the operation to a repository and re-export it there.',
}

/**
 * The UI layer, enforced the same way as the db layer.
 *
 * `src/components/ui/*` holds shadcn-style primitives: our components, our
 * classes, wrapping reka-ui's headless behaviour. reka-ui and cva are the
 * substrate those wrappers are built from, not an API the app codes against
 * — an app component reaching for `<DialogContent>` straight from reka-ui
 * gets no `data-slot`, none of our styling, and no single place to restyle
 * later. Same reasoning as the db rule above: one public surface per layer.
 *
 * See docs/ui-components.md for the pattern these rules protect.
 */
const NO_HEADLESS_DIRECT = {
  group: ['reka-ui', 'reka-ui/**', 'class-variance-authority', 'class-variance-authority/**'],
  message:
    'reka-ui and cva are the private substrate of src/components/ui/*. Import the wrapped primitive from its barrel (@/components/ui/<name>) instead, or add the primitive there first — docs/ui-components.md.',
}

/** Each primitive directory has one door: its index.ts. */
const NO_UI_INTERNALS = {
  group: ['**/components/ui/*/*'],
  message:
    'Import a primitive from its barrel (@/components/ui/dialog), not from the file inside it — the barrel is what keeps a part swappable.',
}

/**
 * We write these components rather than install them. Vendoring the upstream
 * package back in would put a second, differently-styled Dialog in the app.
 */
const NO_SHADCN = {
  group: ['shadcn-vue', 'shadcn-vue/**', 'radix-vue', 'radix-vue/**'],
  message:
    'This project writes its own primitives in the shadcn-vue style rather than depending on it — copy the pattern into src/components/ui/ instead. docs/ui-components.md.',
}

/** Primitives are presentational: no data layer, no app state, no features. */
const NO_APP_STATE = {
  group: ['**/db', '**/db/**', '**/stores/**', ...ANY_FEATURE],
  message:
    'A UI primitive stays presentational — no database, no stores, no features. Bind the data in a feature component and pass it in.',
}

type Boundary = { group: string[]; message: string }
type RestrictImports = ['error', { patterns: Boundary[] }]

const boundary = (name: string, files: string[], ignores: string[], patterns: Boundary[]) => ({
  name: `app/boundaries/${name}`,
  files,
  ...(ignores.length > 0 ? { ignores } : {}),
  rules: { 'no-restricted-imports': ['error', { patterns }] as RestrictImports },
})

/** Applies everywhere outside src/components/ui — see NO_HEADLESS_DIRECT. */
const CONSUMES_UI = [NO_HEADLESS_DIRECT, NO_UI_INTERNALS, NO_SHADCN]

const boundaries = [
  ...FEATURES.map((feature) =>
    boundary(
      `features/${feature}`,
      [`src/features/${feature}/${SOURCES}`],
      [],
      [onlyOwnFeature(feature), NO_DB_INTERNALS, ...CONSUMES_UI],
    ),
  ),

  // src/db owns its own internals, but must stay ignorant of features.
  boundary('db', [`src/db/${SOURCES}`], [], [NO_FEATURES, ...CONSUMES_UI]),

  // The primitives themselves: the one place reka-ui and cva are in scope.
  boundary('ui-primitives', [`src/components/ui/${SOURCES}`], [], [NO_APP_STATE, NO_SHADCN]),

  boundary(
    'shared',
    SHARED_LAYERS.map((folder) => `src/${folder}/${SOURCES}`),
    ['src/components/ui/**'],
    [NO_FEATURES, NO_DB_INTERNALS, ...CONSUMES_UI],
  ),

  // Everything else the app ships — views, router, i18n, the shell. These
  // compose features on purpose; the db surface still applies. Tests are
  // exempt: the migration spec has to talk to the schema directly, and a
  // component spec may mount a reka-ui part as a bare harness.
  boundary(
    'app',
    [`src/${SOURCES}`],
    [
      'src/__tests__/**',
      'src/features/**',
      'src/db/**',
      ...SHARED_LAYERS.map((folder) => `src/${folder}/**`),
    ],
    [NO_DB_INTERNALS, ...CONSUMES_UI],
  ),
]

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/.features-gen/**',
      '**/.vitest/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },

  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'app/rules',
    rules: {
      // Optional props in <script setup lang="ts"> are typed as possibly
      // undefined — forcing a default on every one adds noise, not safety.
      'vue/require-default-prop': 'off',

      // `interface Note extends Schema.Schema.Type<typeof Note> {}` is the
      // Effect idiom for giving a schema's decoded type the schema's own
      // name — a body would defeat the point. Still flag the genuinely empty
      // `interface Foo {}`, which means nothing.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
    },
  },

  {
    name: 'app/ui-primitives',
    files: ['src/components/ui/**/*.vue'],
    rules: {
      // shadcn-style primitives are intentionally named after the element
      // they wrap (Button, Input, Label, …).
      'vue/multi-word-component-names': 'off',
    },
  },

  // oxlint runs first (fast, Rust); this disables the ESLint rules it
  // already covers so the two don't double-report.
  ...oxlint.configs['flat/recommended'],

  // Prettier owns formatting — keep ESLint out of it.
  skipFormatting,

  // --- Architecture boundaries (see the comment at the top of this file) ---
  ...boundaries,
)
