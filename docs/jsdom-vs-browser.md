---
type: Reference
title: What jsdom cannot see
description: Eleven side-by-side specs showing what a simulated DOM gets wrong, and what Vitest browser mode catches instead.
tags: [testing, jsdom, browser-mode, vitest]
status: stable
---

# What jsdom cannot see

Every browser tier in this repo could have been a jsdom tier. This document is
why it isn't.

It is written to be read start to finish by someone who has never used Vitest
browser mode. Each section is one behaviour, written twice: once the way you'd
write it in jsdom, once the way it's written here. Everything below is measured
against this app — you can run both sides.

```bash
pnpm test:jsdom   # 52 tests, all green, all of them lying
pnpm test         # the same behaviours in a real Chromium
```

The jsdom tier is not a gate and never fails the build. It exists to be read
next to its counterpart.

## Start here: two bugs I shipped on purpose

I made two one-line edits to `src/style.css` — both realistic mistakes — and ran
both tiers.

**Bug 1.** Shrink the touch-target token, so every button in the app drops from
44px to 32px:

```diff
- --spacing-touch-target: 2.75rem;
+ --spacing-touch-target: 2rem;
```

**Bug 2.** Delete the exemption that lets people put a caret in a text field.
On iOS this presents as a keyboard that won't open:

```diff
- input, textarea, [contenteditable='true'] {
-   -webkit-user-select: text;
-   user-select: text;
- }
```

Results:

| | jsdom tier | browser tier |
| --- | --- | --- |
| Bug 1 | ✅ 52/52 pass | ❌ `the "default" button is 32px on a touch device` |
| Bug 2 | ✅ 52/52 pass | ❌ `expected 'none' to be 'text'` |

That's the entire argument. The rest of this document explains why.

## The one-sentence reason

**jsdom has no layout engine and does not apply your CSS**, so it answers every
question about size with `0` and every question about style with the default
value.

Not an error. A plausible-looking answer that happens to be wrong.

## Example 1: measuring a button

Every control in this app has to be at least 44px on a touch screen. Here's the
test, both ways.

**jsdom** — you cannot write it, because there is nothing to measure:

```ts
const button = getByRole('button', { name: 'default' })

expect(button.getBoundingClientRect().height).toBe(0) // ← always 0
```

Nothing was laid out, so every element is 0×0. A test asserting
`toBeGreaterThanOrEqual(44)` here is red forever, and a test that can never go
green gets deleted rather than fixed.

So what people write instead is a check on the class name:

```ts
expect(button.className).toContain('h-touch-target') // ✅ passes
```

That is bug 1. The class is still there. The button is 32px.

**Browser mode** — you just ask the element:

```ts
const height = page.getByRole('button', { name: size }).element()
  .getBoundingClientRect().height

expect(height).toBeGreaterThanOrEqual(44)
// ❌ the "default" button is 32px on a touch device
```

Same API you already know. Real number, because a real browser laid it out.

📄 `src/__tests__/jsdom/touchTargets.spec.ts` ↔ `touch/touchTargets.spec.ts`

## Example 2: the media query you can't fake

Buttons in this app are sized touch-first and shrink on desktop:

```css
h-touch-target pointer-fine:h-10
```

So the 44px rule only exists when the browser reports `pointer: coarse`. To
test it, you need a device with a coarse pointer.

**jsdom** — `matchMedia` doesn't exist at all:

```ts
expect(window.matchMedia).toBeUndefined()
```

You can stub it, but a stub only ever tells you what you already decided:

```ts
vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }))

expect(matchMedia('(pointer: coarse)').matches).toBe(true)      // ✅
expect(matchMedia('(pointer: fine)').matches).toBe(true)        // ✅ ...both?
expect(matchMedia('(this is not a media query)').matches).toBe(true) // ✅ 🙃
```

**Browser mode** — you ask Playwright for a device that really has one:

```ts
// vitest.config.ts
{
  name: 'touch',
  browser: {
    provider: playwright({
      contextOptions: { hasTouch: true, isMobile: true },
    }),
  },
}
```

Now Chromium genuinely reports a coarse pointer, and the spec can open by
checking that it did:

```ts
it('reports a coarse pointer', () => {
  expect(matchMedia('(pointer: coarse)').matches).toBe(true)
})
```

This is the part that's hard to appreciate until you've used it: the condition
comes from **outside** the page, so the test cannot quietly agree with itself.

## Example 3: the loop that never runs

The shell's inner containers must stop scroll-chaining. The spec asks the DOM
which elements actually scroll, then holds those to the rule:

