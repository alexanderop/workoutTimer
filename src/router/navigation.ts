import { History, Settings, Timer } from '@lucide/vue'
import type { NavItem } from '@/types/navigation'
import { RouteNames, type RouteName } from './routeNames'

/**
 * A tab before its label has been translated.
 *
 * Derived from `NavItem` rather than spelled out again: the shell renders a
 * `NavItem`, and the only difference here is that the label is still a message
 * key. Written as two independent shapes, a field added to one would silently
 * not reach the other — and the mapping below would still compile.
 */
type NavItemConfig = Omit<NavItem, 'label' | 'routeName'> & {
  readonly routeName: RouteName
  readonly labelKey: string
}

const NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  { routeName: RouteNames.timer, icon: Timer, labelKey: 'nav.timer' },
  { routeName: RouteNames.history, icon: History, labelKey: 'nav.history' },
  { routeName: RouteNames.settings, icon: Settings, labelKey: 'nav.settings' },
]

/**
 * The tabs as the shell wants them: labels translated.
 *
 * The list and its untranslated shape stay private: this function is the only
 * thing anyone needs, and a module whose surface is one function cannot be
 * half-used.
 *
 * A pure function over a `translate`, like the timer's label functions — so
 * the unit tier can hold it, and the app calls it from a template rather than
 * memoising it. The only dependency is the active locale, and reading it
 * during render is what makes the shell re-render when the language changes.
 */
export function navItems(t: (key: string) => string): Array<NavItem> {
  return NAV_ITEMS.map(({ routeName, icon, labelKey }) => ({
    routeName,
    icon,
    label: t(labelKey),
  }))
}
