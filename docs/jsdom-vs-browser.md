---
type: Reference
title: What jsdom cannot see
description: A guided tour of what a simulated DOM gets wrong, why it gets it wrong, and what Vitest browser mode does instead.
tags: [testing, jsdom, browser-mode, vitest]
status: stable
---

# What jsdom cannot see

Every browser tier in this repo could have been a jsdom tier. This document is
why it isn't.

You can run both sides:

```bash
pnpm test:jsdom   # 52 tests, all green, all of them lying
pnpm test         # the same behaviours in a real Chromium
```

The jsdom tier is not a gate and never fails the build. It exists to be read
next to its counterpart.

## Two bugs I shipped on purpose

Before any theory, here is the whole argument as an experiment. I made two
one-line edits to `src/style.css` — both realistic mistakes, both the kind that
survive review — and ran every tier.

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

| | jsdom tier | browser tier |
| --- | --- | --- |
| Bug 1 | ✅ 52/52 pass | ❌ `the "default" button is 32px on a touch device` |
| Bug 2 | ✅ 52/52 pass | ❌ `expected 'none' to be 'text'` |

Both bugs are visible to a user in the first second of use. Neither is visible
to a test suite that doesn't have a browser in it.

The rest of this document is the *why*, and it comes down to one picture.

## The one picture

Getting from a stylesheet to something a person can click involves five stages.
Every stage depends on the one before it:

```text
   parse ────▶ cascade ────▶ layout ────▶ paint ────▶ hit-test
     │            │             │            │            │
  "is this     "which        "where is    "what        "what is
   valid       rules win     this box,     colour is    under the
   CSS?"       for this      and how       this         cursor at
               element?"     big?"         pixel?"      x,y?"
```

Here is how far each runner gets:

```text
                parse    cascade    layout    paint    hit-test
   Chromium       ✅        ✅         ✅        ✅        ✅
   jsdom          ✅        ◑          ✗         ✗         ✗
                            │          │         │         │
                     3 rule types   every    no canvas   elementFromPoint
                     out of 20+     box is               is undefined
                                    0 × 0
```

That's it. That's the document.

jsdom is a **DOM implementation**, not a browser. It gives you a tree, events,
and a parser, and it stops before anything that requires knowing what the page
*looks like*. Everything below is a consequence of that line.

The failure mode is what makes it dangerous. jsdom doesn't throw when you ask a
question it can't answer — it returns the initial value. `height` is `0`.
`overflow-y` is `visible`. `transition-duration` is `0s`. Every one of those is
a perfectly plausible answer that happens to be wrong, and every one of them
sits in an `if` somewhere and takes the wrong branch quietly.

## The other picture: where your test actually runs

The second difference is structural rather than about CSS, and it explains a
family of bugs the first picture doesn't.

```text
   jsdom tier                        browser mode
   ──────────                        ────────────
 ┌───────────────────────┐        ┌───────────────────────┐
 │ node process          │        │ node process          │
 │                       │        │   vitest ──┐          │
 │   vitest              │        └────────────┼──────────┘
 │    └ your test        │                     │ websocket
 │       └ jsdom globals │        ┌────────────▼──────────┐
 │          window       │        │ chromium              │
 │          document     │        │  ┌─────────────────┐  │
 │          Blob   ◀── fake       │  │ iframe          │  │
 │                       │        │  │   your test     │  │
 │   ▲ Node's own        │        │  │   your component│  │
 │     globals are       │        │  └─────────────────┘  │
 │     still underneath  │        │   ▲ real window       │
 │     all of it         │        │     real layout       │
 └───────────────────────┘        │     real Blob         │
                                  └───────────────────────┘
```

In the jsdom tier your test runs in Node, with browser globals *installed over*
Node's. Two objects called `Blob` exist in the same process and are not the same
class — that's Example 10, and it corrupts a backup file without throwing.

