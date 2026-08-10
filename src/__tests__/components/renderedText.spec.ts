import { afterEach, describe, expect, it } from 'vitest'

/**
 * `innerText` — the only text property that answers "what does the user read"
 * rather than "what is in the markup". Paired with
 * `src/__tests__/jsdom/renderedText.spec.ts`, where it does not exist and an
 * assignment to it is silently absorbed by the JavaScript object.
 *
 * The distinction matters for any screen that hides content responsively or by
 * state — a `md:hidden` label, a collapsed section, a `v-show` panel. Asserting
 * on `textContent` in those cases asserts the union of what is on screen and
 * what is deliberately not, which is why such a test keeps passing after the
 * thing it describes stops being visible.
 */
afterEach(() => {
  document.body.replaceChildren()
})

function render(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  return container
}

describe('innerText reports only what is rendered', () => {
  it('excludes a hidden element that textContent still reports', () => {
    const container = render(`
      <span>Visible</span>
      <span style="display: none">Hidden</span>
    `)

    expect(
      container.textContent,
      'textContent should carry the hidden span — if it does not, this comparison proves nothing',
    ).toContain('Hidden')

    expect(
      container.innerText,
      'innerText included text the user cannot see. It is defined against the rendered box tree, so a display:none subtree has to drop out of it.',
    ).not.toContain('Hidden')
    expect(container.innerText).toContain('Visible')
  })

  it('collapses markup whitespace the way the box tree does', () => {
    const container = render(`<p>Rest     90


      seconds</p>`)

    // textContent preserves the source bytes; innerText reports the single
    // spaces that were actually laid out.
    expect(container.textContent).toMatch(/ {4}/)
    expect(container.innerText).toBe('Rest 90 seconds')
  })

  it('turns a line break element into an actual newline', () => {
    const container = render(`<p>Round 1<br>Round 2</p>`)

    expect(container.textContent).toBe('Round 1Round 2')
    expect(
      container.innerText,
      'a <br> did not become a newline. Without layout there is no line box to break, so the two rounds run together.',
    ).toBe('Round 1\nRound 2')
  })
})

describe('writing innerText changes the document', () => {
  it('replaces the rendered text rather than the JavaScript object', () => {
    const container = render(`<p>Rest 90 seconds</p>`)
    const paragraph = container.querySelector('p')!

    paragraph.innerText = 'Rest 60 seconds'

    expect(
      Object.hasOwn(paragraph, 'innerText'),
      'the assignment created an own property instead of reaching the DOM, which is the shape of a silently absorbed write',
    ).toBe(false)
    expect(paragraph.textContent).toBe('Rest 60 seconds')
  })
})
