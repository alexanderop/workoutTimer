---
type: Convention
title: Touch conventions
description: The five reflexes that make this app feel native on a phone — press feedback, touch-first sizing, suppressed document behavior, clamped environment values, and never drawing an unwired affordance.
tags: [ui, mobile, touch, tailwind, safe-area, accessibility]
status: stable
---

# Touch conventions

[The index](index.md) says the app shell, safe-area handling, and keyboard-aware sheets **are the product**. This page holds the rules that make that true on hardware, and the reasoning behind each — because every one of them was, at some point, absent in a way no test tier could see.

That last part is the real lesson. All three of the browser tiers this project used to run launch a stock desktop Chromium, where `hover: hover` and `pointer: fine` match. A mobile-first app had **no tier that experienced it the way its users do**, so a whole class of defect could ship and persist. The [`touch` tier](testing-strategy.md) exists to close that, and each rule below names what enforces it.

## 1. Press feedback before completion feedback

**A control answers the finger on `pointerdown`, not on release.**

Tailwind v4 correctly gates every `hover:` behind `@media (hover: hover)`. On a phone those styles never fire at all — so a button whose only feedback is `hover:bg-accent` answers a tap with *nothing*, for the entire duration of the tap. The user's model is "did that register?", and the app's answer arrives only when the work is done.

```text
✗  transition-colors hover:bg-accent
✓  transition-[color,background-color,scale] duration-100 hover:bg-accent active:scale-[0.97]
```

Two details that are easy to get wrong:

- **Name `scale`, not `transform`.** Tailwind v4 compiles `scale-*` to the standalone `scale` property. A transition list ending in `transform` covers nothing, and the mistake is invisible in the source — the press still happens, just instantly. `transition-transform` is fine, because v4 expands it to `transform, translate, scale, rotate`.
- **`touch-manipulation` on the tap target itself**, not on an inner span. It drops the ~300 ms double-tap-zoom wait, and the outer element is what receives the tap.

Enforced by `C7` in `src/__tests__/architecture/touchConventions.test.ts`: a plain element carrying `@click` or `type="button"` whose classes contain a `hover:` and no `active:` fails the build. Deliberately narrow — it catches a new control that ships mouse-only rather than grading every div, and components are out of scope because `<Button>` carries the press in its `cva` base.

**Why this is a static rule and not a spec.** `:active` is UA-driven and cannot be dispatched; `userEvent` has `click`, `dblClick` and `hover` but no pointer-hold. That is the practical reason. The better reason: asserting that `active:scale-[0.97]` visibly scales an element is testing Chromium, not testing us. What can actually rot is *coverage* — the next button someone adds — and coverage is exactly what a static rule sees.

## 2. Touch-first sizing, collapsed for a fine pointer

**The 44px floor is the default; shrinking is the exception.**

```text
✗  default: 'h-10 px-4 py-2'
✓  default: 'h-touch-target px-4 py-2 pointer-fine:h-10'
```

`pointer-fine:` compiles natively in Tailwind 4.3 to `@media (pointer: fine)` — no config, no `@custom-variant`. Writing it this way means a size that someone forgets to think about is *safe* rather than 40px, which is the opposite of the default you get from writing desktop-first and adding a breakpoint.

`sm` clears the floor too. It is a visually smaller button, not a smaller hit area — on touch it differs from `default` by horizontal padding only, and the height difference reasserts itself on a fine pointer. If you ever need a genuinely denser target, expand the hit area with padding or a pseudo-element rather than shrinking the box.

Graded by `src/__tests__/touch/touchTargets.spec.ts`, which is the only tier that can see it. **The a11y tier does not cover this**: axe's `target-size` rule uses the WCAG 2.2 AA floor of 24×24, while ours is the 44px HIG one — a 40px button satisfies axe and fails us.

## 3. Suppress document behavior, then grant it back

**App chrome is not a document.** Rows, tab labels and stat readouts are controls, not quotable text, and letting them be selected intercepts the long-press a native app spends on a context menu. `body` therefore carries `user-select: none` and `-webkit-touch-callout: none` (without the second, long-pressing a link still raises the iOS action sheet over the UI).

> **Ship both halves in one commit, always.** Global `user-select: none` without the `input, textarea, [contenteditable]` exemption makes iOS refuse caret placement inside fields. The failure presents as a **broken keyboard**, not as a CSS bug, and it reproduces on no desktop browser and in no tier we run.

