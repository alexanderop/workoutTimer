import type { RouteRecordRaw, Router, RouterHistory } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'
import { RouteNames } from './routeNames'

// The names are not re-exported from here on purpose: importing them from this
// module would pull the lazy view imports below in behind them, which is fatal
// in the Node tier. Everything that needs a name imports `./routeNames`; this
// module is the router itself.

declare module 'vue-router' {
  interface RouteMeta {
    hideNav?: boolean
  }
}

const routes: Array<RouteRecordRaw> = [
  { path: '/', name: RouteNames.timer, component: () => import('@/views/TimerHomeView.vue') },
  {
    path: '/timer/:mode',
    name: RouteNames.timerSetup,
    component: () => import('@/views/TimerSetupView.vue'),
  },
  {
    path: '/session/:id',
    name: RouteNames.timerRun,
    component: () => import('@/views/TimerRunView.vue'),
    meta: { hideNav: true },
  },
  {
    path: '/session/:id/result',
    name: RouteNames.timerResult,
    component: () => import('@/views/TimerResultView.vue'),
    meta: { hideNav: true },
  },
  {
    path: '/history',
    name: RouteNames.history,
    component: () => import('@/views/HistoryView.vue'),
  },
  {
    path: '/history/:id',
    name: RouteNames.sessionDetail,
    component: () => import('@/views/SessionDetailView.vue'),
  },
  {
    path: '/presets',
    name: RouteNames.presets,
    component: () => import('@/views/PresetsView.vue'),
  },
  {
    path: '/settings',
    name: RouteNames.settings,
    component: () => import('@/views/SettingsView.vue'),
  },
]

export function createAppRouter(
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
): Router {
  return createRouter({ history, routes })
}
