import { afterEach, describe, expect, it } from 'vitest'

/**
 * Counterpart to `src/__tests__/components/renderedText.spec.ts`.
 *
 * `innerText` is the one text property defined in terms of *rendering* rather
 * than markup: it excludes what is not displayed, collapses whitespace the way
 * the box tree does, and turns line breaks into newlines. It is the property
 * you reach for when the question is "what does the user actually read".
 *
 * It cannot exist without layout, and jsdom does not have it. The IDL line is
 * commented out; there is no descriptor on `HTMLElement.prototype`.
 *
 * What makes this the purest silent failure in the tier is the write path.
 * Assigning to a property that does not exist is not an error in JavaScript —
 * it creates an own property on the element object. The assignment appears to
 * work, the element is unchanged, and nothing anywhere reports it: no throw, no
 * console warning, not even a jsdomError.
 */
afterEach(() => {
  document.body.replaceChildren()
})

describe('innerText does not exist', () => {
  it('has no descriptor on the prototype', () => {
    expect(Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')).toBeUndefined()
  })

  it('reads as undefined on an element with text', () => {
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Rest 90 seconds'
    document.body.append(paragraph)

    expect((paragraph as unknown as { innerText?: string }).innerText).toBeUndefined()
  })

  it('silently swallows an assignment', () => {
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Rest 90 seconds'
    document.body.append(paragraph)
    ;(paragraph as unknown as { innerText?: string }).innerText = 'Rest 60 seconds'

    // The write landed on the JavaScript object, not the document. Reading it
    // back returns what you wrote, so a test that sets and then asserts on
    // `innerText` passes while the DOM never changed.
    expect((paragraph as unknown as { innerText?: string }).innerText).toBe('Rest 60 seconds')
    expect(Object.hasOwn(paragraph, 'innerText')).toBe(true)
    expect(paragraph.textContent).toBe('Rest 90 seconds')
  })
})

describe('textContent is not a substitute for it', () => {
  it('includes text the user cannot see', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <span>Visible</span>
      <span style="display: none">Hidden</span>
    `
    document.body.append(container)

    // This is why `innerText` exists. `textContent` is a markup operation, so
    // it reports the hidden span too — and since jsdom offers nothing else,
    // every "what does the screen say" assertion has to be written against a
    // value that includes what the screen does not say.
    expect(container.textContent).toContain('Hidden')
  })
})