Whatever renders user-authored prose opts back in with `select-text` — today that is the workout and result notes in `SessionDetailView.vue`. If you add a screen that displays text the user wrote, it gets `select-text`.

Graded behaviorally by `src/__tests__/components/textSelection.spec.ts`: a double-click selects a word, and under `user-select: none` it selects nothing, so all three assertions are observable. Two of them pass before the change as well as after — they earn their place by going red on the *plausible wrong implementation*, which is the iOS caret bug above.

## 4. Clamp every environment value

**`env()` is 0 far more often than it is not.** Every safe-area inset resolves to 0 on flat-bottomed hardware, on every desktop browser, and in every headless Chromium — which is to say, in every place anyone actually looks at the UI. A bare `env()` ships a layout that has only ever been seen on the one device nobody checks.

```css
✗  padding-bottom: env(safe-area-inset-bottom);
✓  padding-bottom: max(var(--safe-bottom-min, 0px), env(safe-area-inset-bottom));
```

The three utilities in `src/style.css` — `safe-area-bottom`, `safe-area-top`, `safe-area-x` — are the only place an inset may be read. Enforced by `C6`.

Two corollaries:

- **The utility owns the property outright.** `class="pb-6 safe-area-bottom"` puts two equal-specificity declarations of `padding-bottom` on one element, and the winner is then decided by generated-stylesheet order rather than by the order they were authored. That is not a latent risk — it is how every bottom sheet in this app shipped with zero bottom padding. Pass the floor instead: `safe-area-bottom [--safe-bottom-min:1.5rem]`.
- **Insets go on the shell root, not on the scroll container.** A sticky element's constraint rectangle is the *scrollport* — the scroll container's padding box — so `padding-top` on `<main>` would not push `PageHeader`'s `sticky top-0` down; the header would stick flush to the top of `<main>` and slide under the status bar. One declaration on the `AppShell` root is correct with or without a sticky header and cannot be double-paid. The exception is `meta: { hideNav: true }`, where no nav renders to pay the bottom inset, so `<main>` takes it.

`index.html` sets `viewport-fit=cover`, which is a request for the full display **and** the responsibility for it. Adding `apple-mobile-web-app-status-bar-style: black-translucent` is what buys the modern full-bleed look — and is only safe now that the top inset is paid. Shipping it before that would have put every header under the clock.

## 5. Never draw an affordance you have not wired

An unhonored affordance is worse than no affordance: the user tries it, gets nothing, and stops trusting the rest of the screen.

`DialogContent`'s grabber pill is currently **a visual grip, not a gesture** — a decorative `<div>` with no pointer handlers. That is a deliberate, documented state, and the comment beside it says so rather than promising a swipe. Wiring it for real means migrating to `reka-ui`'s `Drawer` (`DrawerRoot`, `DrawerHandle`, `DrawerSwipeArea`, snap points, velocity dismissal — all already in `node_modules`), which is an API migration rather than a CSS change. Keep `keyboardInsetEffectAtom` when that happens: feeding `--keyboard-inset` into the drawer's max-height is better than what the reference implementations do, and it is ours.

## Reduced motion is global, not opt-in

The app ships sheet keyframes and a press transform on every button and tab. A user who has asked the OS for less motion has asked for both. The guard in `src/style.css` is scoped to `*` on purpose — an opt-in list is a list that the next animation someone adds is not on. Durations rather than `none`, so `transitionend`/`animationend` still fire and nothing waiting on them hangs.

Presence is checked by `C8`. It is deliberately only a presence check: a behavioral version needs `contextOptions: { reducedMotion: 'reduce' }`, i.e. a *second* new browser project, and folding it into `touch` would conflate two conditions so a failure could not say which one it was. Documented upgrade path, not a silent omission.

## What no tier can tell you

Three things in here are unverifiable in CI by construction, so they are checked by hand per [agent-browser.md](agent-browser.md) before calling work in this area done:

1. `env()` is 0 in every headless Chromium, so the insets are only observable on a real device profile.
2. Overscroll *chaining* needs a real gesture; the spec checks the property, not the behavior.
3. The iOS caret bug reproduces on no desktop browser at all — and it is the one that will not fail loudly. Check it explicitly: tap into a text field and confirm a caret appears.
