import { Effect } from 'effect'
import { describe, expect } from 'vitest'
import { listPresets, listSessions, runDb } from '@/db'
import { it } from '../../fixtures'

const storedSessions = () => runDb(listSessions.pipe(Effect.orDie))

describe('workout timer flow', () => {
  it('starts, records a round, completes, and saves a result', async ({ timer }) => {
    await timer.chooseMode('AMRAP')
    await timer.setup.chooseTime('1 min')
    await timer.setup.start()
    await timer.run.expectRunning()

    await timer.run.addRound()
    await timer.run.expectRounds(1)

    await timer.run.finish()
    await timer.result.expectReady()
    await timer.result.save('Felt strong')
    await timer.result.expectNotes('Felt strong')

    const [stored] = await storedSessions()
    expect(stored).toMatchObject({ status: 'completed', notes: 'Felt strong' })
    expect(stored?.rounds).toHaveLength(1)
  })

  it('saves and reuses a preset', async ({ timer }) => {
    await timer.chooseMode('Tabata')
    await timer.setup.savePreset('Fast eight')
    await timer.expectToast('Preset saved')

    expect(await runDb(listPresets.pipe(Effect.orDie))).toMatchObject([
      { name: 'Fast eight', config: { mode: 'tabata', rounds: 8 } },
    ])
  })

  /**
   * Saving a preset writes to the presets table, which reloads every atom
   * keyed on it. The setup form seeds itself from that same data, so a naive
   * "re-seed whenever presets change" left the user staring at the mode
   * default and a Start button that would run a workout they never configured.
   */
  it('keeps the configured values after saving them as a preset', async ({ amrapSetup: timer }) => {
    await timer.setup.chooseTime('20 min')
    await timer.setup.savePreset('Twenty minute grind')
    await timer.expectToast('Preset saved')
    await timer.setup.start()
    await timer.run.expectRunning()

    expect(await storedSessions()).toMatchObject([
      { config: { mode: 'amrap', durationMs: 1_200_000 } },
    ])
  })

  /**
   * The other half of the seeding rule: the form has to *start* from the
   * preset. Its row arrives from IndexedDB after the screen has already
   * rendered, so a form that only reads the presets list once shows the mode
   * default forever — and one that remembers "already seeded" outside the
   * registry shows it from the second test onwards, since every render gets a
   * fresh registry while the atoms are memoized per key at module scope.
   */
  it('opens an existing preset on its saved values', async ({ presetSetup }) => {
    const { timer } = presetSetup

    await timer.setup.expectPresetName('Twenty minute grind')
    await timer.setup.expectTimeSelected('20 min')
  })

  it('offers 15-second shortcuts and accepts a custom raw time', async ({ amrapSetup: timer }) => {
    await timer.setup.expectTimeShortcut('15 sec')
    await timer.setup.chooseCustomTime('2', '7')
    await timer.setup.start()
    await timer.run.expectRunning()

    expect(await storedSessions()).toMatchObject([
      { config: { mode: 'amrap', durationMs: 127_000 } },
    ])
  })

  /**
   * The circuit path end to end: the block editor writes the draft, the draft
   * becomes a custom config, and the run screen calls the phase by the
   * block's own name rather than the generic word.
   */
  it('builds a circuit and runs it under its block names', async ({ circuitSetup: timer }) => {
    await timer.setup.nameBlock(1, 'Burpees')
    await timer.setup.setBlockDuration(1, '0', '45')
    await timer.setup.addWorkBlock()
    await timer.setup.start()
    await timer.run.expectPhase('Burpees')

    await timer.run.finish()
    await timer.result.expectReady()

    const [stored] = await storedSessions()
    expect(stored?.status).toBe('completed')
    expect(stored?.config).toMatchObject({
      mode: 'custom',
      repeat: 3,
      blocks: [
        { label: 'Burpees', kind: 'work', durationMs: 45_000 },
        { label: '', kind: 'rest', durationMs: 15_000 },
        { label: '', kind: 'work', durationMs: 30_000 },
      ],
    })
  })

  it('offers recovery for an active session', async ({ recoverableTimer }) => {
    const { session, timer } = recoverableTimer
    await timer.expectRecovery()
    await timer.resume()
    await timer.run.expectMode('For Time')
    expect(session.status).toBe('running')
  })

  // This deliberately races two taps against the repository write. The tag
  // carries the CI-only retry policy instead of copying it onto the test.
  it(
    'records one round when Add round is tapped twice in one tick',
    { tags: ['flaky'] },
    async ({ timer }) => {
      await timer.chooseMode('AMRAP')
      await timer.setup.chooseTime('1 min')
      await timer.setup.start()
      await timer.run.expectRunning()

      timer.run.addRoundTwiceInOneTick()

      // Polling the store for 1 would pass on a sample taken between two
      // writes. Wait for the UI to reflect the persisted count first — both
      // requests were dispatched in the same tick, so by then they have
      // settled — and only then read the final state.
      await timer.run.expectRounds(1)
      const [stored] = await storedSessions()
      expect(stored?.rounds).toHaveLength(1)
    },
  )
})