In browser mode your test is shipped into the page and runs there. It isn't
driving the browser from outside; it's *inside* the thing under test. That's why
`getBoundingClientRect()` returns a real number, and why the conditions a test
runs under — viewport, pointer type, device scale — have to be set from the
outside, where the page can't reach them.

Now the examples. They're grouped by which stage of the pipeline gives out.

---

## Part 1 — the cascade runs out of rules

### Example 1: "but the CSS is right there"

The natural first objection: surely you just didn't load the stylesheet?

Let's remove that objection. The jsdom tier sets `css: true`, so Tailwind really
compiles and jsdom really parses the output:

```ts
expect(rules).toBeGreaterThan(100)  // 470 rules, .select-none among them
expect(layers).toBeGreaterThan(0)   // 7 @layer blocks
```

The CSS is present and understood. It is applied to nothing.

jsdom's cascade is, in essence, this loop:

```text
   for each rule in the stylesheet:
     if  @import          →  recurse into it            ✅
     elif @media          →  is the query "all" or "screen"? then recurse
     elif plain style rule → apply it                   ✅
     ── and that is the entire chain ──
              │
              ▼  everything else falls off the end, silently
     @layer   @supports   @container   @scope   & nested rules   var()
```

Four consequences, each measured in `cascade.spec.ts`:

**1. `@layer` blocks are skipped.** Tailwind v4 emits *all* its utilities inside
`@layer`. So none of them apply. Not "some edge cases" — the whole framework.

**2. `@media` matches bare *types*, never *features*.** jsdom's evaluator is
string equality against `"all"` and `"screen"`:

```ts
expect(window.innerWidth).toBe(1024)
// ...and yet, given:
//   @media (min-width: 1px) { .box { color: rgb(2,2,2) } }
expect(getComputedStyle(box).color).toBe('rgb(1, 1, 1)')  // never applied
```

That is every `md:`, `lg:`, `dark:`, `motion-reduce:` and `pointer-coarse:`
utility you own. A bare `@media screen` *does* work, which is what makes it hard
to spot: media queries aren't unsupported, they're selectively supported.

**3. Nested rules are parsed and discarded.** The parent's own declarations
apply; the nested branch doesn't:

```css
.parent { font-size: 11px; & .child { font-weight: 700 } }
```

```ts
expect(getComputedStyle(parent).fontSize).toBe('11px')     // ✅ applied
expect(getComputedStyle(child).fontWeight).toBe('normal')  // ✗ dropped
```

**4. `var()` is never substituted.** This is nastier than an initial value,
because the string that comes back is *truthy*:

```ts
// :root { --brand: rgb(13,14,15) }   .box { color: var(--brand) }
expect(getComputedStyle(root).getPropertyValue('--brand')).toBe('rgb(13,14,15)') // resolves!
expect(getComputedStyle(box).color).toBe('var(--brand)')                         // unsubstituted
```

So `expect(color).not.toBe('rgba(0, 0, 0, 0)')` passes, and any code that
*parses* a computed value — contrast maths, `parseFloat` on a spacing token —
gets `NaN` without a word of complaint.

Put together, one button and one outcome:

| element | your CSS says | jsdom reports |
| --- | --- | --- |
| `<button class="h-touch-target">` | `height: 2.75rem` | `auto` |
| `<button class="select-none">` | `user-select: none` | `auto` |
| `<main class="overflow-y-auto">` | `overflow-y: auto` | `visible` |
| `<main class="overscroll-contain">` | `overscroll-behavior-y: contain` | `auto` |
| `<div class="md:hidden">` | `display: none` above 768px | `block` |

Every answer is the initial value — the same answer an element with *no
stylesheet at all* would give. Which is exactly bug 2: with the text-field
exemption deleted, the field reports `auto`, precisely as it did before.

**Browser mode** asks the browser what it resolved, and gets it:

```ts
expect(getComputedStyle(field).userSelect).toBe('text')
// ❌ expected 'none' to be 'text'
```

