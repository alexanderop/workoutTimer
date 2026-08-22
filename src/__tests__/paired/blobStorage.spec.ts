import { afterEach, describe, expect, it } from 'vitest'
import { env, jsdomOnly } from '@/__tests__/helpers/env'

/**
 * What IndexedDB stores, asked of both runners with the same three writes.
 *
 * IndexedDB persists values *by the structured clone algorithm*, so its storage
 * semantics are the clone algorithm's semantics — which makes it the one part
 * of a local-first app that cannot be checked against a substitute. A fake can
 * be faithful to the spec and still store the wrong thing, because the clone it
 * delegates to belongs to whichever realm is underneath.
 *
 * `fake-indexeddb` *is* faithful: it calls the ambient `structuredClone` on
 * insertion, exactly as the spec requires. Under jsdom the ambient one is
 * Node's, and Node cannot recognise a jsdom Blob, because jsdom brands its
 * objects with an unregistered `Symbol("impl")` rather than an internal slot.
 * So the value is serialised as an ordinary object, and an ordinary object with
 * only prototype accessors has nothing to serialise.
 *
 * The write succeeds. The transaction completes. `onsuccess` fires. The row is
 * an empty object.
 *
 * The binary case is the one that matters: cached media, exported backups,
 * queued uploads. A record of numbers and strings round-trips through any
 * substitute — the third test — which is exactly why this goes unnoticed.
 */
const DATABASE = 'paired-blob-storage'
const STORE = 'files'

const expected = {
  jsdom: { blobSurvives: false },
  browser: { blobSurvives: true },
}[env]

/**
 * Put a value through the store and read it back.
 *
 * The return type says the value came back as it went in, which is the claim
 * every test below is here to check rather than to trust: `put` may refuse
 * the value outright, and structured clone may hand back something else
 * entirely. `undefined` is the row being absent.
 */
async function roundTrip<T>(value: T): Promise<T | undefined> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const write = database.transaction(STORE, 'readwrite')
      write.objectStore(STORE).put(value, 'entry')
      write.onerror = () => reject(write.error)
      write.oncomplete = () => {
        const read = database.transaction(STORE, 'readonly').objectStore(STORE).get('entry')
        read.onsuccess = () => resolve(read.result)
        read.onerror = () => reject(read.error)
      }
    })
  } finally {
    database.close()
  }
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DATABASE)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
})

describe('a stored Blob', () => {
  it('survives the round trip, or comes back as an empty object', async () => {
    const stored = await roundTrip(new Blob(['backup contents'], { type: 'application/json' }))

    expect(
      stored instanceof Blob,
      'storage is defined by the structured clone algorithm, so if a Blob does not survive it, no binary the app owns survives either — and there is no DataCloneError, no rejected transaction, nothing to notice',
    ).toBe(expected.blobSurvives)

    if (stored instanceof Blob) {
      expect(stored.type).toBe('application/json')
      expect(await stored.text()).toBe('backup contents')
    } else {
      // Not merely "not a Blob": every property went with it. `toBeDefined`
      // first, so a missing row cannot pass this by having no keys either.
      expect(stored).toBeDefined()
      expect(stored).toEqual({})
      expect(Object.keys(stored ?? {})).toEqual([])
    }
  })

  jsdomOnly('is outlived by a Node Blob, which is the tell', async () => {
    const { Blob: NodeBlob } = await import('node:buffer')

    // Same algorithm, same store, same call — and this one survives. The
    // difference is not the data, it is which of the two identically named
    // classes constructed it. In a browser there is only one `Blob` and this
    // test has nothing to say.
    const stored = await roundTrip(new NodeBlob(['backup contents']))

    expect(stored?.size).toBe(15)
  })
})

describe('the writes that behave the same either way', () => {
  it('rejects a genuinely uncloneable value instead of storing an empty one', async () => {
    // The contrast that makes the first test meaningful: a real implementation
    // distinguishes "cannot clone this" from "cloned it to nothing". Silence on
    // both is what lets an empty row look like a successful write — and above,
    // one environment is silent on both.
    await expect(roundTrip(() => 'not cloneable')).rejects.toThrow(
      /DataCloneError|could not be clon/i,
    )
  })

  it('stores ordinary records correctly, which is why this goes unnoticed', async () => {
    const stored = await roundTrip({ exercise: 'squat', sets: 5, weight: 60 })

    expect(stored).toEqual({ exercise: 'squat', sets: 5, weight: 60 })
  })
})
