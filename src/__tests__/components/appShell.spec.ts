import type { Router } from 'vue-router'
import { AtomRegistry } from '@effect/atom-vue'
import { NotebookPen, Settings } from '@lucide/vue'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect } from 'vitest'
import type { VNode } from 'vue'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { i18n } from '@/i18n'
import { RouteNames } from '@/router/routeNames'
import { connectRoute } from '@/state/route'
import type { NavItem } from '@/types/navigation'
import { it as base } from '../fixtures'
import { provideRegistry } from '../helpers/provideRegistry'

const Stub = defineComponent({ render: () => h('div', 'stub view') })

/** What `AppShell` declares — the optional slot is the variation these tests turn on. */
type ShellSlots = {
  default: () => VNode
  'center-action'?: () => VNode
}

/**
 * Three routes, standing in for the app's own table.
 *
 * The *names* are real ones from `RouteNames`, because `connectRoute` matches
 * a location against that vocabulary — a name outside it is not a route this
 * app has, and the snapshot says so by carrying no name at all. The labels
 * stay arbitrary: the shell renders `label` verbatim, which is the thing
 * these tests are about.
 */
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: RouteNames.timer, component: Stub },
      { path: '/second', name: RouteNames.history, component: Stub },
      { path: '/focus', name: RouteNames.timerRun, component: Stub, meta: { hideNav: true } },
    ],
  })
}

const items: Array<NavItem> = [
  { routeName: RouteNames.timer, icon: NotebookPen, label: 'Home' },
  { routeName: RouteNames.history, icon: Settings, label: 'Second' },
]

const it = base.extend('renderShell', async ({}, { onCleanup }) => {
  let mounted: { unmount: () => Promise<void> } | undefined
  onCleanup(async () => {
    await mounted?.unmount()
  })

  return async (initialPath: string, withCenterAction = false): Promise<{ router: Router }> => {
    const router = makeRouter()
    await router.push(initialPath)
    await router.isReady()

    // The shell reads the route from an atom, not from `useRoute()`, so a
    // harness that mounts it has to run the same bridge main.ts does.
    const registry = AtomRegistry.make()
    connectRoute(router, registry)

    const slots: ShellSlots = { default: () => h('div', 'page content') }
    if (withCenterAction) slots['center-action'] = () => h('button', { type: 'button' }, 'center')

    mounted = render(AppShell, {
      props: { items },
      slots,
      global: {
        plugins: [i18n, router],
        provide: provideRegistry(registry),
      },
    })

    return { router }
  }
})

describe('AppShell', () => {
  it('renders the tabs and marks the active route with aria-current', async ({ renderShell }) => {
    await renderShell('/')

    await expect
      .element(page.getByRole('button', { name: 'Home' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(page.getByRole('button', { name: 'Second' }))
      .not.toHaveAttribute('aria-current')
  })

  it('navigates when a tab is tapped', async ({ renderShell }) => {
    const { router } = await renderShell('/')

    await page.getByRole('button', { name: 'Second' }).click()

    await expect.poll(() => router.currentRoute.value.name).toBe(RouteNames.history)
  })

  it('hides the tab bar on routes with meta.hideNav', async ({ renderShell }) => {
    await renderShell('/focus')

    await expect.element(page.getByText('page content')).toBeVisible()
    expect(page.getByRole('navigation').query()).toBeNull()
  })

  it('renders the center action between the split tab halves', async ({ renderShell }) => {
    await renderShell('/', true)

    const nav = page.getByRole('navigation')
    await expect.element(nav.getByRole('button', { name: 'center' })).toBeVisible()

    // One tab on each side of the center action.
    const buttons = await nav.getByRole('button').all()
    expect(buttons.map((button) => button.element().textContent?.trim())).toEqual([
      'Home',
      'center',
      'Second',
    ])
  })
})
