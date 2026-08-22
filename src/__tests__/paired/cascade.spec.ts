import { afterEach, describe, expect, it } from 'vitest'
import { env } from '@/__tests__/helpers/env'
import '@/style.css'

/**
 * Why every computed style in this tier is wrong.
 *
 * jsdom's cascade is not a partial implementation of CSS — it is a specific,
 * small one. `handleSheet` has three branches (`@import`, `@media`,
 * `CSSStyleRule`); every other rule type falls off the end and is skipped.
 * `handleRule` applies a rule's own declarations and never recurses into nested
 * ones. Nothing resolves `var()`.
 *
 * The rules are all parsed. They sit in `document.styleSheets` looking healthy —
 * the last test counts them. They are simply never consulted, and the value you
 * get back is the CSS initial value, indistinguishable from an element you
 * forgot to style.
 *
 * Each test isolates one mechanism with its own stylesheet, so a failure names
 * the mechanism rather than a Tailwind class.
 */
const expected = {
  jsdom: {
    mediaFeature: false,
    supports: false,
    container: false,
    nesting: false,
    // Worse than an initial value: the string is truthy and not the default,
    // so `expect(color).not.toBe('rgba(0, 0, 0, 0)')` passes, and anything
    // that parses it — contrast maths, parseFloat on a spacing token —
    // silently gets NaN.
    varReference: 'var(--brand)',
    utilities: false,
  },
  browser: {
    mediaFeature: true,
    supports: true,
    container: true,
    nesting: true,
    varReference: 'rgb(13, 14, 15)',
    utilities: true,
  },
}[env]

const sheets: Array<HTMLStyleElement> = []

function css(text: string): void {
  const style = document.createElement('style')
  style.textContent = text
  document.head.append(style)
  sheets.push(style)
}

function div(className: string, inner = ''): HTMLElement {
  const node = document.createElement('div')
  node.className = className
  node.innerHTML = inner
  document.body.append(node)
  return node
}

afterEach(() => {
  for (const sheet of sheets.splice(0)) sheet.remove()
  document.body.replaceChildren()
})

describe('the rule types jsdom skips', () => {
  it('applies an @media query that uses a feature rather than a type', () => {
    css(`
      .box { color: rgb(1, 1, 1); }
      @media (min-width: 1px) { .box { color: rgb(2, 2, 2); } }
      @media screen { .box { font-weight: 700; } }
    `)
    const box = div('box')

    // `(min-width: 1px)` is true by any reading of any viewport.
    expect(window.innerWidth).toBeGreaterThan(1)
    expect(getComputedStyle(box).color === 'rgb(2, 2, 2)').toBe(expected.mediaFeature)

    // A bare type works in both, which is what makes this hard to spot: media
    // queries are not "unsupported", they are selectively supported.
    expect(getComputedStyle(box).fontWeight).toBe('700')
  })

  it('applies @supports and @container blocks', () => {
    css(`
      .outer { container-type: inline-size; width: 200px; }
      .box { font-weight: 400; flex-direction: column; }
      @supports (display: grid) { .box { font-weight: 700; } }
      @container (min-width: 1px) { .box { flex-direction: row; } }
    `)
    const outer = div('outer', '<div class="box"></div>')
    const box = outer.querySelector<HTMLElement>('.box')!

    expect(getComputedStyle(box).fontWeight === '700').toBe(expected.supports)
    expect(getComputedStyle(box).flexDirection === 'row').toBe(expected.container)
  })

  it('applies nested rules as well as the parent’s own declarations', () => {
    css(`
      .parent { font-size: 11px; & .child { font-weight: 700; } }
    `)
    const parent = div('parent', '<span class="child">child</span>')

    // The parent is styled, so the sheet is visibly "working".
    expect(getComputedStyle(parent).fontSize).toBe('11px')

    expect(
      getComputedStyle(parent.querySelector('.child')!).fontWeight === '700',
      'the parent’s own declarations landed and the nested branch did not, so the stylesheet looks alive while half of it is inert',
    ).toBe(expected.nesting)
  })

  it('substitutes var(), or hands back the unresolved string', () => {
    css(`
      :root { --brand: rgb(13, 14, 15); }
      .box { color: var(--brand); }
    `)
    const box = div('box')

    // The custom property itself resolves in both, so a token system looks
    // alive from the outside.
    expect(
      getComputedStyle(document.documentElement).getPropertyValue('--brand').replaceAll(' ', ''),
    ).toBe('rgb(13,14,15)')

    expect(getComputedStyle(box).color).toBe(expected.varReference)
  })
})

describe('what that adds up to for Tailwind v4', () => {
  it('parses the whole stylesheet', () => {
    let rules = 0
    let layers = 0

    const walk = (list: CSSRuleList) => {
      for (const rule of list) {
        rules += 1
        if (rule.constructor.name.includes('Layer')) layers += 1
        // SAFETY: only a grouping rule (@media, @supports, @layer) has
        // `cssRules`; the read is guarded by the `if` on the next line, which
        // is what tells a plain rule apart from one that nests.
        const nested = (rule as CSSGroupingRule).cssRules
        if (nested) walk(nested)
      }
    }

    // Every sheet, not `styleSheets[0]`: the two environments do not agree on
    // which sheet lands first, and the claim here is about the total.
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules)
      } catch {
        // A cross-origin sheet refuses `cssRules`. Nothing this app ships.
      }
    }

    // Both environments parse it. Only one of them consults the result.
    expect(rules).toBeGreaterThan(100)
    expect(layers).toBeGreaterThan(0)
  })

  it('resolves the utilities on this button', () => {
    const button = div('h-touch-target select-none overflow-y-auto bg-primary')

    // Three separate mechanisms, one outcome. `h-touch-target` needs `var()`
    // and `@layer`; the rest need `@layer`.
    const computed = getComputedStyle(button)
    expect(computed.height !== 'auto').toBe(expected.utilities)
    expect(computed.userSelect !== 'auto').toBe(expected.utilities)
    expect(computed.overflowY !== 'visible').toBe(expected.utilities)
    expect(computed.backgroundColor !== 'rgba(0, 0, 0, 0)').toBe(expected.utilities)
  })
})
