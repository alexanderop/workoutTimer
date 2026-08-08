---
type: Convention
title: Vitest practices
description: Browser fixtures, screen objects, assertion helpers, ARIA snapshots, tags, and viewport assertions.
tags: [testing, vitest, fixtures, snapshots, browser-mode]
status: stable
---

# Vitest practices

[testing-strategy.md](testing-strategy.md) decides which tier owns a test. This
page defines how browser-tier tests are written with the Vitest 4.1 APIs the
project uses.

## Fixtures own the lifecycle

A browser spec declares the screen it needs:

```ts
import { describe } from 'vitest'
import { it } from '../../fixtures'

it('starts a workout', async ({ timer }) => {
  await timer.chooseMode('AMRAP')
  await timer.setup.start()
  await timer.run.expectRunning()
})
```

`src/__tests__/fixtures.ts` resets persistent state, mounts the screen, and
registers its cleanup. Specs do not carry `beforeEach`, `afterEach`, or a
mutable cleanup callback. Fixtures are lazy, so only the names in a test's
parameter are created.

Use the Vitest 4.1 builder syntax:

```ts
const it = base.extend('harness', async ({}, { onCleanup }) => {
  const mounted = render(Harness)
  onCleanup(() => mounted.unmount())
  return { submit: page.getByRole('button', { name: 'Save' }) }
})
```

The empty object is required because Vitest parses it for fixture dependencies.
`.oxlintrc.json` allows that shape under test directories. A fixture may call
`onCleanup` once; split independent lifecycles into independent fixtures.

## Screen objects are the browser DSL

`src/__tests__/pages/` owns browser-mode screen objects and `test/e2e/pages/`
owns their Playwright counterparts. They centralize user-facing locators and
UI actions. Locators continue to use roles, labels, and accessible names—page
objects are not permission to replace the public interface with test IDs.

Screen objects stop at the UI. A method can assert that a result is visible;
the spec still asserts what reached IndexedDB because persistence is the
behavior under test, not a page implementation detail.

## Assertion helpers use `vi.defineHelper`

Any function that calls `expect` for a spec is wrapped in `vi.defineHelper`.
It removes helper frames from failures so reports point to the spec line that
asked for the assertion. Screen-object actions and locators remain ordinary
methods; `expect*` fields are helpers:

```ts
readonly expectRunning = vi.defineHelper(async () => {
  await expect.element(page.getByText('Work', { exact: true })).toBeVisible()
})
```

The same rule applies to shared helpers such as the axe assertions.

## Axe and ARIA snapshots answer different questions

`a11y.spec.ts` catches violations axe can name. `ariaStructure.spec.ts` uses
`toMatchAriaSnapshot` to catch promised semantics disappearing even when the
remaining markup is not invalid—for example, navigation becoming a generic
container. Keep snapshots scoped to stable regions such as navigation or a
mode chooser, and rebaseline deliberately with:

```bash
pnpm test:a11y -- --update
```

Read the accessibility-tree diff before committing it.

## Reachability uses `toBeInViewport`

`toBeVisible` can pass for an element clipped by a scroll container.
Assertions that claim a control is reachable use `toBeInViewport`, as in the
keyboard-shrunk dialog test: the submit button begins outside the viewport and
enters it after the dialog body scrolls.

## Retries are narrow; cross-cutting policy is tagged

Browser projects retry only infrastructure-shaped failures in CI. Assertion
failures do not get a second chance. A test that deliberately creates a race
uses the typed `flaky` tag, whose CI retry policy is defined once in
`vitest.config.ts` and typed in `src/__tests__/vitest.d.ts`.

Use a tag only when a category cuts across test tiers and carries runner
policy. Use projects for tier-based filtering and `-t` for names.
