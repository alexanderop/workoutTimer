/**
 * Static tripwires for the conventions in docs/touch-conventions.md.
 *
 * These are **tripwires, not behavioral tests**, and the distinction is the
 * point. The batch they came from produced three kinds of outcome:
 *
 * 1. measurable in a browser we run  → a spec in `default`
 * 2. only true under a device condition → a spec in `touch`
 * 3. invisible to every tier we can afford → a rule here, labelled as one
 *
 * Nothing below claims to prove a mechanism works. What each one catches is
 * *coverage* — the next control that ships mouse-only, the next raw `env()`.
 * That is what actually rots, and it is exactly what a static rule can see.
 *
 * House rules inherited from uiPrimitives.test.ts: text-level checks rather
 * than a full parse, and every helper is exercised against a synthetic
 * violation as well as against the real tree — a rule that only ever sees
 * passing input is not a rule.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url))
const STYLESHEET = join(SRC_DIR, 'style.css')

const SCANNED_EXTENSIONS = new Set(['.css', '.vue', '.ts'])

interface SourceFile {
  /** Repository-relative, e.g. `src/components/AppShell.vue`. */
  id: string
  path: string
  source: string
}

function readSourceFiles(directory: string): SourceFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      // __tests__ is not shipped UI; its fixtures deliberately contain
      // violations, and scanning them would make every rule self-defeating.
      return entry.name === '__tests__' ? [] : readSourceFiles(path)
    }
    if (!entry.isFile() || !SCANNED_EXTENSIONS.has(extname(entry.name))) return []
    return [{ id: `src/${relative(SRC_DIR, path)}`, path, source: readFileSync(path, 'utf8') }]
  })
}

const SOURCE_FILES = readSourceFiles(SRC_DIR)

// --- C6: environment values are clamped, never raw ------------------------

/** The utilities allowed to read an inset directly. */
const INSET_UTILITIES = ['safe-area-bottom', 'safe-area-top', 'safe-area-x']

