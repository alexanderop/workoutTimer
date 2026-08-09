import { afterEach, describe, expect, it } from 'vitest'
import '@/style.css'

/**
 * Why every computed style in this tier is wrong.
 *
 * jsdom's cascade is not a partial implementation of CSS — it is a specific,
 * small one. `handleSheet` has three branches (`@import`, `@media`,
 * `CSSStyleRule`); every other rule type falls off the end and is skipped.
 * `handleRule` applies a rule's own declarations and never recurses into
 * nested ones. Nothing resolves `var()`.
 *
 * The rules are all parsed. They sit in `document.styleSheets` looking
 * healthy. They are simply never consulted, and the value you get back is the
 * CSS initial value — indistinguishable from an element you forgot to style.
 *
 * Each test below isolates one mechanism with its own stylesheet, so a failure
 * names the mechanism rather than a Tailwind class.
 */
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
  it('drops every @media query that uses a feature rather than a type', () => {
    css(`
      .box { color: rgb(1, 1, 1); }
      @media (min-width: 1px) { .box { color: rgb(2, 2, 2); } }
      @media screen { .box { font-weight: 700; } }
    `)
    const box = div('box')

    // The viewport is 1024px wide, so `(min-width: 1px)` is true by any
    // reading. jsdom's evaluator matches only the bare types `all` and
    // `screen`, so any query carrying a feature evaluates false.
    expect(window.innerWidth).toBe(1024)
    expect(getComputedStyle(box).color).toBe('rgb(1, 1, 1)')

    // A bare type does work, which is what makes this hard to spot: media
    // queries are not "unsupported", they are selectively supported.
    expect(getComputedStyle(box).fontWeight).toBe('700')
  })

  it('drops @supports and @container blocks entirely', () => {
    css(`
      .box { font-weight: 400; flex-direction: column; }
      @supports (display: grid) { .box { font-weight: 700; } }
      @container (min-width: 1px) { .box { flex-direction: row; } }
    `)
    const box = div('box')

    expect(getComputedStyle(box).fontWeight).toBe('400')
    expect(getComputedStyle(box).flexDirection).toBe('column')
  })

  it('drops nested rules while applying the parent’s own declarations', () => {
    css(`
      .parent { font-size: 11px; & .child { font-weight: 700; } }
    `)
    const parent = div('parent', '<span class="child">child</span>')

    // The parent is styled, so the sheet is visibly "working".
    expect(getComputedStyle(parent).fontSize).toBe('11px')
    // The nested branch is not.
    expect(getComputedStyle(parent.querySelector('.child')!).fontWeight).toBe('normal')
  })

  it('never substitutes var(), and hands back the unresolved string', () => {
    css(`
      :root { --brand: rgb(13, 14, 15); }
      .box { color: var(--brand); }
    `)
    const box = div('box')

    // The custom property itself resolves, so a token system looks alive.
    expect(getComputedStyle(document.documentElement).getPropertyValue('--brand')).toBe(
      'rgb(13,14,15)',
    )

    // The reference does not. This is worse than an initial value: the string
    // is truthy and not the default, so `expect(color).not.toBe('rgba(0, 0, 0, 0)')`
    // passes, and anything that parses it — contrast maths, parseFloat on a
    // spacing token — silently gets NaN.
    expect(getComputedStyle(box).color).toBe('var(--brand)')
  })
})

describe('what that adds up to for Tailwind v4', () => {
  it('parses the whole stylesheet and applies none of it', () => {
    const sheet = document.styleSheets[0]!
    let rules = 0
    let layers = 0

    const walk = (list: CSSRuleList) => {
      for (const rule of list) {
        rules += 1
        if (rule.constructor.name.includes('Layer')) layers += 1
        const nested = (rule as CSSGroupingRule).cssRules
        if (nested) walk(nested)
      }
    }
    walk(sheet.cssRules)

    expect(rules).toBeGreaterThan(100)
    expect(layers).toBeGreaterThan(0)
  })

  it('leaves every utility on this button at its initial value', () => {
    const button = div('h-touch-target select-none overflow-y-auto bg-primary md:hidden')

    // Four separate mechanisms, one outcome. `h-touch-target` needs `var()`
    // and `@layer`; `md:hidden` needs a media feature; the rest need `@layer`.
    expect(getComputedStyle(button).height).toBe('auto')
    expect(getComputedStyle(button).userSelect).toBe('auto')
    expect(getComputedStyle(button).overflowY).toBe('visible')
    expect(getComputedStyle(button).display).toBe('block')
  })
})