```ts
function scrollContainers(root: Element) {
  return [root, ...root.querySelectorAll('*')].filter((el) => {
    const { overflowY } = getComputedStyle(el)
    return overflowY === 'auto' || overflowY === 'scroll'
  })
}

for (const el of scrollContainers(container)) {
  expect(getComputedStyle(el).overscrollBehaviorY).toBe('contain')
}
```

**In jsdom this passes on an app with no overscroll containment anywhere.**

Not because the rule holds. Because `overflow-y-auto` computes to `visible`, so
the filter matches **zero elements** and the loop body never executes:

```ts
expect(scrollContainers(container)).toHaveLength(0) // ← nothing was checked
```

A green check means nothing until you know what would turn it red. This spec is
saved only by a habit worth copying — it opens with a guard:

```ts
expect(containers.length, 'no scroll container found — the query is wrong')
  .toBeGreaterThan(0)
```

That guard is the only line in the file that fails under jsdom.

📄 `src/__tests__/jsdom/scrollContainers.spec.ts` ↔ `components/scrollContainers.spec.ts`

## Example 4: "but the CSS is right there"

The natural objection: surely you just didn't load the stylesheet? Let's check.
The jsdom tier sets `css: true`, so Tailwind really compiles, and jsdom really
parses it:

```ts
expect(rules).toBeGreaterThan(100)  // 470 rules, .select-none among them
expect(layers).toBeGreaterThan(0)   // 7 @layer blocks
```

The CSS is present and understood. It is applied to nothing. jsdom's cascade
handles exactly three rule types — `@import`, `@media`, and plain style rules —
and four separate mechanisms modern CSS relies on fall outside it.

**1. `@layer` blocks are skipped.** Every rule type that isn't one of the three
falls off the end of the `if`/`else` chain. Tailwind v4 emits all its utilities
inside `@layer`, so none of them apply. `@supports`, `@container` and `@scope`
go the same way.

**2. `@media` matches only bare *types*, never *features*.** jsdom's evaluator
returns true for `all` and `screen` and false for everything else:

```ts
expect(window.innerWidth).toBe(1024)
// ...and yet:
// @media (min-width: 1px) { .box { color: rgb(2,2,2) } }
expect(getComputedStyle(box).color).toBe('rgb(1, 1, 1)') // the rule never applied
```

That is every `md:`, `lg:`, `dark:`, `motion-reduce:` and `pointer-coarse:`
utility you own. A bare `@media screen` *does* work, which is what makes it
hard to spot — media queries aren't unsupported, they're selectively supported.

**3. Nested rules are parsed and discarded.** The parent's own declarations
apply; the nested branch doesn't:

```css
.parent { font-size: 11px; & .child { font-weight: 700 } }
```

```ts
expect(getComputedStyle(parent).fontSize).toBe('11px')          // ✅ applied
expect(getComputedStyle(child).fontWeight).toBe('normal')       // ✗ dropped
```

**4. `var()` is never substituted.** This one is nastier than an initial value,
because the string it returns is *truthy*:

```ts
// :root { --brand: rgb(13,14,15) }  .box { color: var(--brand) }
expect(getComputedStyle(root).getPropertyValue('--brand')).toBe('rgb(13,14,15)') // resolves!
expect(getComputedStyle(box).color).toBe('var(--brand)')                          // ...unsubstituted
```

So `expect(color).not.toBe('rgba(0, 0, 0, 0)')` passes, and any code that
*parses* a computed value — contrast maths, `parseFloat` on a spacing token —
silently gets `NaN`.

Put together, one button and four mechanisms, one outcome:

| element | your CSS says | jsdom reports |
| --- | --- | --- |
| `<button class="h-touch-target">` | `height: 2.75rem` | `auto` |
| `<button class="select-none">` | `user-select: none` | `auto` |
| `<main class="overflow-y-auto">` | `overflow-y: auto` | `visible` |
| `<main class="overscroll-contain">` | `overscroll-behavior-y: contain` | `auto` |
| `<div class="md:hidden">` | `display: none` above 768px | `block` |

Every answer is the initial value — the same answer an element with no styling
at all would give. That is bug 2: with the exemption deleted, the text field
reports `auto` exactly as it did before.

**Browser mode** reports what the browser resolved:

```ts
expect(getComputedStyle(field).userSelect).toBe('text')
// ❌ expected 'none' to be 'text'
```

📄 `src/__tests__/jsdom/cascade.spec.ts` · `textSelection.spec.ts` ↔ `components/textSelection.spec.ts`

## Example 5: the dialog that's already gone

