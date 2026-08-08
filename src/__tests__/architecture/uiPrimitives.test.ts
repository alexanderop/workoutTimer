/**
 * The shape rules for `src/components/ui/*`, which ESLint cannot express.
 *
 * eslint.config.ts already guards the *imports* around the UI layer — reka-ui
 * and cva stay inside it, app code enters through a barrel. What it cannot
 * see is whether a primitive is actually written in the shadcn style once you
 * are inside the file: whether it exposes the four levers a consumer needs
 * (structure, style, state, element) or quietly grows into a component
 * configured by flags.
 *
 * These checks are deliberately text-level rather than a full parse. They are
 * a tripwire for the conventions in docs/ui-components.md, not a type
 * checker, and every helper below is exercised against a synthetic violation
 * as well as the real tree — a rule that only ever sees passing input is not
 * a rule.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const UI_DIR = fileURLToPath(new URL('../../components/ui/', import.meta.url))

/** At most this many configuration props beyond `class` before it is sprawl. */
const MAX_CONFIG_PROPS = 3

interface Primitive {
  /** e.g. `dialog/DialogContent.vue` */
  id: string
  directory: string
  file: string
  source: string
}

function readPrimitives(): Primitive[] {
  return readdirSync(UI_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((directory) =>
      readdirSync(join(UI_DIR, directory.name), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.vue'))
        .map((entry) => ({
          id: `${directory.name}/${entry.name}`,
          directory: directory.name,
          file: entry.name,
          source: readFileSync(join(UI_DIR, directory.name, entry.name), 'utf8'),
        })),
    )
}

const PRIMITIVES = readPrimitives()
const DIRECTORIES = readdirSync(UI_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

// --- text helpers, exercised against synthetic input further down ----------

/** The balanced `<...>` argument of `callee<...>`, or undefined. */
function genericArgument(source: string, callee: string): string | undefined {
  const start = source.indexOf(`${callee}<`)
  if (start === -1) return undefined

  let depth = 0
  for (let index = start + callee.length; index < source.length; index += 1) {
    const character = source[index]
    if (character === '<') depth += 1
    else if (character === '>') {
      depth -= 1
      if (depth === 0) return source.slice(start + callee.length + 1, index)
    }
  }
  return undefined
}

/** Property names declared in a type body — one per `name?: type` member. */
function memberNames(typeBody: string): string[] {
  return typeBody
    .split(/[\n;]/)
    .map((line) => /^\s*(\w+)\??\s*:/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
}

/** Members of every `{ ... }` literal inside a type expression. */
function objectLiteralMembers(typeText: string): string[] {
  const names: string[] = []
  let depth = 0
  let body = ''

  for (const character of typeText) {
    if (character === '{') {
      depth += 1
      if (depth === 1) continue
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        names.push(...memberNames(body))
        body = ''
        continue
      }
    }
    if (depth >= 1) body += character
  }
  return names
}

/** The balanced body of a locally declared `interface <name> ... { ... }`. */
function interfaceBody(source: string, name: string): string | undefined {
  const declaration = new RegExp(`interface\\s+${name}\\b`).exec(source)
  if (!declaration) return undefined

  const open = source.indexOf('{', declaration.index)
  if (open === -1) return undefined

  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  return undefined
}

/**
 * Props the component declares itself. Props inherited from a reka-ui type
 * (`DialogContentProps & { … }`) are forwarding, not surface of our own, so
 * they are deliberately not counted.
 */
export function localPropNames(source: string): string[] {
  const generic = genericArgument(source, 'defineProps')
  if (generic === undefined) return []

  const names = objectLiteralMembers(generic)

  // `defineProps<Props>()` with the interface declared in the same file.
  const identifier = generic.trim()
  if (/^[A-Za-z_$][\w$]*$/.test(identifier)) {
    const body = interfaceBody(source, identifier)
    if (body !== undefined) names.push(...memberNames(body))
  }
  return names
}

const hasDataSlot = (source: string): boolean => source.includes('data-slot=')
const mergesWithCn = (source: string): boolean => source.includes('cn(')
const declaresClassProp = (source: string): boolean => /\bclass\?\s*:/.test(source)

/** Does the template paint anything of its own? */
function setsOwnClasses(source: string): boolean {
  const template = source.slice(source.indexOf('<template>'))
  return /:class=|\sclass="[^"]/.test(template)
}

/**
 * A primitive that paints must let the consumer repaint: styling with no
 * `class` prop locks the call site out of the STYLE lever entirely, and a
 * `class` prop that never reaches `cn()` is either dropped or left to fight
 * the defaults on stylesheet order. A part that paints nothing needs
 * neither — plain attribute fallthrough already merges `class` for it.
 */
export function stylingIsOverridable(source: string): boolean {
  if (!setsOwnClasses(source)) return true
  return declaresClassProp(source) && mergesWithCn(source)
}

// --- the rules ------------------------------------------------------------

describe('the UI layer is a set of primitives', () => {
  it('finds primitives to check', () => {
    expect(PRIMITIVES.length).toBeGreaterThan(0)
  })

  it.each(DIRECTORIES)('%s has a barrel', (directory) => {
    const entries = readdirSync(join(UI_DIR, directory)).filter((name) => name !== '.DS_Store')
    expect(entries, `src/components/ui/${directory} needs an index.ts`).toContain('index.ts')
  })

  it.each(PRIMITIVES.map((primitive) => [primitive.id, primitive] as const))(
    '%s is exported from its barrel',
    (_id, primitive) => {
      const barrel = readFileSync(join(UI_DIR, primitive.directory, 'index.ts'), 'utf8')
      expect(
        barrel,
        `add "export { default as … } from './${primitive.file}'" to src/components/ui/${primitive.directory}/index.ts — the barrel is the only door into a primitive`,
      ).toContain(`./${primitive.file}`)
    },
  )
})

describe('STATE — every part is addressable', () => {
  it.each(PRIMITIVES.map((primitive) => [primitive.id, primitive] as const))(
    '%s carries a data-slot',
    (_id, primitive) => {
      expect(
        hasDataSlot(primitive.source),
        `${primitive.id} renders without a data-slot attribute. It is the stable identity a parent layout targets — utility classes are not.`,
      ).toBe(true)
    },
  )
})

describe('STYLE — defaults are overridable', () => {
  it.each(PRIMITIVES.map((primitive) => [primitive.id, primitive] as const))(
    '%s merges its own classes with the consumer’s',
    (_id, primitive) => {
      expect(
        stylingIsOverridable(primitive.source),
        `${primitive.id} styles itself without accepting a class prop and merging it through cn(defaults, props.class). The call site cannot override a single utility. docs/ui-components.md`,
      ).toBe(true)
    },
  )

  it.each(PRIMITIVES.map((primitive) => [primitive.id, primitive] as const))(
    '%s does not accept a class prop it ignores',
    (_id, primitive) => {
      if (!declaresClassProp(primitive.source)) return
      expect(
        mergesWithCn(primitive.source),
        `${primitive.id} declares a class prop but never passes it through cn()`,
      ).toBe(true)
    },
  )
})

describe('STRUCTURE — variants come from the tree, not from flags', () => {
  it.each(PRIMITIVES.map((primitive) => [primitive.id, primitive] as const))(
    '%s does not configure itself with a wall of props',
    (_id, primitive) => {
      const configProps = localPropNames(primitive.source).filter((name) => name !== 'class')

      expect(
        configProps.length,
        `${primitive.id} declares ${configProps.length} props of its own (${configProps.join(', ')}). Past ${MAX_CONFIG_PROPS}, a primitive is being configured rather than composed — split the parts the flags were switching between into their own components. docs/ui-components.md`,
      ).toBeLessThanOrEqual(MAX_CONFIG_PROPS)
    },
  )
})

// --- the rules catch what they claim to catch -----------------------------

describe('the checks reject a primitive written the wrong way', () => {
  const sprawl = `
<script setup lang="ts">
const props = withDefaults(defineProps<{
  mode?: 'confirm' | 'edit'
  title: string
  showHeader?: boolean
  showFooter?: boolean
  class?: HTMLAttributes['class']
}>(), { showHeader: true })
</script>
`

  it('counts the props a component declares itself', () => {
    expect(localPropNames(sprawl)).toEqual(['mode', 'title', 'showHeader', 'showFooter', 'class'])
  })

  it('does not count props forwarded from a reka-ui type', () => {
    const forwarding = `const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>()`
    expect(localPropNames(forwarding)).toEqual(['class'])
  })

  it('reads props declared as a local interface', () => {
    const withInterface = `
interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
}
const props = withDefaults(defineProps<Props>(), { as: 'button' })
`
    expect(localPropNames(withInterface)).toEqual(['variant', 'size', 'class'])
  })

  it('rejects styling that the consumer cannot override', () => {
    const locked = `<template><div data-slot="thing" class="flex gap-2"><slot /></div></template>`
    expect(stylingIsOverridable(locked)).toBe(false)
  })

  it('rejects a class prop that never reaches the element', () => {
    const dropped = `
const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>
<template><div data-slot="thing" class="flex gap-2"><slot /></div></template>`
    expect(stylingIsOverridable(dropped)).toBe(false)
  })

  it('accepts a part that paints nothing and relies on attribute fallthrough', () => {
    const passthrough = `<template><DialogTrigger data-slot="dialog-trigger" v-bind="props"><slot /></DialogTrigger></template>`
    expect(stylingIsOverridable(passthrough)).toBe(true)
  })

  it('rejects a part with no data-slot', () => {
    expect(hasDataSlot(`<template><div><slot /></div></template>`)).toBe(false)
  })
})
