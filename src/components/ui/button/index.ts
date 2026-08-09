import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Button } from './Button.vue'

/**
 * The base answers a press. Tailwind v4 gates every `hover:` behind
 * `@media (hover: hover)`, so the variants below fire on a mouse and on
 * nothing else — without an `active:` a phone tap produces no feedback at
 * all. Three details are load-bearing and easy to undo by accident:
 *
 * - The transition list names `scale`, not `transform`. Tailwind v4 compiles
 *   `scale-*` to the standalone `scale` property, so a list ending in
 *   `transform` would leave the press un-eased while still looking correct
 *   in the source.
 * - `touch-manipulation` drops the ~300 ms double-tap-zoom wait.
 * - `select-none` stops a long-press turning a button label into a selection.
 *
 * Sizes are written touch-first and collapse under `pointer-fine:`, so the
 * 44px floor is the default and shrinking is the exception. Graded by the
 * `touch` tier, which is the only one with a coarse pointer.
 * docs/touch-conventions.md
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium select-none touch-manipulation transition-[color,background-color,box-shadow,scale] duration-100 active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
      },
      size: {
        default: 'h-touch-target px-4 py-2 pointer-fine:h-10',
        // `sm` still clears the 44px floor on a coarse pointer — it is a
        // *visually* smaller button, not a smaller hit area, and it is used
        // for real taps (History's delete, both PWA prompts). On touch it
        // differs from `default` by horizontal padding only; the height
        // difference reasserts itself on a fine pointer.
        sm: 'h-touch-target rounded-md px-3 pointer-fine:h-9',
        lg: 'h-12 rounded-md px-6 pointer-fine:h-11',
        icon: 'size-touch-target pointer-fine:size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