This is the subtlest one, and for a Vue + Reka UI app it's the most valuable.

jsdom expands **no shorthand**. Write your transition the normal way and the
number that matters comes back zero:

```ts
// .sheet { transition: opacity 300ms ease 50ms; animation: spin 1s linear }
expect(getComputedStyle(el).transitionDuration).toBe('0s')    // not 0.3s
expect(getComputedStyle(el).transitionDelay).toBe('0s')       // not 0.05s
expect(getComputedStyle(el).animationName).toBe('none')       // not "spin"

// Longhand survives, which is why this looks fine until it doesn't:
// .sheet { transition-duration: 300ms }
expect(getComputedStyle(el).transitionDuration).toBe('300ms') // ✅
```

Those aren't cosmetic values. They're branch conditions in two libraries this
app depends on:

- **Vue** — `whenTransitionEnds` calls `getTransitionInfo(el)`. Both timeouts
  are `0`, so the type is `null` and it calls `resolve()` immediately.
- **Reka UI** — `usePresence` reads `getComputedStyle(node).animationName || 'none'`.
  Given `none`, it goes straight to `UNMOUNT`, firing `leave` and `after-leave`
  back to back.

So the test everyone writes passes:

```ts
show.value = false
await nextTick()

expect(queryByText('Sheet')).toBeNull()  // ✅ jsdom — resolved synchronously
                                          // ❌ browser — still there for 300ms
```

And `DialogContent`'s real classes confirm where this lands:

```ts
el.className = 'data-[state=closed]:animate-slide-down-mobile sm:duration-200'
el.dataset.state = 'closed'

expect(getComputedStyle(el).animationName).toBe('none') // what usePresence reads
```

In Chromium the content stays mounted for the animation, focus is restored
*after* it, and a fast close-then-reopen lands in Reka's `unmountSuspended`
state. Every race lives in a window jsdom doesn't have.

📄 `src/__tests__/jsdom/transitions.spec.ts` ↔ `components/ui/dialog/dialogContent.spec.ts`

## Example 6: focus that lands anywhere

Focus is what a dialog test is really about, and jsdom will focus anything.

It decides focusability from `isFocusableAreaElement`, which checks the default
view, `isConnected`, `tabindex`, tag name, and `disabled`. No style. No
`hidden`. No `inert`. No rendering state at all:

```ts
expect(focusFresh((b) => (b.style.display = 'none'))).toBe(true)     // ✅ focused
expect(focusFresh((b) => (b.style.visibility = 'hidden'))).toBe(true) // ✅ focused
expect(focusFresh((b) => (b.hidden = true))).toBe(true)               // ✅ focused
```

A browser makes all three a no-op and leaves `activeElement` on `<body>`. So
focus traps, autofocus and restore-focus assertions don't merely fail to catch
a bug — they *cannot fail*.

`inert` is worse, because it doesn't exist:

```ts
expect('inert' in document.body).toBe(false)  // not even a reflected property
```

Set `inert` on your app root behind an open modal, and in jsdom focus and
clicks pass straight through it. Testing Library won't save you either — its
`isSubtreeInaccessible` checks `hidden`, `aria-hidden`, `display: none` and
`visibility: hidden`, but not `inert`. So `getByRole` cheerfully returns
background content the browser has made unreachable:

```ts
await user.click(getByRole('button', { name: 'Open settings' }))
// dialog open, app root marked inert
await user.click(getByRole('button', { name: 'Delete workout' }))  // background!
expect(deleteWorkout).toHaveBeenCalled()                           // ✅ green
// Chromium: inert removes it from hit-testing — the click never arrives
```

One more, in the opposite direction: jsdom grants `:focus-visible` to
programmatic focus, so it *manufactures* a focus ring that mouse users never
see.

```ts
button.focus()
expect(button.matches(':focus-visible')).toBe(true)              // ✅ jsdom
expect(getComputedStyle(button).outlineColor).toBe('rgb(2,2,2)') // rule applied
// Chromium: script-driven focus on a button doesn't match :focus-visible
```

This repo's visual tier forces the state through CDP instead
(`helpers/pseudoState.ts`) — precisely because the real state is hard to hold
still, and worth holding honestly.

📄 `src/__tests__/jsdom/focusAndInert.spec.ts`

## Example 7: the scroll lock that always works

My favourite, because the bug it hides is the most-reported mobile modal
complaint there is: *the page scrolls behind the open sheet.*

Reka's `useBodyScrollLock` measures the scrollbar the standard way:

