import { afterEach, describe, expect, it } from 'vitest'

/**
 * What IndexedDB stores when IndexedDB is real. Paired with
 * `src/__tests__/jsdom/blobStorage.spec.ts`, where the same three writes put an
 * empty object in the store and report success.
 *
 * IndexedDB persists values by the structured clone algorithm, so its storage
 * semantics are the clone algorithm's semantics — which makes it the one part
 * of a local-first app that cannot be checked against a substitute. A fake can
 * be faithful to the spec (`fake-indexeddb` is) and still store the wrong thing,
 * because the clone it delegates to belongs to whichever realm is underneath.
 *
 * The binary case is the one that matters: cached media, exported backups,
 * queued uploads. A record of numbers and strings round-trips through any
 * substitute; a Blob is where the substitution shows.
 */
const DATABASE = 'browser-blob-storage'
const STORE = 'files'

async function roundTrip(value: unknown): Promise<unknown> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  try {
    return await new Promise<unknown>((resolve, reject) => {
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

describe('a stored Blob survives the round trip', () => {
  it('returns a Blob with its bytes and type intact', async () => {
    const stored = await roundTrip(new Blob(['backup contents'], { type: 'application/json' }))

    expect(
      stored,
      'IndexedDB returned something that is not a Blob. Storage is defined by the structured clone algorithm, so if a Blob does not survive it, no binary the app owns survives either.',
    ).toBeInstanceOf(Blob)

    const blob = stored as Blob
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe('backup contents')
  })

  it('rejects a genuinely uncloneable value instead of storing an empty one', async () => {
    // The contrast that makes the test above meaningful: a real implementation
    // distinguishes "cannot clone this" from "cloned it to nothing". Silence on
    // both is what lets an empty row look like a successful write.
    await expect(roundTrip(() => 'not cloneable')).rejects.toThrow(
      /DataCloneError|could not be clon/i,
    )
  })

  it('stores ordinary records correctly too', async () => {
    const stored = await roundTrip({ exercise: 'squat', sets: 5, weight: 60 })

    expect(stored).toEqual({ exercise: 'squat', sets: 5, weight: 60 })
  })
})