📄 `src/__tests__/jsdom/cascade.spec.ts` · `textSelection.spec.ts` ↔
`components/textSelection.spec.ts`

### Example 2: the media query you can't fake

Buttons here are sized touch-first and shrink on desktop:

```css
h-touch-target pointer-fine:h-10
```

So the 44px floor only exists when the browser reports `pointer: coarse`. To
test it, you need a device that actually has one.

**jsdom** — `matchMedia` doesn't exist at all:

```ts
expect(window.matchMedia).toBeUndefined()
```

You can stub it. But a stub only ever tells you what you already decided:

```ts
vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }))

expect(matchMedia('(pointer: coarse)').matches).toBe(true)            // ✅
expect(matchMedia('(pointer: fine)').matches).toBe(true)              // ✅ ...both?
expect(matchMedia('(this is not a media query)').matches).toBe(true)  // ✅ 🙃
```

**Browser mode** — you ask Playwright for a device that really has one, and the
condition arrives from outside the page:

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

Now Chromium genuinely reports a coarse pointer, so the spec can open by
checking that it did — and this check is not circular, because nothing inside
the test could have made it true:

```ts
it('reports a coarse pointer', () => {
  expect(
    matchMedia('(pointer: coarse)').matches,
    'this tier launched without touch emulation, so every assertion below is ' +
      'measuring a desktop pointer and proves nothing',
  ).toBe(true)
})
```

That distinction is worth sitting with, because it generalises:

```text
   jsdom              the test decides the environment,
                      then asserts against its own decision
                      ┌──────────────┐
                      │ test ──▶ stub│──▶ assertion   (a closed loop)
                      └──────────────┘

   browser mode       the environment is configured outside the test,
                      and the test can only observe it
     config ──▶ chromium context ──▶ page ──▶ test ──▶ assertion
```

📄 `src/__tests__/touch/touchTargets.spec.ts`

### Example 3: the dialog that's already gone

This is the subtlest one, and for a Vue + Reka UI app it's the most valuable.

jsdom expands **no shorthand**. Write your transition the normal way and the
number that matters comes back zero:

```ts
// .sheet { transition: opacity 300ms ease 50ms; animation: spin 1s linear }
expect(getComputedStyle(el).transitionDuration).toBe('0s')  // not 0.3s
expect(getComputedStyle(el).transitionDelay).toBe('0s')     // not 0.05s
expect(getComputedStyle(el).animationName).toBe('none')     // not "spin"

// Longhand survives — which is why this looks fine until it doesn't:
// .sheet { transition-duration: 300ms }
expect(getComputedStyle(el).transitionDuration).toBe('300ms')  // ✅
```

Those aren't cosmetic values. They are branch conditions in two libraries this
app depends on:

- **Vue** — `whenTransitionEnds` calls `getTransitionInfo(el)`. Both timeouts
  come back `0`, so the type is `null` and it calls `resolve()` on the spot.
- **Reka UI** — `usePresence` reads
  `getComputedStyle(node).animationName || 'none'`. Given `none`, it takes the
  immediate `UNMOUNT` branch, firing `leave` and `after-leave` back to back.

Which collapses the entire window in which dialog bugs live:

```text
   Chromium
   close ──┬──────────────── 300ms ────────────────┬──▶ unmounted
           │ content still on screen               │
           │ focus not yet restored                │
           │ reopening here → unmountSuspended     │
           └── your assertion runs HERE ───────────┘   ← fails, correctly

   jsdom
   close ──┬──▶ unmounted
           └── your assertion runs here ✅
               (duration read back as 0s, so leave resolved synchronously)
```

So the test everyone writes passes:

```ts
show.value = false
await nextTick()

expect(queryByText('Sheet')).toBeNull()  // ✅ jsdom — resolved synchronously
                                         // ❌ browser — still there for 300ms
```

