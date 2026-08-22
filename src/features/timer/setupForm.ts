import { Atom } from '@effect/atom-vue'
import { isPresetDraft } from '@/db'
import {
  DEFAULT_CIRCUIT_BLOCKS,
  DEFAULT_CONFIGS,
  isTimerConfig,
  MAX_CIRCUIT_BLOCKS,
  parseTimerMode,
  SECOND_MS,
  TIMER_MODES,
} from '@/features/timer/domain'
import {
  countValues,
  pickerOptions,
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
 *
 * It also drops the "wait until the presets have settled" clause the watcher
 * needed. A seed that is *derived* has nothing to defer: while the table is
 * still loading the answer is the mode's defaults, and the row arriving simply
 * changes the answer — unless the user has typed, in which case the edit atom
 * is what the draft reads and the arrival is invisible.
 */
/** One circuit block as the editor binds it — seconds, because the inputs are. */
export interface CircuitBlockDraft {
  readonly label: string
  readonly kind: 'work' | 'rest'
  readonly durationSeconds: number
}

export interface TimerSetupDraft {
  readonly durationSeconds: number
  readonly timeCapSeconds: number | undefined
  readonly targetRounds: number | undefined
  readonly intervalSeconds: number
  readonly rounds: number
  readonly workSeconds: number
  readonly restSeconds: number
  readonly blocks: ReadonlyArray<CircuitBlockDraft>
  readonly repeat: number
  readonly workoutNotes: string
  readonly presetName: string
}

/** Every field at nothing, before any mode has had its say. */
const NOTHING_SET: TimerSetupDraft = {
  durationSeconds: 0,
  timeCapSeconds: undefined,
  targetRounds: undefined,
  intervalSeconds: 0,
  rounds: 0,
  workSeconds: 0,
  restSeconds: 0,
  blocks: [],
  repeat: 0,
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

/**
 * The mode being set up, from `/timer/:mode`. An unknown mode falls back to
 * AMRAP rather than rendering nothing — a hand-typed URL should still show a
 * usable screen. `parseTimerMode` is what decides, so the list of modes lives
 * with `DEFAULT_CONFIGS` and a fifth one cannot go missing here.
 */
export const setupModeAtom = Atom.make(
  (get): TimerMode => parseTimerMode(get(routeParamAtom('mode'))) ?? 'amrap',
)

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

/** The fields a config has an opinion about, in seconds. The rest are left alone. */
export function applyConfigToDraft(draft: TimerSetupDraft, config: TimerConfig): TimerSetupDraft {
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
    case 'custom':
      return {
        ...draft,
        blocks: config.blocks.map((block) => ({
          label: block.label,
          kind: block.kind,
          durationSeconds: block.durationMs / SECOND_MS,
        })),
        repeat: config.repeat,
      }
  }
}

/**
 * Every field holding its own mode's default, folded out of `DEFAULT_CONFIGS`
 * rather than written out again — the numbers have one home.
 *
 * The fields are flat and shared rather than one set per mode, which is why
 * applying a config *patches* them: an AMRAP config has nothing to say about
 * Tabata's rest, and should not reset it. Where two modes share a field
 * (`rounds`), the last one folded wins; it does not matter which, because
 * `defaultDraft` applies the mode actually on screen last.
 */
export const BASE_DRAFT: TimerSetupDraft = TIMER_MODES.reduce<TimerSetupDraft>(
  (draft, mode) => applyConfigToDraft(draft, DEFAULT_CONFIGS[mode]),
  NOTHING_SET,
)

const defaultDraft = (mode: TimerMode): TimerSetupDraft =>
  applyConfigToDraft(BASE_DRAFT, DEFAULT_CONFIGS[mode])

const draftFromPreset = (preset: TimerPreset): TimerSetupDraft => ({
  ...applyConfigToDraft(BASE_DRAFT, preset.config),
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

/**
 * The form read back as the config for one mode. The other modes' fields are
 * ignored, so what the user set for Tabata does not leak into the AMRAP they
 * are about to start.
 *
 * A zero-valued optional means "not set" — the For Time pickers offer an empty
 * option, and an empty option that produced `timeCapMs: 0` would be a workout
 * that ends the instant it starts. The test is `undefined` or `0` and not
 * falsiness on purpose: any other unusable value has to reach the config, so
 * that `isTimerConfig` can refuse it out loud rather than have it read as
 * "no cap" and start an uncapped workout.
 */
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
    case 'custom':
      return {
        mode: 'custom',
        blocks: draft.blocks.map((block) => ({
          label: block.label,
          kind: block.kind,
          durationMs: Math.round(block.durationSeconds * SECOND_MS),
        })),
        repeat: Math.round(draft.repeat),
      }
  }
}

/**
 * Block-list edits, as pure functions over the draft's array. The editor emits
 * a whole new list per gesture — an edit is a replacement, like every other
 * draft field. Out-of-range indices return the list unchanged: a tap that
 * raced a removal is a no-op, not a crash.
 */
export function appendCircuitBlock(
  blocks: ReadonlyArray<CircuitBlockDraft>,
  kind: CircuitBlockDraft['kind'],
): ReadonlyArray<CircuitBlockDraft> {
  if (blocks.length >= MAX_CIRCUIT_BLOCKS) return blocks
  const template = DEFAULT_CIRCUIT_BLOCKS[kind]
  return [
    ...blocks,
    { label: template.label, kind, durationSeconds: template.durationMs / SECOND_MS },
  ]
}

export function updateCircuitBlock(
  blocks: ReadonlyArray<CircuitBlockDraft>,
  index: number,
  patch: Partial<CircuitBlockDraft>,
): ReadonlyArray<CircuitBlockDraft> {
  return blocks.map((block, at) => (at === index ? { ...block, ...patch } : block))
}

export function removeCircuitBlock(
  blocks: ReadonlyArray<CircuitBlockDraft>,
  index: number,
): ReadonlyArray<CircuitBlockDraft> {
  return blocks.filter((_, at) => at !== index)
}

/** An adjacent swap, so the lookups are the bounds check. */
export function moveCircuitBlock(
  blocks: ReadonlyArray<CircuitBlockDraft>,
  from: number,
  offset: -1 | 1,
): ReadonlyArray<CircuitBlockDraft> {
  const to = from + offset
  const moved: CircuitBlockDraft | undefined = blocks[from]
  const displaced: CircuitBlockDraft | undefined = blocks[to]
  if (moved === undefined || displaced === undefined) return blocks
  return blocks.map((block, at) => (at === from ? displaced : at === to ? moved : block))
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
 * Picker options: which values each field offers, labelled.
 *
 * Plain functions rather than atoms — the labels are translations, so these
 * depend on the active locale as much as on the value, and building the list
 * is an array map over at most a few dozen numbers. Called from the template,
 * they re-run exactly when the screen re-renders.
 *
 * The rule itself (fold in the selected value, then label every value) is
 * `pickerOptions` in `./pickerOptions`, beside the functions that build the
 * value lists. This module used to carry a private copy of it, which meant the
 * exported one was reachable only from its own spec — a duplicate that could
 * not drift *visibly*, since nothing shipped ran the version being tested.
 */
export const durationOptions = (
  selected: number | undefined,
  formatTime: (seconds: number) => string,
): Array<PickerOption> => pickerOptions(DURATION_VALUES, selected, formatTime)

export const intervalOptions = (
  selected: number | undefined,
  formatTime: (seconds: number) => string,
): Array<PickerOption> => pickerOptions(INTERVAL_VALUES, selected, formatTime)

/** Rest is the one duration that may legitimately be none: an EMOM-style Tabata. */
export const restOptions = (
  selected: number | undefined,
  formatTime: (seconds: number) => string,
): Array<PickerOption> => pickerOptions([0, ...INTERVAL_VALUES], selected, formatTime)

export const roundOptions = (selected: number | undefined): Array<PickerOption> =>
  pickerOptions(ROUND_VALUES, selected, String)
