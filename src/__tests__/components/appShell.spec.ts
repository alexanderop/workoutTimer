import type { Router } from 'vue-router'
import { NotebookPen, Settings } from '@lucide/vue'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { i18n } from '@/i18n'
import type { NavItem } from '@/types/navigation'

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

async function renderShell(initialPath: string, withCenterAction = false) {
  const router = makeRouter()
  await router.push(initialPath)
  await router.isReady()

  const screen = render(AppShell, {
    props: { items },
    slots: {
      default: () => h('div', 'page content'),
      ...(withCenterAction
        ? { 'center-action': () => h('button', { type: 'button' }, 'center') }
        : {}),
    },
    global: { plugins: [i18n, router] },
  })

  return { screen, router }
}

describe('AppShell', () => {
  let unmount: (() => void) | undefined
  afterEach(() => unmount?.())

  it('renders the tabs and marks the active route with aria-current', async () => {
    const { screen } = await renderShell('/')
    unmount = () => screen.unmount()

    await expect
      .element(page.getByRole('button', { name: 'Home' }))
      .toHaveAttribute('aria-current', 'page')
    await expect
      .element(page.getByRole('button', { name: 'Second' }))
      .not.toHaveAttribute('aria-current')
  })

  it('navigates when a tab is tapped', async () => {
    const { screen, router } = await renderShell('/')
    unmount = () => screen.unmount()

    await page.getByRole('button', { name: 'Second' }).click()

    await expect.poll(() => router.currentRoute.value.name).toBe('second')
  })

  it('hides the tab bar on routes with meta.hideNav', async () => {
    const { screen } = await renderShell('/focus')
    unmount = () => screen.unmount()

    await expect.element(page.getByText('page content')).toBeVisible()
    expect(page.getByRole('navigation').query()).toBeNull()
  })

  it('renders the center action between the split tab halves', async () => {
    const { screen } = await renderShell('/', true)
    unmount = () => screen.unmount()

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
