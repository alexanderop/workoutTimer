import type { Component } from 'vue'
import type { RouteName } from '@/router/routeNames'

/**
 * One entry in the bottom navigation. `label` is already translated —
 * the shell renders it verbatim so it stays free of i18n concerns.
 *
 * `routeName` is a `RouteName`, not a string: the shell decides which tab is
 * current by comparing it against `routeNameAtom`, which carries the same
 * union because `connectRoute` matches every location against `RouteNames`.
 * A plain string on either side compiles and silently never matches.
 */
export type NavItem = {
  routeName: RouteName
  icon: Component
  label: string
}
