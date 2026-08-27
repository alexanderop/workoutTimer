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
  // what src/__tests__/unit/ actually covers — the list is the answer to "which
  // logic is pure enough to grade", so a module that belongs here and is not
  // here is a module whose tests nobody has checked.
  //
  // Deliberately NOT here:
  //   - src/db/repositories/** — every method is a Dexie call inside a
  //     transaction, exercised by the browser tier this Node-only run does not
  //     boot. What used to be worth grading in there — how paused time
  //     accumulates across a pause, resume and finish — is now pure, in
  //     src/db/sessionTransitions.ts, and is in scope below.
  //   - src/db/converters.ts — Effect Schema constructs its validator at
  //     module evaluation time. Those static mutants cannot be selected by
  //     per-test coverage reliably; decoder behavior is asserted in both the
  //     unit and browser database tiers instead.
  //   - src/db/backup.ts — export/import are database programs exercised by
  //     the browser tier, which this Node-only mutation run intentionally does
  //     not boot.
  //   - src/db/generateId.ts, src/lib/observability.ts — a crypto.randomUUID
  //     wrapper and a DEV-only gate. Equivalent mutants by construction.
  //   - src/state/*, src/features/*/atoms.ts — an effect atom subscribes to a
  //     platform API or writes to the document, which this Node-only run does
  //     not have; the browser tier grades those by driving the screen. The
  //     value atoms below are the exception, and the rule is the same one the
  //     naming convention encodes: a derivation is gradable, a subscription is
  //     not.
  //
  // What the composable removal bought this tier is the last three entries.
  // `reportFailure` used to be a composable that reached for the toast store
  // itself; the banner arbitration was reachable only by rendering two
  // banners; and the arm-then-confirm gesture used to need an `effectScope`
  // and fake timers because it was a `ref` plus `onScopeDispose`. As atoms
  // they are all drivable from a bare `AtomRegistry.make()`, which is what put
  // them in reach of a Node run at all.
  mutate: [
    'src/features/*/domain.ts',
    'src/features/*/labels.ts',
    'src/features/*/pickerOptions.ts',
    'src/features/*/setupForm.ts',
    'src/db/sessionTransitions.ts',
    'src/lib/backupFile.ts',
    'src/lib/installPlatform.ts',
    'src/lib/reportFailure.ts',
    'src/state/confirmation.ts',
    'src/state/pwa.ts',
  ],

  // Reuse the previous run's verdicts for unchanged code+tests. The report
  // lives in reports/, which is gitignored — CI gets a cold run.
  incremental: true,

  reporters: ['html', 'clear-text', 'progress'],

  // The scope scores 95. Every file in it is at 100 except `setupForm.ts` and
  // `state/confirmation.ts`, whose residue docs/mutation-testing.md names and
  // explains — the first needs a database this tier does not have, the second
  // is assertions nobody has written. `break` sits at 90 rather than 100 both
  // for that and because the unit tier is partly property-based: fast-check
  // picks a fresh seed per run, so a mutant that only some inputs distinguish
  // can flicker. The margin is not room to delete a test.
  thresholds: { high: 100, low: 90, break: 90 },
}