const RAW_INSET = /env\(\s*safe-area-inset-(top|right|bottom|left)/g

/**
 * `@utility <name> { … }` bodies, by name. Balanced-brace scan rather than a
 * regex, so a nested block inside a utility cannot end it early.
 */
export function utilityBodies(css: string): Map<string, string> {
  const bodies = new Map<string, string>()
  const declaration = /@utility\s+([\w-]+)\s*\{/g

  let match: RegExpExecArray | null
  while ((match = declaration.exec(css)) !== null) {
    const open = match.index + match[0].length - 1
    let depth = 0
    for (let index = open; index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      else if (css[index] === '}') {
        depth -= 1
        if (depth === 0) {
          // SAFETY: the pattern this `match` comes from has one capture
          // group, and a match of it always captured.
          bodies.set(match[1] as string, css.slice(open + 1, index))
          break
        }
      }
    }
  }
  return bodies
}

/** Character ranges covered by the allowed utilities' bodies. */
function allowedRanges(css: string): Array<[number, number]> {
  const bodies = utilityBodies(css)

  return INSET_UTILITIES.flatMap((name): Array<[number, number]> => {
    const body = bodies.get(name)
    if (body === undefined) return []
    const start = css.indexOf(body)
    return [[start, start + body.length]]
  })
}

export function rawInsetUses(source: string, isStylesheet: boolean): string[] {
  const allowed = isStylesheet ? allowedRanges(source) : []

  return [...source.matchAll(RAW_INSET)]
    .filter(({ index }) => !allowed.some(([start, end]) => index >= start && index < end))
    .map((match) => match[0])
}

// --- C7: a control that answers a mouse answers a finger too --------------

/**
 * Opening tags of plain HTML elements (lowercase) that take a click or are
 * declared a button. Components are deliberately out of scope: `<Button>`
 * carries press feedback in its cva base, and re-asserting that at every call
 * site would grade composition rather than the control.
 */
function interactiveElementTags(source: string): string[] {
  const template = source.slice(source.indexOf('<template>'))
  return [...template.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)]
    .map((match) => match[0])
    .filter((tag) => /@click|v-on:click|type="button"/.test(tag))
}

/** Every class string on a tag — static `class="…"` and bound `:class="…"`. */
function classStrings(tag: string): string {
  return [...tag.matchAll(/:?class="([^"]*)"/g)].map((match) => match[1]).join(' ')
}

/**
 * Controls whose only feedback is a `hover:`. Tailwind v4 gates every `hover:`
 * behind `@media (hover: hover)`, so on a phone such a control answers a tap
 * with nothing at all.
 */
export function hoverOnlyControls(source: string): string[] {
  return interactiveElementTags(source)
    .map(classStrings)
    .filter((classes) => classes.includes('hover:') && !classes.includes('active:'))
}

/**
 * Reasons, not just paths — an allowlist without one becomes a place to put
 * things. Same shape as `A11Y_SKIPPED`.
 */
const HOVER_ONLY_ALLOWED: Record<string, string> = {}

// --- C9: sized by the viewport, not by the browser's claim about it -------

/**
 * `dvh`/`svh`/`lvh` (and their `vw` siblings) are the browser's *claim* about
 * the viewport, and Android Chrome in an installed PWA can include the
 * status-bar and gesture-bar bands in that claim while the window excludes
 * them. An `h-dvh` shell then outgrows the screen by roughly the tab bar's
 * height — which is exactly how the bottom navigation once vanished on
 * hardware while every CI browser rendered it perfectly. The height:100%
 * chain (html/body/#app) resolves to the viewport the document actually got;
 * fixed-position elements get the same truth from a bare percentage.
 *
 * Comments are stripped first so prose *about* the units (the comments that
 * explain this very rule) cannot trip the scan.
 */
const VIEWPORT_CLAIM_UNIT = /\d(?:d|s|l)v[hw]\b|-(?:d|s|l)v[hw]\b/g

function stripComments(source: string): string {
  return (
    source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // `[^:]` rather than `\s`: a line comment may start immediately after
      // code (`value();// h-dvh`), but `https://` must not read as one.
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  )
}

export function viewportClaimUses(source: string): string[] {
  return [...stripComments(source).matchAll(VIEWPORT_CLAIM_UNIT)].map((match) => match[0])
}

// --- the rules ------------------------------------------------------------

describe('C6 — environment values are clamped, never read raw', () => {
  it('finds files to check', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0)
  })

  it.each(SOURCE_FILES.map((file) => [file.id, file] as const))(
    '%s reads no inset outside the clamped utilities',
    (_id, file) => {
      const raw = rawInsetUses(file.source, file.path === STYLESHEET)

      expect(
        raw,
        `${file.id} reads ${raw.join(', ')} directly. Every inset resolves to 0 on flat-bottomed hardware and in every headless browser, so a bare env() ships a layout nobody has looked at. Use ${INSET_UTILITIES.join(' / ')}, which clamp to a floor. docs/touch-conventions.md`,
      ).toEqual([])
    },
  )

  it('declares all three clamped utilities', () => {
    const bodies = utilityBodies(readFileSync(STYLESHEET, 'utf8'))

    for (const name of INSET_UTILITIES) {
      expect(bodies.has(name), `src/style.css no longer declares @utility ${name}`).toBe(true)
    }
  })
})

describe('C7 — no control answers a mouse and not a finger', () => {
  it.each(SOURCE_FILES.filter((file) => file.id.endsWith('.vue')).map((f) => [f.id, f] as const))(
    '%s ships no hover-only control',
    (_id, file) => {
      if (file.id in HOVER_ONLY_ALLOWED) return

      const offenders = hoverOnlyControls(file.source)

      expect(
        offenders.length,
        `${file.id} has ${offenders.length} control(s) whose only feedback is a hover:. Tailwind v4 gates hover: behind @media (hover: hover), so on a phone these answer a tap with nothing. Add an active: state. docs/touch-conventions.md\n\n${offenders.join('\n\n')}`,
      ).toBe(0)
    },
  )
})

describe('C8 — the reduced-motion guard exists', () => {
  // A presence check, not a behavioral one. Asserting that motion is actually
  // suppressed needs `contextOptions: { reducedMotion: 'reduce' }`, i.e. a
  // second new browser project; folding it into the `touch` tier would
  // conflate two conditions so a failure could not say which one it was. Not
  // worth it for one assertion today — documented upgrade path, not a silent
  // omission.
  it('src/style.css carries a prefers-reduced-motion block', () => {
    expect(
      readFileSync(STYLESHEET, 'utf8'),
      'the app ships sheet keyframes and a press transform on every button and tab. A user who asked the OS for less motion asked for both.',
    ).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/)
  })
})

describe('C9 — sized by the viewport, not by the browser’s claim about it', () => {
  it.each(SOURCE_FILES.map((file) => [file.id, file] as const))(
    '%s sizes nothing with a dynamic-viewport unit',
    (_id, file) => {
      const uses = viewportClaimUses(file.source)

      expect(
        uses,
        `${file.id} sizes with ${uses.join(', ')}. dvh/svh/lvh are the browser's claim about the viewport, and installed PWAs on Android can be handed a claim that includes system-bar bands the window never gets — an h-dvh shell then pushes the tab bar below the visible screen. Size against the real viewport instead: the height:100% chain for in-flow elements, a bare percentage for fixed ones. docs/touch-conventions.md`,
      ).toEqual([])
    },
  )
})

