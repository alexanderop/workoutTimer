import { Atom } from '@effect/atom-vue'
import { isPresetDraft } from '@/db'
import { DEFAULT_CONFIGS, isTimerConfig, SECOND_MS } from '@/features/timer/domain'
import {
  countValues,
  includeSelectedValue,
  timerDurationValues,
  type PickerOption,
} from '@/features/timer/pickerOptions'
import { routeParamAtom, routeQueryAtom } from '@/state/route'
import { presetListAtom } from '@/state/timerData'
import type { PresetDraft, TimerConfig, TimerMode, TimerPreset } from '@/db'

export const MAX_TIMER_DURATION_SECONDS = 24 * 60 * 60

const DURATION_VALUES = timerDurationValues(MAX_TIMER_DURATION_SECONDS, 15)
const INTERVAL_VALUES = timerDurationValues(60 * 60)
const ROUND_VALUES = countValues(20)

/**
 * The timer setup form.
 *
 * Nine `ref`s and a seeding `watch` before; one draft value per thing being
 * edited now. The change that matters is the key: a draft is addressed by
 * `mode:presetId`, so "this is a different thing to edit" is expressed by
 * asking for a different atom rather than by a `seededFor` string compared
 * inside a watcher. The old guard existed because the watcher's dependencies
 * included the presets *array*, whose identity changes on every write to the
 * table — pausing a timer used to re-seed this form and discard what the user
 * had typed. A family key cannot have that bug: nothing about a preset write
 * changes which atom the screen is reading.
 */
export interface TimerSetupDraft {
  readonly durationSeconds: number
  readonly timeCapSeconds: number | undefined
  readonly targetRounds: number | undefined
  readonly intervalSeconds: number
  readonly rounds: number
  readonly workSeconds: number
  readonly restSeconds: number
  readonly workoutNotes: string
  readonly presetName: string
}

const BASE_DRAFT: TimerSetupDraft = {
  durationSeconds: 10 * 60,
  timeCapSeconds: undefined,
  targetRounds: undefined,
  intervalSeconds: 60,
  rounds: 10,
  workSeconds: 20,
  restSeconds: 10,
  workoutNotes: '',
  presetName: '',
}

/** Which mode and preset a draft belongs to, encoded as one family key. */
export interface TimerSetupTarget {
  readonly mode: TimerMode
  readonly presetId: string | undefined
}

export const setupKey = (target: TimerSetupTarget): string =>
  `${target.mode}:${target.presetId ?? ''}`

const TIMER_MODES: ReadonlyArray<string> = ['amrap', 'forTime', 'emom', 'tabata']

/**
 * The mode being set up, from `/timer/:mode`. An unknown mode falls back to
 * AMRAP rather than rendering nothing — a hand-typed URL should still show a
 * usable screen.
 */
export const setupModeAtom = Atom.make((get): TimerMode => {
  const mode = get(routeParamAtom('mode'))
  return mode !== undefined && TIMER_MODES.includes(mode) ? (mode as TimerMode) : 'amrap'
})

/** The preset being edited, from `?preset=…`. */
export const setupPresetIdAtom = routeQueryAtom('preset')

export const setupKeyAtom = Atom.make((get) =>
  setupKey({ mode: get(setupModeAtom), presetId: get(setupPresetIdAtom) }),
)

const parseKey = (key: string): TimerSetupTarget => {
  const separator = key.indexOf(':')
  const presetId = key.slice(separator + 1)
  return {
    mode: key.slice(0, separator) as TimerMode,
    presetId: presetId === '' ? undefined : presetId,
  }
}

function applyConfig(draft: TimerSetupDraft, config: TimerConfig): TimerSetupDraft {
  switch (config.mode) {
    case 'amrap':
      return { ...draft, durationSeconds: config.durationMs / SECOND_MS }
    case 'forTime':
      return {
        ...draft,
        timeCapSeconds: config.timeCapMs === undefined ? undefined : config.timeCapMs / SECOND_MS,
        targetRounds: config.targetRounds,
      }
    case 'emom':
      return {
        ...draft,
        intervalSeconds: config.intervalMs / SECOND_MS,
        rounds: config.rounds,
      }
    case 'tabata':
      return {
        ...draft,
        workSeconds: config.workMs / SECOND_MS,
        restSeconds: config.restMs / SECOND_MS,
        rounds: config.rounds,
      }
  }
}

const defaultDraft = (mode: TimerMode): TimerSetupDraft =>
  applyConfig(BASE_DRAFT, DEFAULT_CONFIGS[mode])

const draftFromPreset = (preset: TimerPreset): TimerSetupDraft => ({
  ...applyConfig(BASE_DRAFT, preset.config),
  workoutNotes: preset.workoutNotes,
  presetName: preset.name,
})

