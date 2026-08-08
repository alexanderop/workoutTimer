import type { Router } from 'vue-router'
import { NotebookPen, Settings } from '@lucide/vue'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { describe, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { i18n } from '@/i18n'
import type { NavItem } from '@/types/navigation'
import { it as base } from '../fixtures'

const Stub = defineComponent({ render: () => h('div', 'stub view') })

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/second', name: 'second', component: Stub },
      { path: '/focus', name: 'focus', component: Stub, meta: { hideNav: true } },
    ],
  })
}

const items: Array<NavItem> = [
  { routeName: 'home', icon: NotebookPen, label: 'Home' },
  { routeName: 'second', icon: Settings, label: 'Second' },
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

    mounted = render(AppShell, {
      props: { items },
      slots: {
        default: () => h('div', 'page content'),
        ...(withCenterAction
          ? { 'center-action': () => h('button', { type: 'button' }, 'center') }
          : {}),
      },
      global: { plugins: [i18n, router] },
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

    await expect.poll(() => router.currentRoute.value.name).toBe('second')
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