// --- the rules catch what they claim to catch -----------------------------

describe('the checks reject the conventions written the wrong way', () => {
  const stylesheet = `
@utility safe-area-bottom {
  padding-bottom: max(var(--safe-bottom-min, 0px), env(safe-area-inset-bottom));
}

.hand-rolled {
  padding-top: env(safe-area-inset-top);
}
`

  it('allows an inset inside a clamped utility', () => {
    expect(rawInsetUses('@utility safe-area-top { top: env(safe-area-inset-top) }', true)).toEqual(
      [],
    )
  })

  it('rejects an inset read outside one', () => {
    expect(rawInsetUses(stylesheet, true)).toEqual(['env(safe-area-inset-top'])
  })

  it('rejects an inset in a component, where no utility can shelter it', () => {
    expect(rawInsetUses('<div class="pb-[env(safe-area-inset-bottom)]" />', false)).toEqual([
      'env(safe-area-inset-bottom',
    ])
  })

  it('does not end a utility body at a nested closing brace', () => {
    const nested = '@utility a { @media (x) { color: red } } .b { env(safe-area-inset-top) }'
    expect(utilityBodies(nested).get('a')).toContain('@media')
  })

  it('rejects a control whose only feedback is a hover', () => {
    const mouseOnly = `<template><button type="button" class="transition-colors hover:bg-accent">x</button></template>`
    expect(hoverOnlyControls(mouseOnly)).toHaveLength(1)
  })

  it('accepts the same control once it answers a press', () => {
    const answered = `<template><button type="button" class="hover:bg-accent active:scale-95">x</button></template>`
    expect(hoverOnlyControls(answered)).toHaveLength(0)
  })

  it('reads the active: out of a bound class as well as a static one', () => {
    const bound = `<template><div @click="go" class="hover:bg-accent" :class="on && 'active:scale-95'">x</div></template>`
    expect(hoverOnlyControls(bound)).toHaveLength(0)
  })

  it('ignores an element nothing can tap', () => {
    const decorative = `<template><span class="hover:bg-accent">x</span></template>`
    expect(hoverOnlyControls(decorative)).toHaveLength(0)
  })

  it('ignores a component, whose base owns the press', () => {
    const composed = `<template><Button class="hover:bg-white/10" @click="go">x</Button></template>`
    expect(hoverOnlyControls(composed)).toHaveLength(0)
  })

  it.each(['dvh', 'svh', 'lvh', 'dvw', 'svw', 'lvw'])(
    'rejects a %s-sized utility — h-dvh being the exact pre-fix shell',
    (unit) => {
      expect(viewportClaimUses(`<div class="flex h-${unit} flex-col" />`)).toEqual([`-${unit}`])
    },
  )

  it.each(['dvh', 'svh', 'lvh', 'dvw', 'svw', 'lvw'])(
    'rejects 100%s inside an arbitrary value and inside raw CSS',
    (unit) => {
      expect(viewportClaimUses(`'max-h-[calc(100${unit}-var(--keyboard-inset,0px))]'`)).toEqual([
        `0${unit}`,
      ])
      expect(viewportClaimUses(`.shell { min-height: 100${unit} }`)).toEqual([`0${unit}`])
    },
  )

  it('accepts the same shell sized by the height chain', () => {
    expect(viewportClaimUses('<div class="flex h-full min-h-full flex-col" />')).toEqual([])
  })

  it('does not read prose about the units as a violation', () => {
    const documented = `<!-- h-full, not h-dvh: 100dvh over-reports. -->\n<div class="h-full" /> /* was 100dvh */ // old h-dvh root`
    expect(viewportClaimUses(documented)).toEqual([])
  })

  it('strips a line comment that starts immediately after code', () => {
    expect(viewportClaimUses('resize();// the old h-dvh shell, 100dvh tall')).toEqual([])
  })

  it('does not read the // of a URL as a comment', () => {
    const url = `const docs = 'https://example.com/dvh' // prose: h-dvh was 100dvh\nconst height = '100dvh'`
    expect(viewportClaimUses(url)).toEqual(['0dvh'])
  })

  it('leaves plain vh alone — desktop-scoped uses are legitimate', () => {
    expect(viewportClaimUses(`'sm:max-h-[calc(100vh-4rem)]'`)).toEqual([])
  })
})
