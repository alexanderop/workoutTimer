import { Blob as NodeBlob } from 'node:buffer'
import { describe, expect, it } from 'vitest'

/**
 * Counterpart to `src/__tests__/db/blobStorage.spec.ts`.
 *
 * `download.spec.ts` shows `structuredClone` returning `{}` for a jsdom Blob.
 * This file follows that through to the place it actually costs something:
 * IndexedDB, which is defined to store values *by the structured clone
 * algorithm*. For a local-first app that is the write path for every byte the
 * product owns.
 *
 * `fake-indexeddb` is faithful here — it calls the ambient `structuredClone` on
 * insertion, exactly as the spec requires. The ambient one is Node's, and Node
 * cannot recognise a jsdom Blob, because jsdom brands its objects with an
 * unregistered `Symbol("impl")` rather than an internal slot. So the value is
 * serialised as an ordinary object, and an ordinary object with only prototype
 * accessors has nothing to serialise.
 *
 * The write succeeds. The transaction completes. `onsuccess` fires. The row is
 * an empty object.
 */
const DATABASE = 'jsdom-blob-storage'
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

describe('a stored Blob comes back empty', () => {
  it('accepts the write and returns a plain object', async () => {
    const stored = await roundTrip(new Blob(['backup contents'], { type: 'application/json' }))

    // No DataCloneError, no rejected transaction — the store simply holds `{}`.
    expect(stored).not.toBeInstanceOf(Blob)
    expect(stored).toEqual({})
    expect(Object.keys(stored as object)).toEqual([])
  })

  it('keeps a Node Blob, which is the tell', async () => {
    const stored = await roundTrip(new NodeBlob(['backup contents']))

    // Same algorithm, same store, same call — and this one survives. The
    // difference is not the data, it is which of the two identically named
    // classes constructed it.
    expect((stored as { size?: number })?.size).toBe(15)
  })

  it('stores ordinary records correctly, which is why this goes unnoticed', async () => {
    const stored = await roundTrip({ exercise: 'squat', sets: 5, weight: 60 })

    expect(stored).toEqual({ exercise: 'squat', sets: 5, weight: 60 })
  })
})
