import { Effect } from 'effect'
import { page, userEvent } from 'vitest/browser'
import { describe, expect } from 'vitest'
import { createSession, finishSession, markSessionRunning, runDb, updateSessionNotes } from '@/db'
import { resetAppState } from '../helpers/reset'
import { AppScreen } from '../pages/appScreen'
import { it as base } from '../fixtures'

const WORKOUT_NOTES = 'Fran scaled to sixtyfive pounds'
const RESULT_NOTES = 'Grip failed on the last round'

/**
 * A double-click selects a word; under `user-select: none` it selects
 * nothing. That makes all three assertions below behavioral, with no class
 * string in sight — which matters, because a `toHaveClass('select-none')`
 * assertion goes red on a harmless rename and stays green when the CSS is
 * broken.
 *
 * Two of the three pass before the change as well as after, which normally
 * means a test is not earning its place. They earn it anyway: they go red on
 * the *plausible wrong implementation* — a global `user-select: none` with no
 * exemption — which is the iOS caret bug that presents as a broken keyboard
 * rather than as a CSS problem, and reproduces on no desktop browser. A test
 * that only catches the bug you already fixed is worth less than one that
 * catches the mistake you are about to make.
 */
const it = base.extend('detail', async ({}, { onCleanup }) => {
  await resetAppState()

  const session = await runDb(
    createSession({
      config: { mode: 'forTime' },
      workoutNotes: WORKOUT_NOTES,
      countdownDurationMs: 0,
    }).pipe(Effect.orDie),
  )
  // Through the real lifecycle: a session that jumps straight to `completed`
  // without ever being marked running decodes to a row the read path rejects.
  await runDb(markSessionRunning(session.id).pipe(Effect.orDie))
  await runDb(finishSession(session.id, 'endpoint').pipe(Effect.orDie))
  await runDb(updateSessionNotes(session.id, RESULT_NOTES).pipe(Effect.orDie))

  const screen = await AppScreen.openAt(`/history/${session.id}`)
  onCleanup(() => screen.close())

  await expect.element(page.getByText(WORKOUT_NOTES)).toBeVisible()
  return screen
})

function selectedText(): string {
  return window.getSelection()?.toString().trim() ?? ''
}

describe('selection follows what the element is', () => {
  it('selects nothing when chrome is double-tapped', async ({ detail }) => {
    const tab = detail.tabBar.getByRole('button').first()

    await userEvent.dblClick(tab)

    expect(
      selectedText(),
      'a tab label is a control, not quotable text — selecting it intercepts the long-press a native app spends on a context menu',
    ).toBe('')
  })

  it('still selects the user’s own prose', async ({ detail: _detail }) => {
    await userEvent.dblClick(page.getByText(WORKOUT_NOTES))

    expect(
      selectedText(),
      'workout notes are prose the user wrote and may want to copy. Whatever renders user-authored text opts back in with `select-text`.',
    ).not.toBe('')
  })

  it('still lets a text field be selected into', async ({ amrapSetup }) => {
    await amrapSetup.setup.expectTimeShortcut('10 min')

    const notes = page.getByLabelText('Workout description')
    await notes.fill('a note worth keeping')

    const field = notes.element()
    if (!(field instanceof HTMLTextAreaElement)) throw new Error('notes field is not a textarea')

    await userEvent.dblClick(notes)

    expect(
      field.selectionEnd,
      'global `user-select: none` without the input/textarea exemption makes iOS refuse caret placement and selection inside fields. The failure presents as a broken keyboard, not as a CSS bug, and reproduces on no desktop browser.',
    ).toBeGreaterThan(field.selectionStart)

    // The declaration behind it, since a desktop Chromium will place a caret
    // regardless — this is the half that would actually fail on iOS.
    expect(getComputedStyle(field).userSelect).toBe('text')
  })
})