```ts
const verticalScrollbarWidth = window.innerWidth - document.documentElement.clientWidth

if (verticalScrollbarWidth > 0) {
  document.body.style.paddingRight = `${config.padding}px`
  document.body.style.overflow = 'hidden'   // ← the actual lock
}
```

jsdom has no layout, so:

```ts
expect(window.innerWidth).toBe(1024)
expect(document.documentElement.clientWidth).toBe(0)  // ← no layout
expect(verticalScrollbarWidth()).toBe(1024)           // ← always > 0
```

The branch is **always** taken. Your test passes:

```ts
expect(document.body.style.overflow).toBe('hidden')  // ✅
```

It would also pass if the condition were `> -1`, or just `true`, because jsdom
can never produce the number that makes it interesting. On iOS — and on macOS
with overlay scrollbars — the real value is `0`, the branch is skipped,
`overflow: hidden` is never set, and the background scrolls.

Only a real browser can report a `0` there.

📄 `src/__tests__/jsdom/bodyScrollLock.spec.ts`

## Example 8: the click that lands on a button nobody could hit

A real click is resolved by *hit-testing*: the browser takes a point and finds
the topmost element there. jsdom has no layout, so it has no hit-testing —
`document.elementFromPoint` is `undefined` and every box is 0×0. `user-event`
dispatches on whatever element you handed it, and nothing above it in z-order
can intervene.

Put a full-screen scrim over a button — exactly what an open dialog does:

```ts
h('button', { onClick: () => (clicked = true) }, 'Delete workout'),
h('div', { style: 'position: fixed; inset: 0; z-index: 99' }),
```

```ts
await userEvent.click(getByRole('button', { name: 'Delete workout' }))
expect(clicked).toBe(true)   // ✅ jsdom — the scrim cannot participate at all
```

Browser mode, same markup, same assertion:

```text
TimeoutError: locator.click: Timeout 2000ms exceeded.
  waiting for element to be visible, enabled and stable
  - <div></div> intercepts pointer events
```

That message is the whole feature. A browser-mode click waits for the element
to be visible, stable, enabled, **and the hit target at the action point** —
the last check existing precisely to catch a scrim swallowing a click.

There's a nastier variant. `user-event` *does* have a `pointer-events` guard —
it walks ancestors reading the computed value and refuses. But the guard is
only as good as the cascade underneath it:

```ts
// .blocked { pointer-events: none }
await expect(userEvent.click(button)).rejects.toThrow(/pointer-events/i)  // ✅ honoured

// @media (min-width: 1px) { .blocked { pointer-events: none } }  ← md:pointer-events-none
await userEvent.click(button)
expect(clicked).toBe(true)   // ✗ ignored — the declaration never reached the computed style
```

Everything in Example 4 comes back here. Since the cascade never applied the
rule, the guard reads `auto` and lets the click through.

The same blindness reaches your queries. A control the browser has hidden at
this viewport is found, and reads as visible:

```ts
// @media (min-width: 1px) { .desktop-only { display: none } }
expect(getComputedStyle(getByRole('button', { name: 'Export' })).display)
  .toBe('inline-block')   // ✅ jsdom. In the browser it isn't on screen at all.
```

So `getByRole(...)` succeeds, `toBeVisible()` agrees, and the test goes on to
click a button the user cannot see.

📄 `src/__tests__/jsdom/hitTesting.spec.ts`

## Example 9: an accessibility suite that's green on an unreadable page

This is the one that should worry you most, because nothing about it looks
environment-dependent. axe-core runs fine in jsdom.

The page under test is grey text on a grey background:

```ts
h('h1', { style: 'color: #7a7a7a; background-color: #808080' }, 'Barely there')
```

The assertion is our normal helper, unchanged:

```ts
const results = await axe.run(container, { resultTypes: ['violations'] })
expect(results.violations).toEqual([]) // ✅ passes
```

axe isn't lying. It put `color-contrast` in a **third bucket**:

```ts
expect(results.violations.map((v) => v.id)).not.toContain('color-contrast')
expect(results.incomplete.map((v) => v.id)).toContain('color-contrast')
```

Comparing rendered colours needs canvas; jsdom has none, so the rule *could not
run*. And every standard helper — ours included — reads only
`results.violations`. **A rule that couldn't run is indistinguishable from a
rule that passed.**

In a real browser the same rule runs and fails.

📄 `src/__tests__/jsdom/a11y.spec.ts` ↔ `a11y/a11y.spec.ts`

## Example 10: the backup that downloads as "undefined"

