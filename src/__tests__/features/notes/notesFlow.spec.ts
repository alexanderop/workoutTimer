import { Effect } from 'effect'
import { page, userEvent } from 'vitest/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listNotes, runDb } from '@/db'
import { renderApp } from '../../helpers/renderApp'
import { resetAppState } from '../../helpers/reset'

describe('notes quick-add flow', () => {
  let cleanup: (() => void) | undefined

  beforeEach(resetAppState)
  afterEach(() => cleanup?.())

  it('creates a note through the center FAB and persists it', async () => {
    ;({ cleanup } = await renderApp())

    await expect.element(page.getByText('No notes yet')).toBeVisible()

    await page.getByRole('button', { name: 'Add a note' }).click()
    await page.getByLabelText('Title', { exact: true }).fill('Buy milk')
    await page.getByLabelText('Note', { exact: true }).fill('2 liters, oat')
    await page.getByRole('button', { name: 'Save' }).click()

    // Visible in the list, confirmed by toast, and actually in IndexedDB.
    await expect.element(page.getByRole('heading', { name: 'Buy milk' })).toBeVisible()
    await expect.element(page.getByText('Note saved')).toBeVisible()

    const notes = await runDb(listNotes.pipe(Effect.orDie))
    expect(notes).toMatchObject([{ title: 'Buy milk', body: '2 liters, oat' }])
  })

  it('deletes a note from its card action', async () => {
    ;({ cleanup } = await renderApp())

    await page.getByRole('button', { name: 'Add a note' }).click()
    await page.getByLabelText('Title').fill('Temporary')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.element(page.getByRole('heading', { name: 'Temporary' })).toBeVisible()

    await page.getByRole('button', { name: 'Delete note Temporary' }).click()

    await expect.element(page.getByText('No notes yet')).toBeVisible()
    expect(await runDb(listNotes.pipe(Effect.orDie))).toHaveLength(0)
  })

  it('keeps the draft when the sheet is dismissed by accident', async () => {
    ;({ cleanup } = await renderApp())

    await page.getByRole('button', { name: 'Add a note' }).click()
    await page.getByLabelText('Title', { exact: true }).fill('Half typed')
    await page.getByLabelText('Note', { exact: true }).fill('…and a body')

    // Escape stands in for the accidental overlay tap.
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()

    await page.getByRole('button', { name: 'Add a note' }).click()

    await expect.element(page.getByLabelText('Title', { exact: true })).toHaveValue('Half typed')
    await expect.element(page.getByLabelText('Note', { exact: true })).toHaveValue('…and a body')
  })

  it('starts from an empty draft after a successful save', async () => {
    ;({ cleanup } = await renderApp())

    await page.getByRole('button', { name: 'Add a note' }).click()
    await page.getByLabelText('Title', { exact: true }).fill('Saved and gone')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect.element(page.getByRole('heading', { name: 'Saved and gone' })).toBeVisible()

    await page.getByRole('button', { name: 'Add a note' }).click()

    await expect.element(page.getByLabelText('Title', { exact: true })).toHaveValue('')
  })

  it('creates a single note when the form is submitted twice in a row', async () => {
    ;({ cleanup } = await renderApp())

    await page.getByRole('button', { name: 'Add a note' }).click()
    await page.getByLabelText('Title', { exact: true }).fill('Only once')

    // Two submits in the same tick — the double-tap a user can actually
    // produce, before the first write has resolved.
    const form = page.getByRole('button', { name: 'Save' }).element().closest('form')
    if (!(form instanceof HTMLFormElement)) throw new Error('quick-add form not found')
    form.requestSubmit()
    form.requestSubmit()

    await expect.poll(async () => (await runDb(listNotes.pipe(Effect.orDie))).length).toBe(1)
    await expect.element(page.getByRole('heading', { name: 'Only once' })).toBeVisible()
  })

  it('pins a note so it sorts first', async () => {
    ;({ cleanup } = await renderApp())

    for (const title of ['First', 'Second']) {
      await page.getByRole('button', { name: 'Add a note' }).click()
      await page.getByLabelText('Title').fill(title)
      await page.getByRole('button', { name: 'Save' }).click()
      await expect.element(page.getByRole('heading', { name: title })).toBeVisible()
    }

    await page.getByRole('button', { name: 'Pin note First' }).click()
    await expect.element(page.getByRole('button', { name: 'Unpin note First' })).toBeVisible()

    const headings = page.getByRole('heading', { level: 3 })
    await expect.element(headings.first()).toHaveTextContent('First')
  })
})