And `DialogContent`'s real shipped classes land exactly on this:

```ts
el.className = 'data-[state=closed]:animate-slide-down-mobile sm:duration-200'
el.dataset.state = 'closed'

expect(getComputedStyle(el).animationName).toBe('none')  // what usePresence reads
```

Every race — focus restored too early, a double-click reopening mid-close, a
`v-if` unmounting under an active transition — lives in a window jsdom doesn't
have.

📄 `src/__tests__/jsdom/transitions.spec.ts` ↔
`components/ui/dialog/dialogContent.spec.ts`

---

## Part 2 — there is no layout

### Example 4: measuring a button

Every control in this app has to be at least 44px on a touch screen. Here's the
test, both ways.

**jsdom** — you cannot write it, because there is nothing to measure:

```ts
const button = getByRole('button', { name: 'default' })

expect(button.getBoundingClientRect().height).toBe(0)  // ← always 0
```

Nothing was laid out, so every element is 0×0. A test asserting
`toBeGreaterThanOrEqual(44)` here is red forever, and a test that can never go
green gets deleted rather than fixed.

So what people write instead is a check on the class name:

```ts
expect(button.className).toContain('h-touch-target')  // ✅ passes
```

That is bug 1. The class is still there. The button is 32px.

**Browser mode** — you just ask the element:

```ts
const locator = page.getByRole('button', { name: size })
await expect.element(locator).toBeVisible()

expect(
  locator.element().getBoundingClientRect().height,
  `the "${size}" button is ${height}px on a touch device`,
).toBeGreaterThanOrEqual(44)
// ❌ the "default" button is 32px on a touch device
```

Same API you already know, and a real number, because a real browser laid it
out.

📄 `src/__tests__/jsdom/touchTargets.spec.ts` ↔ `touch/touchTargets.spec.ts`

### Example 5: the loop that never runs

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
expect(scrollContainers(container)).toHaveLength(0)  // ← nothing was checked
```

A green check means nothing until you know what would turn it red. This spec is
saved by one habit worth stealing — it opens with a guard on its own premise:

```ts
expect(containers.length, 'no scroll container found — the query is wrong')
  .toBeGreaterThan(0)
```

That guard is the only line in the file that fails under jsdom. Every assertion
it was protecting passes vacuously.

📄 `src/__tests__/jsdom/scrollContainers.spec.ts` ↔
`components/scrollContainers.spec.ts`

### Example 6: the scroll lock that always works

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

`clientWidth` is a layout question. Watch what each runner answers:

```text
   scrollbarWidth = window.innerWidth − documentElement.clientWidth

   classic scrollbar    innerWidth − (innerWidth − bar)  > 0  → lock applied
   overlay scrollbar    innerWidth −  innerWidth         = 0  → lock SKIPPED ← the bug
   jsdom (measured)          1024  −           0      = 1024  → lock always applied
                                                ▲
                                                └── no layout, so clientWidth is 0
```

The branch is **always** taken. Your test passes:

```ts
expect(document.body.style.overflow).toBe('hidden')  // ✅
```

It would also pass if the condition were `> -1`, or just `true`, because jsdom
can never produce the number that makes the condition interesting. On iOS — and
on macOS with overlay scrollbars — the real value is `0`, the branch is skipped,
`overflow: hidden` is never set, and the background scrolls under your sheet.

Only a real browser can report a `0` there.

📄 `src/__tests__/jsdom/bodyScrollLock.spec.ts`

---

## Part 3 — no layout means no hit-testing

### Example 7: the click that lands on a button nobody could hit

A real click is resolved by *hit-testing*: the browser takes a point and finds
the topmost element there. jsdom has no layout, so it has no hit-testing at all
— `document.elementFromPoint` is `undefined` and every box is 0×0. `user-event`
dispatches on whatever element you handed it, and nothing above it in z-order
can intervene.

Put a full-screen scrim over a button — exactly what an open dialog does:

```ts
h('button', { onClick: () => (clicked = true) }, 'Delete workout'),
h('div', { style: 'position: fixed; inset: 0; z-index: 99' }),
```

```text
   what the tree says              what the screen shows
   ──────────────────              ─────────────────────
   <div>                            ┌──────────────────────┐
     <button>Delete</button>        │░░░░░░░░░░░░░░░░░░░░░░│ ← scrim
     <div class="scrim"/>           │░░░┌────────────┐░░░░░│   inset: 0
   </div>                           │░░░│   Delete   │░░░░░│   z-index: 99
                                    │░░░└────────────┘░░░░░│
   jsdom dispatches here ───┐       └──────────────────────┘
   because it is the node   │          ▲
   you handed it            └──────────┼── a real click lands on the scrim
                                       └── the handler never runs