/**
 * What the form shows before anyone touches it: the preset's saved values, or
 * the mode's defaults when there is no preset — or when its row has not
 * arrived yet, since `presetListAtom` reads IndexedDB and answers `[]` until
 * it resolves. A derivation rather than a seeding step, so a preset that
 * arrives late simply changes the answer.
 */
const setupSeedAtom = Atom.family((key: string) =>
  Atom.make((get): TimerSetupDraft => {
    const { mode, presetId } = parseKey(key)
    if (presetId === undefined) return defaultDraft(mode)

    const preset = get(presetListAtom).find((item) => item.id === presetId)
    return preset === undefined || preset.config.mode !== mode
      ? defaultDraft(mode)
      : draftFromPreset(preset)
  }),
)

/** What the user typed, or `undefined` while they have typed nothing. */
const setupEditAtom = Atom.family((_key: string) =>
  Atom.make<TimerSetupDraft | undefined>(undefined),
)

/**
 * The draft itself, one per `mode:presetId`: the edit if there is one, the
 * seed otherwise.
 *
 * Stating the rule as two atoms rather than as a `seeded` flag is what keeps
 * it registry-scoped. A family memoizes one atom object per key at module
 * scope, shared by every registry — so a flag in the factory's closure would
 * be shared too, and a second registry opening the same preset would find it
 * already "seeded" and show the mode defaults instead of the saved values.
 * Neither atom is `keepAlive`, so both are dropped when the screen unmounts
 * and coming back re-reads what was actually saved.
 */
export const setupDraftAtom = Atom.family((key: string) =>
  Atom.writable<TimerSetupDraft, TimerSetupDraft>(
    (get) => get(setupEditAtom(key)) ?? get(setupSeedAtom(key)),
    (ctx, draft) => ctx.set(setupEditAtom(key), draft),
  ),
)

export function toTimerConfig(mode: TimerMode, draft: TimerSetupDraft): TimerConfig {
  switch (mode) {
    case 'amrap':
      return { mode: 'amrap', durationMs: Math.round(draft.durationSeconds * SECOND_MS) }
    case 'forTime':
      return {
        mode: 'forTime',
        ...(draft.timeCapSeconds === undefined || draft.timeCapSeconds === 0
          ? {}
          : { timeCapMs: Math.round(draft.timeCapSeconds * SECOND_MS) }),
        ...(draft.targetRounds === undefined || draft.targetRounds === 0
          ? {}
          : { targetRounds: Math.round(draft.targetRounds) }),
      }
    case 'emom':
      return {
        mode: 'emom',
        intervalMs: Math.round(draft.intervalSeconds * SECOND_MS),
        rounds: Math.round(draft.rounds),
      }
    case 'tabata':
      return {
        mode: 'tabata',
        workMs: Math.round(draft.workSeconds * SECOND_MS),
        restMs: Math.round(draft.restSeconds * SECOND_MS),
        rounds: Math.round(draft.rounds),
      }
  }
}

export const setupConfigAtom = Atom.family((key: string) =>
  Atom.make((get) => toTimerConfig(parseKey(key).mode, get(setupDraftAtom(key)))),
)

export const setupPresetDraftAtom = Atom.family((key: string) =>
  Atom.make((get): PresetDraft => {
    const draft = get(setupDraftAtom(key))
    return {
      name: draft.presetName,
      config: get(setupConfigAtom(key)),
      workoutNotes: draft.workoutNotes,
    }
  }),
)

export const setupValidConfigAtom = Atom.family((key: string) =>
  Atom.map(setupConfigAtom(key), isTimerConfig),
)

export const setupValidPresetAtom = Atom.family((key: string) =>
  Atom.make(
    (get) => get(setupValidConfigAtom(key)) && isPresetDraft(get(setupPresetDraftAtom(key))),
  ),
)

/**
 * Picker options.
 *
 * Plain functions rather than atoms: the labels are translations, so these
 * depend on the active locale as much as on the value, and building the list
 * is an array map over at most a few dozen numbers. Called from the template,
 * they re-run exactly when the screen re-renders.
 */
const optionsFor = (
  values: ReadonlyArray<number>,
  selected: number | undefined,
  label: (value: number) => string,
): Array<PickerOption> =>
  includeSelectedValue(values, selected).map((value) => ({ value, label: label(value) }))

export const durationOptions = (
  selected: number | undefined,
  formatTime: (seconds: number) => string,
): Array<PickerOption> => optionsFor(DURATION_VALUES, selected, formatTime)

export const intervalOptions = (
  selected: number | undefined,
  formatTime: (seconds: number) => string,
): Array<PickerOption> => optionsFor(INTERVAL_VALUES, selected, formatTime)

export const restOptions = (
  selected: number | undefined,
  formatTime: (seconds: number) => string,
): Array<PickerOption> => optionsFor([0, ...INTERVAL_VALUES], selected, formatTime)

export const roundOptions = (selected: number | undefined): Array<PickerOption> =>
  optionsFor(ROUND_VALUES, selected, String)
