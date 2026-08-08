/**
 * Mutation testing — the gate on the unit tier's *assertions*, where the other
 * tiers gate its behavior. See docs/mutation-testing.md for the reasoning
 * behind every choice below.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],

  // The Node tier only. Stryker's runner adopts *every* project in the config
  // it is handed, so pointing this at vitest.config.ts would boot the three
  // Playwright projects once per Stryker worker.
  vitest: { configFile: 'vitest.unit.config.ts' },

  // Effect and Vitest both evaluate modules once per worker. Static mutants
  // cannot be activated per test in that model, so they report false
  // survivors even when exact default-value assertions fail against them.
  ignoreStatic: true,

  // Required, not optional: the default glob includes `vue`, and Stryker really
  // does mutate SFC script blocks. Every mutant outside the unit tier's reach
  // survives by construction and buries the signal. Keep this list in step with
  // what src/__tests__/unit/ actually covers.
  //
  // Deliberately NOT here:
  //   - src/db/repositories/** — half the file is the Dexie layer (browser
  //     tier) and half is the in-memory fake; mutating a test double grades
  //     the double, not the product.
  //   - src/db/converters.ts — Effect Schema constructs its validator at
  //     module evaluation time. Those static mutants cannot be selected by
  //     per-test coverage reliably; decoder behavior is asserted in both the
  //     unit and browser database tiers instead.
  //   - src/db/backup.ts — export/import are database programs exercised by
  //     the browser tier, which this Node-only mutation run intentionally does
  //     not boot.
  //   - src/db/generateId.ts, src/lib/observability.ts — a crypto.randomUUID
  //     wrapper and a DEV-only gate. Equivalent mutants by construction.
  mutate: ['src/features/*/domain.ts', 'src/lib/backupFile.ts', 'src/lib/installPlatform.ts'],

  // Reuse the previous run's verdicts for unchanged code+tests. The report
  // lives in reports/, which is gitignored — CI gets a cold run.
  incremental: true,

  reporters: ['html', 'clear-text', 'progress'],

  // The scope is at 100: every mutant in it is either killed or carries a
  // `// Stryker disable` with a reason. `break` sits at 90 rather than 100
  // because the unit tier is partly property-based — fast-check picks a fresh
  // seed per run, so a mutant that only some inputs distinguish can flicker.
  // Ten points is room for that, not room to delete a test.
  thresholds: { high: 100, low: 90, break: 90 },
}