```

```ts
await userEvent.click(getByRole('button', { name: 'Delete workout' }))
expect(clicked).toBe(true)  // ✅ jsdom — the scrim cannot participate at all
```

Browser mode, same markup, same assertion:

```text
TimeoutError: locator.click: Timeout 2000ms exceeded.
  waiting for element to be visible, enabled and stable
  - <div></div> intercepts pointer events
```

That message is the whole feature. Before a browser-mode click fires, Playwright
waits for four things:

```text
   visible   ─ non-empty box, not visibility:hidden
   stable    ─ same position for two animation frames
   enabled   ─ not [disabled]
   receives  ─ hit-testing at the action point returns THIS element
      events    ▲
                └── the check that has no jsdom equivalent, at all
```

There's a nastier variant, because `user-event` *does* have a `pointer-events`
guard — it walks ancestors reading the computed value and refuses. But a guard
is only as good as the cascade underneath it:

```ts
// .blocked { pointer-events: none }
await expect(userEvent.click(button)).rejects.toThrow(/pointer-events/i)  // ✅ honoured

// @media (min-width: 1px) { .blocked { pointer-events: none } }  ← md:pointer-events-none
await userEvent.click(button)
expect(clicked).toBe(true)  // ✗ ignored — the declaration never reached the computed style
```

Everything from Example 1 comes back here. The cascade never applied the rule,
so the guard reads `auto` and lets the click through.

The same blindness reaches your *queries*. A control the browser has hidden at
this viewport is found, and reads as visible:

```ts
// @media (min-width: 1px) { .desktop-only { display: none } }
expect(getComputedStyle(getByRole('button', { name: 'Export' })).display)
  .toBe('inline-block')  // ✅ jsdom. In the browser it isn't on screen at all.
