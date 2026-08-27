/**
 * The route vocabulary, on its own so that naming a route does not cost the
 * whole route table.
 *
 * `src/router/index.ts` maps every name to a `() => import('@/views/….vue')`,
 * so importing the names *from there* pulls the view graph in behind them.
 * That is invisible in the app, where the views are what you wanted anyway,
 * and fatal in the Node tier, which has no plugin that can parse a `.vue`
 * file — a unit spec for anything that merely mentions a route name fails to
 * transform, and the mutation run over that tier fails with it.
 *
 * So every module that needs a route name imports it from here, `.vue` files
 * included. `@/router` deliberately does not re-export them: re-exporting
 * would put the trap straight back, one convenient import at a time.
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
