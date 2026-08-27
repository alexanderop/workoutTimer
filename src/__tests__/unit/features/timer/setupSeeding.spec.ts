import 'fake-indexeddb/auto'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreset, presetMutation, resetDatabase, type PresetDraft } from '@/db'
import { setupDraftAtom, setupKey, type TimerSetupDraft } from '@/features/timer/setupForm'
import { presetListAtom } from '@/state/timerData'
import { harness } from '../../harness'

/**
 * The half of the setup form that needs a database: what it shows while the
 * preset's row is still on its way.
 *
 * `setupForm.spec.ts` covers the draft as a value, with no IndexedDB. This
 * file covers the seam that value sits on. The seed cannot tell "this preset
 * has no row" from "its row has not arrived yet" — both are the mode's
 * defaults — so everything depends on an edit overlaying only what was edited.
 * A whole-draft write silently turned a slow read into permanent data loss:
 * the fields the user never touched were captured at the defaults, and Save
 * wrote those over the stored preset.
 */
const preset: PresetDraft = {
  name: 'Twenty minute grind',
  config: { mode: 'amrap', durationMs: 1_200_000 },
  workoutNotes: 'ten burpees on the minute',
}

beforeEach(async () => {
  await resetDatabase()
})

/** Presets in the database, keyed by name, each with its generated id. */
async function storedPresets(...drafts: ReadonlyArray<PresetDraft>): Promise<Map<string, string>> {
  const app = harness()
  app.mount(presetListAtom)
  for (const draft of drafts) app.write(presetMutation, Effect.orDie(createPreset(draft)))
  await vi.waitFor(() => expect(app.get(presetListAtom)).toHaveLength(drafts.length))
  const ids = new Map(app.get(presetListAtom).map((row) => [row.name, row.id]))
  app.dispose()
  return ids
}

const storedPreset = async (): Promise<string> => (await storedPresets(preset)).get(preset.name)!

describe('a preset whose row has not arrived yet', () => {
  it('shows the saved values once it does', async () => {
    const id = await storedPreset()
    const app = harness()
    const draft = setupDraftAtom(setupKey({ mode: 'amrap', presetId: id }))
    app.mount(presetListAtom)
    app.mount(draft)

    // A fresh registry re-reads the table, so the first answer is the mode's
    // default — the same answer it gives for a preset that does not exist.
    expect(app.get(draft).durationSeconds).toBe(600)

    await vi.waitFor(() => expect(app.get(draft).durationSeconds).toBe(1_200))
    expect(app.get(draft).presetName).toBe(preset.name)

    app.dispose()
  })

  /**
   * The data-loss case, as a test. Typing one field before the row lands must
   * not freeze the other eight at the defaults that were on screen — those are
   * what Save writes back over the stored preset.
   */
  it('keeps tracking the row for every field the user did not touch', async () => {
    const id = await storedPreset()
    const app = harness()
    const draft = setupDraftAtom(setupKey({ mode: 'amrap', presetId: id }))
    app.mount(presetListAtom)
    app.mount(draft)

    app.set(draft, { presetName: 'Renamed' })

    await vi.waitFor(() => expect(app.get(draft).durationSeconds).toBe(1_200))
    expect(app.get(draft)).toMatchObject({
      presetName: 'Renamed',
      durationSeconds: 1_200,
      workoutNotes: preset.workoutNotes,
    })

    app.dispose()
  })

  /** An edited field is the user's, and a row arriving late does not take it back. */
  it('does not overwrite what the user typed', async () => {
    const id = await storedPreset()
    const app = harness()
    const draft = setupDraftAtom(setupKey({ mode: 'amrap', presetId: id }))
    app.mount(presetListAtom)
    app.mount(draft)

    app.set(draft, { durationSeconds: 127 })

    await vi.waitFor(() => expect(app.get(draft).presetName).toBe(preset.name))
    expect(app.get(draft).durationSeconds).toBe(127)

    app.dispose()
  })

  /**
   * The form opens *its* preset, not the first row in the table — the id in
   * `?preset=` is what selects it.
   */
  it('picks the row the key names', async () => {
    const other: PresetDraft = {
      name: 'Five minute blast',
      config: { mode: 'amrap', durationMs: 300_000 },
      workoutNotes: '',
    }
    const ids = await storedPresets(other, preset)
    const app = harness()
    const draft = setupDraftAtom(setupKey({ mode: 'amrap', presetId: ids.get(preset.name)! }))
    app.mount(presetListAtom)
    app.mount(draft)

    await vi.waitFor(() => expect(app.get(draft).presetName).toBe(preset.name))
    expect(app.get(draft).durationSeconds).toBe(1_200)

    app.dispose()
  })

  /**
   * A preset of the wrong mode is not this form's preset. `/timer/tabata`
   * carrying an AMRAP's id is a hand-edited URL, and the honest answer is the
   * mode's defaults — seeding a Tabata form from an AMRAP config would leave
   * every Tabata field at whatever `BASE_DRAFT` happened to hold.
   */
  it('ignores a preset saved for a different mode', async () => {
    const id = await storedPreset()
    const app = harness()
    const draft = setupDraftAtom(setupKey({ mode: 'tabata', presetId: id }))
    app.mount(presetListAtom)
    app.mount(draft)

    await vi.waitFor(() => expect(app.get(presetListAtom)).toHaveLength(1))
    expect(app.get(draft)).toMatchObject({ workSeconds: 20, restSeconds: 10, rounds: 8 })
    expect(app.get(draft).presetName).toBe('')

    app.dispose()
  })

  /** Two patches accumulate rather than replacing each other. */
  it('remembers every field edited so far', () => {
    const app = harness()
    const draft = setupDraftAtom(setupKey({ mode: 'tabata', presetId: undefined }))
    app.mount(draft)

    app.set(draft, { workSeconds: 30 })
    app.set(draft, { restSeconds: 15 })

    expect(app.get(draft)).toMatchObject<Partial<TimerSetupDraft>>({
      workSeconds: 30,
      restSeconds: 15,
      rounds: 8,
    })

    app.dispose()
  })
})