```

So `getByRole(...)` succeeds, `toBeVisible()` agrees, and the test goes on to
click a button the user cannot see.

📄 `src/__tests__/jsdom/hitTesting.spec.ts`

### Example 8: focus that lands anywhere

Focus is what a dialog test is really about, and jsdom will focus anything.

It decides focusability from `isFocusableAreaElement`, which checks the default
view, `isConnected`, `tabindex`, tag name, and `disabled`. No style. No
`hidden`. No `inert`. No rendering state at all:

```ts
expect(focusFresh((b) => (b.style.display = 'none'))).toBe(true)       // ✅ focused
expect(focusFresh((b) => (b.style.visibility = 'hidden'))).toBe(true)  // ✅ focused
expect(focusFresh((b) => (b.hidden = true))).toBe(true)                // ✅ focused
```

A browser makes all three a no-op and leaves `activeElement` on `<body>`. So
focus traps, autofocus and restore-focus assertions don't merely fail to catch a
bug — they *cannot fail*.

`inert` is worse, because it doesn't exist:

```ts
expect('inert' in document.body).toBe(false)  // not even a reflected property
```

Mark your app root `inert` behind an open modal and in jsdom focus and clicks
pass straight through it. Testing Library won't save you either — its
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

**One claim I had to retract here**, because it is the most tempting example in
this whole document and it does not hold: I wrote that jsdom grants
`:focus-visible` to programmatic focus and so manufactures a focus ring mouse
users never see. Measured side by side against Chromium, it doesn't. jsdom 30
replaced nwsapi with `@asamuzakjp/dom-selector`, which implements a real modality
heuristic, and the two agree on the cases that matter — a programmatic
`button.focus()` matches in neither, a focused `<input>` matches in both. (jsdom
≤26 *did* alias it to `:focus`, so this is a recent fix, not a long-standing
property.) The assertion I nearly shipped only passed because earlier tests in
the same file had moved focus around and churned the event log the heuristic
reads.

That's a good illustration of the standing rule for this document: nothing goes
in that I haven't measured in this repo, and "a jsdom limitation everyone knows
about" is exactly the kind of claim that gets stale.

📄 `src/__tests__/jsdom/focusAndInert.spec.ts`

---

## Part 4 — no paint, so no pixels to inspect

### Example 9: an accessibility suite that's green on an unreadable page

This is the one that should worry you most, because nothing about it looks
environment-dependent. axe-core runs fine in jsdom.

The page under test is grey text on a grey background:

```ts
h('h1', { style: 'color: #7a7a7a; background-color: #808080' }, 'Barely there')
```

The assertion is our normal helper, unchanged:

```ts
const results = await axe.run(container, { resultTypes: ['violations'] })
expect(results.violations).toEqual([])  // ✅ passes
```

axe isn't lying to you. It put `color-contrast` in a **third bucket**:

```text
   axe.run()
     ├── violations     ← the only bucket your helper reads
     ├── incomplete     ← "I could not check this"
     │      └── color-contrast lands HERE, because comparing rendered
     │          colours needs canvas, and jsdom has no canvas
     ├── passes
     └── inapplicable   ← target-size lands here: every box is 0×0,
                            so the rule finds nothing to measure
```

```ts
expect(results.violations.map((v) => v.id)).not.toContain('color-contrast')
expect(results.incomplete.map((v) => v.id)).toContain('color-contrast')
```

**A rule that couldn't run is indistinguishable from a rule that passed**, if
you only read `violations` — and every standard helper, ours included, only
reads `violations`. In a real browser the same rule runs, and fails.

📄 `src/__tests__/jsdom/a11y.spec.ts` ↔ `a11y/a11y.spec.ts`

---

## Part 5 — not a browser at all

### Example 10: the backup that downloads as "undefined"

Everything so far has been about the rendering pipeline. This one comes from the
*second* picture — jsdom objects and Node objects living in the same process,
wearing the same class names, and not being the same thing. It's the point Artem
Zakharchenko makes in
[Why I Won't Use JSDOM](https://www.epicweb.dev/why-i-won-t-use-jsdom).

Exporting a backup does this:

```ts
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  // ...attach an <a href={url} download={filename}>, click it
}
```

Under jsdom, `URL.createObjectURL` is **Node's**, and the `Blob` handed to it is
**jsdom's**. Node doesn't recognise the object, so it stringifies it:

```text
   ┌─ node realm ───────────────┐   ┌─ jsdom realm ──────────────┐
   │  URL.createObjectURL  ◀────┼───┼─── new Blob(['backup'])    │
   │  class Blob (node:buffer)  │   │  class Blob (jsdom)        │
   └────────────────────────────┘   └────────────────────────────┘
       same name. different class. no error. String(blob) → "undefined"
```

| step | browser | jsdom |
| --- | --- | --- |
| `URL.createObjectURL(blob)` | `blob:http://localhost:5173/<uuid>` | `blob:nodedata:<uuid>` |
| `await fetch(url)` | `ok: true` | `ok: true` |
| `await response.text()` | `"backup contents"` | `"undefined"` |

Nothing throws. The user's backup file contains the nine characters `undefined`.
The browser spec's assertion is the only thing in the repo that would have caught
it:

