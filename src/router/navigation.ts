import type { Component } from 'vue'
import { History, Settings, Timer } from '@lucide/vue'
import type { RouteName } from './index'
import { RouteNames } from './index'

export type NavItemConfig = {
  routeName: RouteName
  icon: Component
  labelKey: string
}

export const NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  { routeName: RouteNames.timer, icon: Timer, labelKey: 'nav.timer' },
  { routeName: RouteNames.history, icon: History, labelKey: 'nav.history' },
  { routeName: RouteNames.settings, icon: Settings, labelKey: 'nav.settings' },
]
