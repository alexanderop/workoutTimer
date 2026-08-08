---
type: Convention
title: UI components
description: How this starter writes shadcn-vue-style primitives on top of reka-ui — the four levers every primitive gives its consumer, and the rules that keep them open.
tags: [ui, components, reka-ui, shadcn, composition, tailwind]
status: stable
sources:
  - resource: https://github.com/unovue/shadcn-vue
    id: shadcn-vue
    title: unovue/shadcn-vue — the pattern this layer copies
  - resource: https://reka-ui.com/
    id: reka-ui
    title: Reka UI — the headless behaviour underneath
---

# UI components

`src/components/ui/*` holds this app's design system: our components, our
markup, our classes, wrapping [Reka UI](https://reka-ui.com/)'s headless
behaviour. They are written in the style [shadcn-vue](https://www.shadcn-vue.com/)
established, but shadcn-vue is **not a dependency** — the pattern is copied,
not installed.

That is the point of shadcn-vue rather than an oversight: the components are
meant to be owned. A dialog that needs to become a keyboard-aware bottom sheet
on phones is an edit to a file in this repo, not a fight with a package's
props. What we take from upstream is the *shape* of the files, which is what
the rest of this document describes.

## What each layer owns

| Layer | Owns | Never |
| --- | --- | --- |
| Reka UI | Focus traps, ARIA wiring, escape/outside-click, `data-state`, portals | Renders no styling of its own |
| `src/components/ui/*` | Markup, Tailwind classes, `data-slot`, variants | Reads the database, stores, or a feature |
| Features and views | Composition — which parts, in what tree, with what data | Imports `reka-ui` or `class-variance-authority` |

The layer boundary is enforced, not just described. See [Enforcement](#enforcement).

## The four levers

Every primitive hands the call site four independent ways to bend it. A
primitive that closes one of them has to be edited to serve the next variant,
which is how a design system rots into flags.

### STRUCTURE — the tree is the variant

A compound primitive is a set of small parts sharing state through a
provider, not one component that renders every arrangement it might be asked
for. The consumer assembles the parts; the arrangement *is* the variant.

```vue
<Dialog v-model:open="open">
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{{ t('notes.form.heading') }}</DialogTitle>
      <DialogDescription>{{ t('notes.form.description') }}</DialogDescription>
    </DialogHeader>
    <form @submit.prevent="save">
      <!-- the form lives here, so v-model binds to the consumer's state -->
    </form>
    <DialogFooter>
      <DialogClose>{{ t('common.buttons.cancel') }}</DialogClose>
      <Button type="submit">{{ t('common.buttons.save') }}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

A share dialog with no description drops `<DialogDescription>`. A confirm
dialog swaps the form for a paragraph. Nothing inside the primitive branches
on a flag, and no state has to be plumbed back out through
`update:someFieldTheDialogOwns` events, because the fields were never inside
the dialog to begin with.

State lives in the provider (`Dialog`), not in the layout, which is why
`<DialogClose>` works wherever the consumer puts it — in the footer, pinned to
a corner, or outside `<DialogContent>` entirely.

### STYLE — `cn()` merges, it does not concatenate

Every primitive that paints anything accepts `class` and merges it *after*
its own defaults:

```vue
<div :class="cn('flex flex-col gap-2 text-center sm:text-left', props.class)">
```

`cn()` (`src/lib/utils.ts`) is `clsx` followed by `tailwind-merge`.
`tailwind-merge` resolves conflicting utilities so the last one wins, which is
what makes `<DialogContent class="sm:max-w-2xl">` beat the primitive's
`sm:max-w-lg` without a specificity fight or a `!important`. Ordinary string
concatenation would leave both classes on the element and hand the decision to
stylesheet order.

Two consequences worth internalising:

- **`class` is consumed, never forwarded.** When a primitive wraps a reka
  part, `class` is stripped from the props before they are forwarded —
  `reactiveOmit(props, 'class')` — and applied through `cn()` instead.
  Forwarding it would set it verbatim and drop the defaults.
- **A part that paints nothing needs no `class` prop.** `DialogTrigger` sets
  no classes, so Vue's attribute fallthrough already merges whatever the
  consumer passes. Adding the prop there would be ceremony.

### STATE — `data-*` is the public contract

Reka writes lifecycle state to the DOM (`data-state="open" | "closed"`,
`data-disabled`, `data-orientation`), and primitives add `data-slot` to name
each part. Both are stylable from the call site with Tailwind's `data-[…]:`
variants:

```vue
<DialogContent class="data-[state=open]:duration-300" />
```

```css
/* a parent can target a part without knowing its utilities */
.prose [data-slot='dialog-footer'] { gap: 0.75rem; }
```

Attributes rather than classes, because `class` belongs to the consumer (see
STYLE) and because a utility list is refactored while `data-state="open"`
survives. **Every primitive carries a `data-slot`** — the architecture tier
fails the build if one does not.

### ELEMENT — `as-child` swaps the tag

`as-child` hands the primitive's behaviour to the consumer's own element
instead of rendering its own:

```vue
<DialogTrigger as-child>
  <RouterLink to="/profile">Open profile</RouterLink>
</DialogTrigger>
```

Reka's `Primitive` implements the cloning; a primitive gets it for free by
forwarding `PrimitiveProps` (`Button` does this via `:as` / `:as-child`) or by
forwarding a reka part's props wholesale.

## Anatomy of a primitive

The wrapping form, from `src/components/ui/dialog/DialogTitle.vue`:

```vue
<script setup lang="ts">
import type { DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { DialogTitle, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')   // class is ours to merge
const forwarded = useForwardProps(delegatedProps)     // everything else is reka's
</script>

<template>
  <DialogTitle
    data-slot="dialog-title"
    v-bind="forwarded"
    :class="cn('text-lg leading-none font-semibold', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
```

Five moves, in every file:

1. Accept the reka part's props **plus** `class`.
2. `reactiveOmit` `class` out of what gets forwarded.
3. `useForwardProps` / `useForwardPropsEmits` to pass the rest through.
4. `data-slot` naming this part.
5. `cn(defaults, props.class)`.

A part that renders a plain element instead of wrapping reka (`DialogHeader`,
`DialogFooter`) skips steps 1–3 and keeps 4 and 5.

Variants — genuinely stylistic axes like `variant` and `size` — go in the
barrel as a `cva()` table, not as `v-if` branches. `src/components/ui/button/index.ts`
is the worked example.

## Enforcement

Two layers, matching how the db and feature boundaries are enforced.

**ESLint** (`eslint.config.ts`, the `no-restricted-imports` boundaries) covers
imports, including in `.vue` files:

- `reka-ui` and `class-variance-authority` may only be imported inside
  `src/components/ui/**`.
- App code imports a primitive from its barrel (`@/components/ui/dialog`),
  never from the file inside it.
- A primitive may not import `@/db`, `@/stores/*`, or any feature — primitives
  stay presentational.
- `shadcn-vue` and `radix-vue` are banned everywhere: we copy the pattern
  rather than depend on it.

**The architecture tier** (`src/__tests__/architecture/uiPrimitives.test.ts`)
covers file shape, which ESLint cannot see:

- every primitive directory has an `index.ts`, and every `.vue` in it is
  exported from that barrel;
- every primitive carries a `data-slot`;
- a primitive that sets classes accepts `class` and merges it through `cn()`,
  and a primitive that accepts `class` actually uses it;
- a primitive declares **at most three configuration props beyond `class`**.

That last one is the flag-sprawl tripwire. Props forwarded from a reka type
(`DialogContentProps & { … }`) are not counted — only the ones the component
invents.

Both suites also assert the rules reject deliberate violations
(`boundaries.test.ts`, and the closing block of `uiPrimitives.test.ts`); a rule
that has only ever seen passing input is not a rule.

## Adding a primitive

1. **Check Reka has it.** `~/Projects/opensource/reka-ui` is the checked-out
   source; `packages/core/src/<Name>/` holds the parts and their prop types.
   If Reka has no headless version, write the behaviour yourself in the same
   shape — provider component plus small parts.
2. **Read the upstream file.** `~/Projects/opensource/shadcn-vue` at
   `apps/v4/registry/new-york-v4/ui/<name>/` is the reference implementation.
   Copy its structure; do not copy its classes blindly — this app has its own
   tokens (`--spacing-touch-target`, `--text-section-title`) in `src/style.css`.
3. **One directory per primitive**, one file per part, plus `index.ts`.
   Filenames are `PascalCase.vue` and match the exported name.
4. **Wire the five moves** above into each part.
5. **Export from the barrel.** Do not re-export raw reka parts from it — wrap
   them, so every part carries a `data-slot` and the lint rule stays total.
6. **Run `pnpm check`.** The arch tier will tell you which of the rules above
   you missed, by name.

Primitives are not unit-tested on their own: they have no logic to test. What
gets a test is behaviour the primitive *adds* — `dialogContent.spec.ts` covers
the scroll region surviving a keyboard-shrunk viewport, in the browser tier.
See [testing-strategy.md](testing-strategy.md).

## Composition over configuration

The diagnostic, when a prop is tempting: **does it change *what* renders, or
*how*?**

- *How* props are fine: `variant`, `size`, `class`. They select a style for a
  fixed tree.
- *What* props are the smell: `mode`, `showHeader`, `hasFooter`,
  `headerCentered`. Each one moves a decision that belongs at the call site
  into a branch inside the component, and they compound — the next variant
  needs one more, and the tree that renders is now spread across a dozen
  conditionals.

When you catch one, lift it: the thing the flag was switching between becomes
a component the consumer places, or omits, itself.

### The convenience layer

Eventually someone wants `<ConfirmDialog title="…" description="…" />` instead
of eight tags. Build it **on top of** the primitives, as a separate component
in `src/components/` or inside the feature that needs it — never as flags
added to the primitive:

```vue
<!-- ConfirmDialog.vue — a consumer of the primitives, not an extension -->
<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
      </DialogHeader>
      <DialogFooter>
        <DialogClose>{{ cancelLabel }}</DialogClose>
        <Button :variant="destructive ? 'destructive' : 'default'" @click="confirm">
          {{ confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

The next non-standard variant drops back down to the primitives without anyone
touching `ConfirmDialog`. This is the rule that stops the compound API
collapsing back into a flag-configured monolith over time.

### When not to reach for it

A primitive with one shape and no state does not need a provider and parts.
`<Input>`, `<Label>`, `<Textarea>` are single components on purpose. Build the
compound version when a real second variant exists — not in anticipation of
one.

## Where this codebase deviates from upstream shadcn-vue

Deliberate, and worth knowing before "fixing" them to match a copy-pasted
upstream file:

- **`DialogContent` is a bottom sheet on phones.** Mobile-first is the
  product, so there is one content component, not a desktop dialog plus a
  separate drawer. It mounts its own `DialogPortal` and `DialogOverlay` —
  forgetting the overlay is a silent accessibility regression, not a visible
  one — and it is keyboard-aware via `--keyboard-inset` (see
  `useKeyboardInset`).
- **`defineModel` for state a component owns; forwarding for state a reka
  part owns.** Upstream uses `useVModel` from VueUse for Vue 3.3 compatibility;
  this project pins 3.5 and uses `defineModel` (see [the index](index.md)). But `Switch`
  forwards `modelValue` to `SwitchRoot` rather than declaring `defineModel`,
  because reka already implements that model — two owners of one value drift.
- **Strings come from i18n.** Upstream hard-codes `"Close"`; this project
  requires every user-facing string in `src/i18n/messages/*`, so
  `DialogContent` uses `useI18n()`.
- **Touch-target sizing.** Sizes resolve `--spacing-touch-target` rather than
  upstream's tighter desktop heights.

## Reading the real source

Both reference trees are cloned and announced to every session (see
**References** in [the index](index.md)) — read them instead of recalling an API:

- `~/Projects/opensource/reka-ui` — `packages/core/src/<Name>/` for what a
  part accepts, emits, and writes to the DOM.
- `~/Projects/opensource/shadcn-vue` — `apps/v4/registry/new-york-v4/ui/` for
  the canonical file shape.