The examples so far are about CSS and layout. This one is different, and it's the worst.
It comes from jsdom objects and Node objects living in the same process,
wearing the same class names, and not being the same thing — the point Artem
Zakharchenko makes in [Why I Won't Use JSDOM](https://www.epicweb.dev/why-i-won-t-use-jsdom).

Exporting a backup does this:

```ts
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  // ...attach an <a href={url} download={filename}>, click it
}
```

Under jsdom, `URL.createObjectURL` is **Node's**, and the `Blob` handed to it is
**jsdom's**. Node doesn't recognise the object, so it stringifies it:

| step | browser | jsdom |
| --- | --- | --- |
| `URL.createObjectURL(blob)` | `blob:http://localhost:5173/<uuid>` | `blob:nodedata:<uuid>` |
| `await fetch(url)` | `ok: true` | `ok: true` |
| `await response.text()` | `"backup contents"` | `"undefined"` |

Nothing throws. The user's backup file contains the nine characters
`undefined`. The browser spec's assertion is the only thing in the repo that
would have caught it:

```ts
expect(await response.text()).toBe('backup contents')
```

The same boundary breaks `structuredClone`, which matters more than it looks —
**IndexedDB stores values by the structured clone algorithm**, so this is the
machinery behind every Dexie write:

```ts
const cloned = structuredClone(new Blob(['backup contents']))

expect(cloned).not.toBeInstanceOf(Blob)      // it's a plain object
expect(Object.keys(cloned)).toEqual([])      // ...an empty one
```

A browser returns a Blob, or throws `DataCloneError` on something genuinely
uncloneable. jsdom returns `{}` and no error.

The root cause, in two lines:

```ts
import { Blob as NodeBlob } from 'node:buffer'

expect(new Blob(['x'])).not.toBeInstanceOf(NodeBlob) // two classes, one name
```

📄 `src/__tests__/jsdom/download.spec.ts` ↔ `lib/download.spec.ts`

## Example 11: the stub that becomes the thing under test

Nine APIs this app uses don't exist in jsdom:

```ts
scrollIntoView · animate · showModal · navigator.serviceWorker
navigator.clipboard · ResizeObserver · IntersectionObserver
visualViewport · matchMedia
```

Missing sounds like the *safe* failure — it's loud, you'll notice. Here's why
it isn't.

`TimePicker` centres the selected option when it mounts:

```ts
onMounted(() => {
  scroller.value
    ?.querySelector('[aria-pressed="true"]')
    ?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
})
```

In jsdom, mounting it throws:

```ts
expect(() => render(Picker)).toThrowError(/scrollIntoView is not a function/)
```

So you add a stub to `setup.ts`. Now the component mounts — and the only
assertion left available to you is this:

```ts
expect(calls).toEqual([{ behavior: 'auto', block: 'nearest', inline: 'center' }])
```

You are now testing that your component called a function with some arguments.
The question you actually care about — *did the selected option end up
visible?* — cannot be asked, because nothing was laid out and nothing scrolled.
The stub quietly converted a behaviour test into a call-signature test, and by
the time anyone rereads it, the comment explaining why is three years old.

📄 `src/__tests__/jsdom/platformApis.spec.ts`

## What browser mode costs

Being fair about the trade:

- **Startup.** A Chromium boot per project, a few seconds. The `unit` tier
  exists partly so the pre-commit hook never pays it.
- **Speed.** ~18s for 40 component tests here, versus ~2.1s for 52 jsdom ones.
- **CI setup.** You need browsers installed (`playwright install chromium`).

What you don't pay: a new API. If you know Testing Library, you know this
already — the locators, `render`, and the matchers are the same shapes.

```ts
// jsdom + Testing Library
const button = getByRole('button', { name: 'Start' })
await userEvent.click(button)

// Vitest browser mode
const button = page.getByRole('button', { name: 'Start' })
await userEvent.click(button)
```

## Setting it up

The whole of it:

```bash
pnpm add -D vitest @vitest/browser @vitest/browser-playwright playwright
```

```ts
// vitest.config.ts
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
})
```

## What this does not argue

jsdom is right for pure logic: no cascade, no layout, no real event dispatch.
This repo's `unit` tier runs in plain Node for exactly that and finishes in
~100ms, which no browser tier can approach. Most tests in most projects belong
there.

The claim is narrower. **When the thing under test *is* CSS, geometry, or a
platform capability, a simulated DOM doesn't give you a weaker test. It gives
you a green one.**

## Adding to this tier

Keep every spec paired with a browser counterpart and named after it, keep them
green, and end each file at the point where the blindness is proven rather than
asserting the browser's answer and failing. A red test here gets "fixed" by
someone eventually. A green one that documents what it cannot see survives.