```ts
expect(await response.text()).toBe('backup contents')
```

The same boundary breaks `structuredClone`, which matters more than it looks —
**IndexedDB stores values by the structured clone algorithm**, so this is the
machinery behind every Dexie write in the app:

```ts
const cloned = structuredClone(new Blob(['backup contents']))

expect(cloned).not.toBeInstanceOf(Blob)  // it's a plain object
expect(Object.keys(cloned)).toEqual([])  // ...an empty one
```

A browser returns a Blob, or throws `DataCloneError` on something genuinely
uncloneable. jsdom returns `{}` and no error. The root cause, in two lines:

```ts
import { Blob as NodeBlob } from 'node:buffer'

expect(new Blob(['x'])).not.toBeInstanceOf(NodeBlob)  // two classes, one name
```

📄 `src/__tests__/jsdom/download.spec.ts` ↔ `lib/download.spec.ts`

### Example 11: the stub that becomes the thing under test

Nine APIs this app uses don't exist in jsdom:

```text
   scrollIntoView · animate · showModal · navigator.serviceWorker
   navigator.clipboard · ResizeObserver · IntersectionObserver
   visualViewport · matchMedia
```

Missing sounds like the *safe* failure — it's loud, you'll notice it. Here's why
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
The question you actually care about — *did the selected option end up visible?*
— cannot be asked, because nothing was laid out and nothing scrolled:

```text
   what you wanted to test        what the stub left you testing
   ──────────────────────         ──────────────────────────────
   [ 07:00 ]                       scrollIntoView was called
   [ 07:15 ]  ◀ visible?           with {behavior, block, inline}
   [ 07:30 ]
        ▲ a layout question        ▲ a call-signature question
```

The stub quietly converted a behaviour test into a call-signature test, and by
the time anyone rereads it, the comment explaining why is three years old.

📄 `src/__tests__/jsdom/platformApis.spec.ts`

---

## So what is browser mode actually giving you?

"It's real" is the honest short answer, but it undersells four things that are
structurally different rather than just more accurate.

**1. The environment comes from outside the page.** Viewport, pointer type,
device scale, permissions, locale, timezone — all set on the browser context,
where the test cannot reach them. That's the difference between a `touch` tier
and a test that stubs `matchMedia` and agrees with itself.

```ts
provider: playwright({ contextOptions: { hasTouch: true, isMobile: true } })
```

**2. Actions are gated on actionability.** A click waits for visible, stable,
enabled, and *receives-pointer-events*, then fails with the element that got in
the way. There is no assertion to write; the interaction itself is the check.

**3. You get the real browser's control surface.** Because the tier runs
Chromium through Playwright, a CDP session is available. This repo uses it to
force pseudo-states for screenshots — `:hover`, `:focus-visible` and `:active`
on six buttons at once, which no amount of pointer scripting can hold still:

```ts
import { cdp } from 'vitest/browser'

await session.send('CSS.forcePseudoState', {
  nodeId,
  forcedPseudoClasses: ['hover', 'focus-visible'],
})
```

That's DevTools' own "toggle element state" panel, so the states are real —
user-agent defaults included — rather than a stylesheet rewritten to swap
`:hover` for a class. Full walkthrough in `helpers/pseudoState.ts`.

**4. Assertions can wait for the browser instead of racing it.**
`expect.element()` retries until the locator settles, which is what makes it
safe to assert on something mid-transition — the window Example 3 showed jsdom
doesn't have:

```ts
await expect.element(page.getByRole('dialog')).toBeVisible()
await expect.element(page.getByText('Sheet')).not.toBeInTheDocument()
```

And when something does fail, `trace: { mode: 'retain-on-failure' }` leaves a
Playwright trace in `.vitest/traces` — DOM snapshots per step, so you can scrub
to the moment it broke instead of re-running with `console.log`.

