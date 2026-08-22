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

/**
 * Reusable layers — they may never point at a feature.
 *
 * `src/state` is where every shared atom lives (there is no `src/stores` and no
 * `src/composables`: an atom is declared in `src/state/`, in a feature's
 * `atoms.ts`, or in `src/db/atoms.ts`, and nowhere else). `src/lib` is what is
 * left once the atoms are out of it — pure functions and platform plumbing.
 */
const SHARED_LAYERS = ['components', 'state', 'lib', 'types'] as const

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
    'Features are independent: move the shared part into src/lib, src/components or src/state instead of importing another feature.',
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

/**
 * Primitives are presentational: no data layer, no app state, no features.
 *
 * `@/state/browser` is re-included on purpose. It holds the *browser's* state —
 * `matchMedia`, localStorage, a clock — and a primitive that adapts to a coarse
 * pointer is still presentational. Everything else under `src/state/` is this
 * app's state and stays out. Single-star patterns, per the note above
 * ANY_FEATURE: a double-star exclusion of the whole directory would make the
 * re-include a dead letter.
 */
const NO_APP_STATE = {
  group: ['**/db', '**/db/**', '**/state/*', '**/state/*/**', '!**/state/browser', ...ANY_FEATURE],
  message:
    'A UI primitive stays presentational — no database, no app state, no features. Bind the data in a feature component and pass it in. (@/state/browser is the exception: browser capabilities are not app state.)',
}

/**
 * State is atoms, and only atoms.
 *
 * `@effect/atom-vue` is the app's reactivity system: shared state, derived
 * state, and side effects are all atoms in a registry, and `useAtomValue` /
 * `useAtom` / `useAtomSet` are the one bridge into a component. Vue's own
 * primitives are what that replaced, so importing them is how the two systems
 * would start to coexist — a `computed` over an atom, a `watch` that writes
 * one, a `ref` that shadows one. See the state section of docs/index.md.
 *
 * Not banned, deliberately: `useTemplateRef` (a DOM handle is not state),
 * `nextTick`, `onMounted`, `useSlots`, `defineAsyncComponent`. And
 * `src/components/ui/*` is exempt, for the same reason it is the only place
 * reka-ui is in scope — those files are the substrate, not the app.
 */
const NO_VUE_REACTIVITY = {
  group: ['vue'],
  importNames: [
    'ref',
    'shallowRef',
    'customRef',
    'toRef',
    'toRefs',
    'computed',
    'watch',
    'watchEffect',
    'watchPostEffect',
    'watchSyncEffect',
    'reactive',
    'shallowReactive',
    'readonly',
    'shallowReadonly',
  ],
  message:
    'State and derivation live in atoms (@effect/atom-vue), not in Vue reactivity — see the state section of docs/index.md. A derived value is an Atom.map/Atom.make; a side effect is an atom whose read subscribes; a plain function of props needs no memo. For a DOM node, use useTemplateRef.',
}

/**
 * There is no composable layer.
 *
 * `useAtomValue` / `useAtom` / `useAtomSet` / `injectRegistry` are the bridge
 * into a component, and a `use*` wrapper around them is a layer that adds
 * nothing and costs a test: seven of the nine this app used to have were a
 * single `useAtomValue` line, and the ones that were not held the only logic in
 * the codebase with no unit test. Put the state in an atom under `src/state/`
 * or the feature, and anything imperative in an `Atom.fnSync` or a
 * registry-taking function (`showToastIn`, `requestConfirmationIn`) that a bare
 * `AtomRegistry.make()` can drive.
 *
 * `src/components/ui/*` is exempt: reka-ui's own `useForwardProps` and friends
 * are the substrate those files are built from, not this app's code.
 */
const NO_COMPOSABLES =
  'There is no composable layer in this app. Export the atom and let the component call useAtomValue/useAtom/useAtomSet; put imperative work in an Atom.fnSync or a registry-taking function — see the state section of docs/index.md.'

type Boundary = { group: string[]; message: string; importNames?: string[] }
type RestrictImports = ['error', { patterns: Boundary[] }]

// The return type is what makes the tuple a tuple — written inline it would
// widen to an array of its member types, which is not what the rule takes.
const restrictImports = (patterns: Boundary[]): RestrictImports => ['error', { patterns }]

const boundary = (name: string, files: string[], ignores: string[], patterns: Boundary[]) => {
  const config = {
    name: `app/boundaries/${name}`,
    files,
    rules: { 'no-restricted-imports': restrictImports(patterns) },
  }

  // A config with `ignores: []` is not the same as one without the key —
  // flat config reads an empty array as "ignore nothing extra", so only the
  // scopes that actually carve something out carry it.
  return ignores.length > 0 ? { ...config, ignores } : config
}

/** Applies everywhere outside src/components/ui — see NO_HEADLESS_DIRECT. */
const CONSUMES_UI = [NO_HEADLESS_DIRECT, NO_UI_INTERNALS, NO_SHADCN, NO_VUE_REACTIVITY]

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
      // Vendored third-party lint rules (docs/index.md → linting). Kept
      // byte-identical to upstream so a re-vendor is a clean diff.
      'tools/oxlint/anti-slop/**',
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
    // `defineModel` is a macro, so `no-restricted-imports` cannot see it — but
    // it compiles to a writable `ref`, which is the thing NO_VUE_REACTIVITY
    // bans. A two-way bound value's home is an atom in the parent; a component
    // takes the value as a prop and reports edits as an event.
    //
    // Exempt inside src/components/ui/*, where the primitives forward a model
    // straight to a reka-ui part and the ref never reaches app code.
    name: 'app/no-define-model',
    files: [`src/${SOURCES}`],
    ignores: ['src/components/ui/**'],
    rules: {
      // One rule entry, not two configs: flat config *replaces* rule options
      // rather than merging them, so a second config setting
      // `no-restricted-syntax` on these files would silently drop the first.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="defineModel"]',
          message:
            'Two-way binding goes through an atom: take `modelValue` as a prop and emit `update:modelValue`. defineModel compiles to a writable ref — see the state section of docs/index.md.',
        },
        {
          selector: 'ExportNamedDeclaration > FunctionDeclaration[id.name=/^use[A-Z]/]',
          message: NO_COMPOSABLES,
        },
        {
          selector:
            'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=/^use[A-Z]/]',
          message: NO_COMPOSABLES,
        },
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
