import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from '@/lib/download'

/**
 * Counterpart to `src/__tests__/lib/download.spec.ts`.
 *
 * This is the failure mode Artem Zakharchenko's "Why I Won't Use JSDOM"
 * describes — jsdom objects meeting Node objects — landing on a feature that
 * matters: exporting the user's backup. It is the worst case in this tier,
 * because jsdom does not refuse the work. It completes it, reports success,
 * and hands back the wrong bytes.
 *
 * `URL.createObjectURL` here is Node's, from `node:buffer`, and the Blob it is
 * given is jsdom's. Node does not recognise it, so it stringifies it. The
 * resulting `blob:nodedata:` URL fetches with `ok: true` and a body of
 * `"undefined"` — the literal string. A user restoring that file gets nothing
 * back, and every step along the way looked like it worked.
 */
const clicks: Array<{ href: string; download: string; connected: boolean }> = []

describe('the backup download in jsdom', () => {
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

  it('produces a Node object URL rather than a document one', () => {
    downloadBlob(new Blob(['backup contents'], { type: 'application/json' }), 'backup.json')

    expect(clicks).toHaveLength(1)
    // A browser mints `blob:http://localhost:5173/<uuid>` — scoped to the
    // document's origin. This is `node:buffer`'s registry instead.
    expect(clicks[0]?.href).toMatch(/^blob:nodedata:/)
  })

  it('serves the string "undefined" in place of the backup, and calls it a success', async () => {
    downloadBlob(new Blob(['backup contents'], { type: 'application/json' }), 'backup.json')

    const response = await fetch(clicks[0]?.href ?? '')

    // The browser spec asserts `toBe('backup contents')` on this line.
    expect(response.ok).toBe(true)
    expect(await response.text()).toBe('undefined')
  })

  it('cannot round-trip a Blob through structuredClone either', () => {
    const blob = new Blob(['backup contents'], { type: 'application/json' })

    const cloned = structuredClone(blob)

    // IndexedDB stores values *by* the structured clone algorithm, so this is
    // the same machinery every Dexie write goes through. A real browser
    // returns a Blob of size 15, or throws DataCloneError on something
    // genuinely uncloneable. jsdom returns an empty plain object and no error.
    expect(cloned).not.toBeInstanceOf(Blob)
    expect(cloned.constructor.name).toBe('Object')
    expect(Object.keys(cloned)).toEqual([])
  })

  it('has two Blob constructors that are not the same class', async () => {
    const { Blob: NodeBlob } = await import('node:buffer')

    // Both are called "Blob". Neither is the other. This is the whole of the
    // realm problem in two assertions, and it is why the three tests above
    // behave the way they do.
    expect(NodeBlob.name).toBe('Blob')
    expect(Blob.name).toBe('Blob')
    expect(new Blob(['x'])).not.toBeInstanceOf(NodeBlob)
  })
})
