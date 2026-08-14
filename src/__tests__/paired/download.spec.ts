import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from '@/lib/download'
import { env, jsdomOnly } from '@/__tests__/helpers/env'

/**
 * Exporting the user's backup — the same call, in both environments.
 *
 * This is the realm problem Artem Zakharchenko's "Why I Won't Use JSDOM"
 * describes, landing on a feature that matters. It is the worst case in this
 * tier, because jsdom does not refuse the work. **It completes it, reports
 * success, and hands back the wrong bytes.**
 *
 * `URL.createObjectURL` under jsdom is Node's, from `node:buffer`, and the Blob
 * it is given is jsdom's. Node does not recognise it, so it stringifies it. The
 * resulting `blob:nodedata:` URL fetches with `ok: true` and a body of
 * `"undefined"` — the literal string. A user restoring that file gets nothing
 * back, and every step along the way looked like it worked.
 *
 * `src/__tests__/lib/download.spec.ts` is the gate: filename, anchor
 * attachment, revocation timing. This file is the part where the two
 * environments disagree about what was downloaded at all.
 *
 * The anchor click is stubbed in both, because a real click in the test runner
 * would start a real download. Everything asserted is what the browser sees at
 * that moment.
 */
const expected = {
  jsdom: {
    // `node:buffer`'s registry, not the document's.
    objectUrl: /^blob:nodedata:/,
    body: 'undefined',
    clonePreservesBlob: false,
  },
  browser: {
    // Scoped to the document's origin, as the spec requires.
    objectUrl: /^blob:https?:\/\//,
    body: 'backup contents',
    clonePreservesBlob: true,
  },
}[env]

const clicks: Array<{ href: string; download: string; connected: boolean }> = []

describe('the backup download', () => {
  beforeEach(() => {
    clicks.length = 0
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download, connected: this.isConnected })
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mints an object URL from the document, or from Node', () => {
    downloadBlob(new Blob(['backup contents'], { type: 'application/json' }), 'backup.json')

    expect(clicks).toHaveLength(1)
    expect(clicks[0]?.href).toMatch(expected.objectUrl)
  })

  it('serves the backup, or the string "undefined", and calls both a success', async () => {
    downloadBlob(new Blob(['backup contents'], { type: 'application/json' }), 'backup.json')

    const response = await fetch(clicks[0]?.href ?? '')

    // `ok` either way. That is the whole problem: there is no error to catch,
    // no rejected promise, no warning — the export simply contains the word
    // "undefined" and the suite that produced it is green.
    expect(response.ok).toBe(true)
    expect(await response.text()).toBe(expected.body)
  })
})

describe('the same machinery underneath every Dexie write', () => {
  it('round-trips a Blob through structuredClone, or flattens it', () => {
    const blob = new Blob(['backup contents'], { type: 'application/json' })

    const cloned = structuredClone(blob)

    // IndexedDB stores values *by* the structured clone algorithm, so this is
    // the same machinery every persisted byte goes through — see
    // `blobStorage.spec.ts` for what that costs at the storage layer. A real
    // browser returns a Blob of size 15, or throws DataCloneError on something
    // genuinely uncloneable. The other answer is an empty plain object and no
    // error at all.
    expect(cloned instanceof Blob).toBe(expected.clonePreservesBlob)

    if (!expected.clonePreservesBlob) {
      expect(cloned.constructor.name).toBe('Object')
      expect(Object.keys(cloned)).toEqual([])
    }
  })

  jsdomOnly('has two Blob constructors that are not the same class', async () => {
    const { Blob: NodeBlob } = await import('node:buffer')

    // Both are called "Blob". Neither is the other. This is the whole of the
    // realm problem in two assertions, and it is why everything above behaves
    // the way it does. A browser has one realm and one `Blob`, so there is
    // nothing here for it to answer.
    expect(NodeBlob.name).toBe('Blob')
    expect(Blob.name).toBe('Blob')
    expect(new Blob(['x'])).not.toBeInstanceOf(NodeBlob)
  })
})
