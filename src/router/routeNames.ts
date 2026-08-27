/**
 * The route names, on their own.
 *
 * Separate from `src/router/index.ts` because that module *is* the route
 * table: its records name a lazily-imported `.vue` file for every screen in
 * the app, so anything importing it pulls all of them into its module graph.
 * A name is a string, and the one non-view module that needs one —
 * `features/timer/runDriver.ts`, which navigates to the result screen — should
 * not drag eight views behind it. The Node test tier is where that showed up:
 * it has no plugin that can transform a `.vue` file.
 *
 * `@/router` re-exports these, so a view can keep importing both from one place.
 */
export const RouteNames = {
  timer: 'timer',
  timerSetup: 'timer-setup',
  timerRun: 'timer-run',
  timerResult: 'timer-result',
  history: 'history',
  sessionDetail: 'session-detail',
  presets: 'presets',
  settings: 'settings',
} as const

export type RouteName = (typeof RouteNames)[keyof typeof RouteNames]
