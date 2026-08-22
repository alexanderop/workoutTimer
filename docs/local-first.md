---
type: Architecture Decision
title: Local-first
description: Which Ink & Switch local-first ideals this app commits to, and how the data layer implements them.
tags: [local-first, data, indexeddb, rationale]
status: stable
---

# Local-first

This starter follows the [Ink & Switch local-first ideals](https://www.inkandswitch.com/local-first/). The ones that shape the code:

1. **No spinners** — every interaction hits IndexedDB on-device; nothing blocks on a network.
2. **Network optional** — the service worker precaches the app; it boots and works fully offline.
3. **The Long Now** — data written today must be readable by every future version of the app.
4. **Security & privacy by default** — data never leaves the device.
5. **Ownership & control** — the user can export everything, any time, as plain JSON.

## How the data layer implements this

### One public surface

All storage access goes through `src/db/index.ts`. Views, features, and state modules import repositories from there — never Dexie directly. This is enforced by the ESLint boundary rules and the architecture tests, and it is what keeps the storage engine swappable (e.g. for a future sync engine).

### Schema changes are a migration plus a tolerant read path — always both

The "converter" is the decode itself — `WorkoutSession` *is* the schema's decoded type, and `decodeWorkoutSession` is the only thing standing between a stored row and the app. There is deliberately no separate `StoredWorkoutSession` type and no `toWorkoutSession()` function: while the stored shape and the domain shape are the same shape, a second name for it is a copy waiting to drift, and the identity function bridging them is noise.

Every schema version bump carries both halves:

- **The Dexie `upgrade()`** rewrites rows already in the database when the app updates.
- **A relaxed stored schema plus a converter** decodes and normalizes *any* historical row into a complete domain object at read time. Old fields go `Schema.optionalKey`, the domain type stays complete, and the gap between them is exactly what the converter fills.

The worked example is **v2**: `soundVolume` joined the settings row, so `src/db/schema.ts` gained a `version(2).upgrade()` that fills it on existing rows, and the field in `TimerSettingsSchema` carries `Schema.withDecodingDefaultKey` — optional on the encoded side, required on the domain side, defaulted at decode time. That one declaration is the relaxed stored schema and the converter in the same place.

Why both? Because the migration only sees rows that were in the database at upgrade time. Old JSON backups imported later, or rows arriving from a future sync peer, bypass it entirely. Keeping the old-shape fields optional in the stored schema is what makes the compiler *force* every read through the converter rather than trusting the table's type. The rule:

> Never trust the shape of stored data; trust the decode.

"Never trust" is meant literally: a table's TypeScript type is a claim, not a check. IndexedDB rows outlive app versions, get restored with a profile, and are editable from devtools, so `SessionsRepo.listSessions` decodes every row against the schema and fails with a `DatabaseError` when one does not match. One bad row fails the whole read on purpose — the schema accepts every shape this app has ever written, so a row that misses it is damaged rather than old, and silently dropping it would show a short history the user might then export over their last good backup.

The same schema does triple duty: Dexie's table typing, that read-path decode, and backup validation in `src/db/backup.ts`. One definition means a field added to a session cannot reach disk while quietly disappearing from every export.

The paths that exist are tested, all of them in the Node tier over `fake-indexeddb`: the decode rules in `src/__tests__/unit/db/converters.spec.ts`, repository CRUD and the rejected-row path in `workouts.spec.ts`, the backup round-trip in `backupRoundTrip.spec.ts`, and each `upgrade()` in `migrations.spec.ts` — a version bump lands its migration spec in the same commit.

### Persistent storage is requested at boot

`src/lib/persistentStorage.ts` calls `navigator.storage.persist()` from `src/main.ts`. Without it the origin's storage is *best effort*, and browsers treat that literally: Safari clears IndexedDB after seven days without a visit, Chrome and Firefox clear it when the disk gets tight. There is no server copy here, so eviction is not a cache miss — it is the user's data, gone.

The request can be denied, and browsers decide on their own engagement heuristics (installed to the home screen, bookmarked, used often). The outcome is logged, never surfaced: "the browser might delete your workouts" is not something a user can act on. What they can act on is the export, which is why it exists.

The same quota is what the runtime caches in `vite.config.ts` draw from — see the note there on why the cache routes are restricted to same-origin requests.

### Export/import

`src/db/backup.ts` exports the whole database as versioned, human-readable JSON and validates imports with `effect/Schema` — the same row schemas the repository decodes with, so an import can never accept a shape a read would reject. The settings screen wires both up. When you add a table, add it to the backup payload in the same commit — a backup that silently misses a table is worse than none.

**Importing replaces; it does not merge.** `replaceAllData` clears every table inside one transaction before writing the payload back. Merging looks like the safer default and is not: rows the user deleted before exporting would survive the restore, leaving a database that never existed at any point in time — and a backup carrying an active session could land beside the existing one, breaking the single-active-session invariant `createSession` enforces. One transaction, so a failure halfway leaves the old data intact rather than an empty app. The settings screen says so before the user picks a file.

### What is deliberately out of scope

Multi-device sync and CRDTs. The seams for them exist (single db surface, schema-owned row shapes, versioned export), but this stays honest: it ships what it tests.