What you *don't* pay is a new API. If you know Testing Library, you already know
this:

```ts
// jsdom + Testing Library
const button = getByRole('button', { name: 'Start' })
await userEvent.click(button)

// Vitest browser mode
const button = page.getByRole('button', { name: 'Start' })
await userEvent.click(button)
```

## If you're reaching for happy-dom instead

happy-dom is the usual answer to "jsdom is slow". On the axis this document
cares about it is worse, and in a specific way: **jsdom refuses, happy-dom
guesses.**

Measured side by side — jsdom 30.0.1 against happy-dom 20.11.2, same markup:

| | jsdom | happy-dom | browser |
| --- | --- | --- | --- |
| `<p hidden>` → `display` | `none` ✅ | **`block`** ✗ | `none` |
| `<p hidden>.checkVisibility()` | not implemented | **`true`** ✗ | `false` |
| `IntersectionObserver` | `undefined` | **`function`** | real |
| `ResizeObserver` | `undefined` | **`function`** | real |

The observers are the trap. They are constructors that pass feature detection
and accept `observe()` — and then never fire. Zero callbacks, ever:

```ts
if (window.IntersectionObserver) {   // ✅ true in happy-dom
  const observer = new IntersectionObserver(onIntersect)
  observer.observe(target)           // ✅ accepted
}
// onIntersect is never called. Not once.
```

So lazy-loading, infinite scroll, reveal-on-scroll and virtualised lists all
silently do nothing, and the test asserting that nothing has happened yet is
green forever. jsdom's `undefined` is the friendlier failure: it throws, you
notice, and you have to decide what to do about it.

## What browser mode costs

Being fair about the trade:

- **Startup.** A Chromium boot per project, a few seconds. The `unit` tier
  exists partly so the pre-commit hook never pays it.
- **Speed.** ~18s for 40 component tests here, versus ~2.1s for 52 jsdom ones.
- **CI setup.** You need browsers installed (`playwright install chromium`).

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

jsdom is right for pure logic: no cascade, no layout, no real event dispatch
needed. This repo's `unit` tier runs in plain Node for exactly that and finishes
in ~100ms, which no browser tier can approach. Most tests in most projects belong
there.

The claim is narrower. **When the thing under test *is* CSS, geometry, or a
platform capability, a simulated DOM doesn't give you a weaker test. It gives you
a green one.**

## Adding to this tier

Keep every spec paired with a browser counterpart and named after it, keep them
green, and end each file at the point where the blindness is proven rather than
asserting the browser's answer and failing. A red test here gets "fixed" by
someone eventually. A green one that documents what it cannot see survives.

## Sources

Worth reading before repeating any of this:

- **Younes Jaaidi, "Ashes to Ashes, Spec to Spec"** (React Summit 2026) — the
  best real-world version of Example 7. Someone added a `height` to a shared
  design-system card; the product image ended up covering the add-to-cart
  button; the unit test kept passing because the click landed on the image.
  *"whenever it tries to click on the add button, it's actually clicking on the
  picture of the salad."*
- **Matan Borenkraout** (TestJS Summit 2023) — a Testing Library maintainer on
  why that is structurally invisible: *"there's no layout, meaning all of the
  components are sitting one on top of the other."*
- **Artem Zakharchenko, [Why I Won't Use JSDOM](https://www.epicweb.dev/why-i-won-t-use-jsdom)**
  — the realm argument behind Example 10.
- **Jessica Sachs** (JSNation US 2024) — the honest counterweight, from someone
  who led Cypress Component Testing: real browsers lost the first time for good
  reasons. *"The stability in Jest and other node based runners far outweighed
  the benefit of working in your own browser environment."*

One argument to **avoid**: that jsdom is unmaintained. It was fair in 2022 (24
commits that year) and is not fair now — 152 commits in 2025 and 156 in the first
eight months of 2026, shipping v28 through v30. The layout argument does not need
it.
