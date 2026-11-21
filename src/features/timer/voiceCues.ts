import type { TimerConfig, TimerMode, WorkoutSession } from '@/db'
import {
  boxingThemeAt,
  capturesRoundSplits,
  MINUTE_MS,
  SECOND_MS,
  type BoxingTheme,
  type DerivedTimer,
} from '@/features/timer/domain'

/** How many "Round N" clips ship in `public/voice`; later rounds fall back to "Go". */
const SPOKEN_ROUNDS = 20

const ROUND_CUES = Array.from(
  { length: SPOKEN_ROUNDS },
  (_, index) => `round-${index + 1}` as const,
)

/**
 * The boxing combinations, as whole recorded phrases — "Jab, cross, hook" —
 * rather than single punches stitched together, which sounds like a machine
 * reading a list. None is longer than four punches: past that a call stops
 * being something to throw and becomes something to remember.
 *
 * The basics use only the jab, the cross and the hook, and hold the
 * combinations every coaching guide teaches first: the one-two, the double
 * jab-cross, jab-cross-hook, jab-cross-hook-cross, cross-hook-cross. The
 * advanced set adds uppercuts, body shots, slips and rolls — among them the
 * two classic uppercut variations, jab-uppercut-hook-cross and
 * jab-cross-uppercut-cross.
 */
const BASIC_COMBOS = [
  'combo-01',
  'combo-02',
  'combo-03',
  'combo-04',
  'combo-05',
  'combo-06',
  'combo-07',
  'combo-08',
  'combo-09',
  'combo-10',
  'combo-11',
  'combo-12',
  'combo-27',
  'combo-28',
  'combo-30',
] as const
const ADVANCED_COMBOS = [
  'combo-13',
  'combo-14',
  'combo-15',
  'combo-16',
  'combo-17',
  'combo-18',
  'combo-19',
  'combo-20',
  'combo-21',
  'combo-22',
  'combo-23',
  'combo-24',
  'combo-25',
  'combo-26',
  'combo-29',
] as const

type ComboCue = (typeof BASIC_COMBOS)[number] | (typeof ADVANCED_COMBOS)[number]
/** The same combination called by punch number: `combo-05` is also `num-05`. */
type NumberCue = ComboCue extends `combo-${infer Index}` ? `num-${Index}` : never

function asNumbers(cue: ComboCue): NumberCue {
  // SAFETY: every `combo-NN` has a `num-NN` clip — `NumberCue` is derived from
  // `ComboCue` by that exact rewrite, which `slice` performs on the value.
  return `num-${cue.slice('combo-'.length)}` as NumberCue
}

const NUMBER_COMBOS = [...BASIC_COMBOS, ...ADVANCED_COMBOS].map(asNumbers)

/** How each themed round opens, a beat after "Round four". */
const THEME_INTROS = ['theme-warmup', 'theme-power', 'theme-speed', 'theme-endurance'] as const
/** "Next round: speed." — said into the rest, so the athlete knows before the bell. */
const NEXT_UP = [
  'next-combos',
  'next-warmup',
  'next-power',
  'next-speed',
  'next-endurance',
] as const
/** The two halves of a speed round: sprint, then recover. */
const SPEED_CALLS = ['fast-hands', 'easy-breathe'] as const

/** One entry per file in `public/voice` — the loader fetches exactly this list. */
export const VOICE_CUES = [
  'get-ready',
  'go',
  'rest',
  'halfway',
  'one-minute',
  'thirty-seconds',
  'ten-seconds',
  'three',
  'two',
  'one',
  'last-round',
  'complete',
  ...ROUND_CUES,
  ...BASIC_COMBOS,
  ...ADVANCED_COMBOS,
  ...NUMBER_COMBOS,
  ...THEME_INTROS,
  ...NEXT_UP,
  ...SPEED_CALLS,
] as const

export type VoiceCue = (typeof VOICE_CUES)[number]

/** The lines called *inside* a boxing round — the ones the screen also shows as text. */
export type CallCue =
  | (typeof BASIC_COMBOS)[number]
  | (typeof ADVANCED_COMBOS)[number]
  | (typeof SPEED_CALLS)[number]

/** The clip for a 3-2-1 tick. */
export function countdownVoiceCue(second: number): VoiceCue | undefined {
  if (second === 3) return 'three'
  if (second === 2) return 'two'
  return second === 1 ? 'one' : undefined
}

/** A phase shorter than this never hears "Halfway": it would land on the ten-second call. */
const HALFWAY_MIN_MS = 40 * SECOND_MS
/** "One minute left" only where a minute is the home stretch, not half the phase. */
const ONE_MINUTE_MIN_MS = 3 * MINUTE_MS
/** A 10-second rest starts at ten seconds — announcing it would talk over "Rest". */
const TEN_SECONDS_MIN_MS = 20 * SECOND_MS
/** A longer start countdown than this has room for "Get ready" before the 3-2-1. */
const GET_READY_MIN_MS = 4 * SECOND_MS

/**
 * The full length of the phase `state` is in, recovered from what is left of
 * it and how far through it is. Rounded to the second because `progress` is a
 * ratio of two clock readings.
 */
function phaseDurationMs(remainingMs: number, progress: number): number | undefined {
  if (progress >= 1) return undefined
  return Math.round(remainingMs / (1 - progress) / SECOND_MS) * SECOND_MS
}

type BoxingConfig = Extract<TimerConfig, { mode: 'boxing' }>

type Callouts = BoxingConfig['callouts']

const COMBO_POOLS = {
  off: [],
  basic: BASIC_COMBOS,
  advanced: [...BASIC_COMBOS, ...ADVANCED_COMBOS],
} satisfies Readonly<Record<Callouts, ReadonlyArray<CallCue>>>

/**
 * What the coach does inside a round of each theme — a row of data rather
 * than a branch per theme, so a sixth theme is one more row.
 *
 * A themed round is explained once, at the bell, and then left alone: the
 * athlete knows the job and hears only the time. Calling a combination every
 * few seconds on top of that turns a power round back into a freestyle one.
 * So only two rows have a `pool` — the unthemed `combos` round, which *is*
 * the calls, and `speed`, whose sprints nobody can time by feel.
 *
 * - `intro` opens the round, a beat after its number: what to do, in a sentence.
 * - `pool` is what she calls from, and `everyMs` how often; without one the
 *   athlete's chosen pace applies.
 * - `alternate` walks the pool in order instead of picking: a speed round is
 *   "fast" then "easy" then "fast", never two sprints running.
 * - `offsetMs` shifts the slots off the round's own marks. A slot that lands
 *   on "Halfway" is dropped, which a random pool shrugs off — but an
 *   alternating one would lose every other sprint, because the half, the
 *   last minute and the last thirty seconds all fall on the same beat.
 */
interface ThemePlan {
  readonly intro?: VoiceCue
  readonly next: VoiceCue
  readonly pool?: (callouts: Callouts) => ReadonlyArray<CallCue>
  readonly everyMs?: number
  readonly offsetMs?: number
  readonly alternate?: true
}

const THEME_PLANS = {
  combos: { next: 'next-combos', pool: (callouts) => COMBO_POOLS[callouts] },
  warmup: { intro: 'theme-warmup', next: 'next-warmup' },
  power: { intro: 'theme-power', next: 'next-power' },
  speed: {
    intro: 'theme-speed',
    next: 'next-speed',
    pool: () => SPEED_CALLS,
    everyMs: 15 * SECOND_MS,
    offsetMs: 7 * SECOND_MS,
    alternate: true,
  },
  endurance: { intro: 'theme-endurance', next: 'next-endurance' },
} satisfies Readonly<Record<BoxingTheme, ThemePlan>>

/** The plan for one round. A freestyle session is all `combos`. */
function planFor(config: BoxingConfig, round: number): ThemePlan {
  return THEME_PLANS[boxingThemeAt(config.themes, round) ?? 'combos']
}

/** When a round's opening line starts — after "Round four" has been said. */
const INTRO_AT_MS = 1_500
/** And how long it is given before the first call may follow it: it is a whole sentence. */
const INTRO_ROOM_MS = 10 * SECOND_MS
/** "Next round: speed" comes this far into a rest, after "Rest" itself. */
const NEXT_UP_AT_MS = 3 * SECOND_MS
/** A rest shorter than this is over before the announcement would help. */
const NEXT_UP_MIN_REST_MS = 15 * SECOND_MS

/** "Thirty seconds, push!" — the bell before the bell, in rounds long enough to have one. */
const THIRTY_SECONDS_MS = 30 * SECOND_MS
const THIRTY_SECONDS_MIN_MS = 90 * SECOND_MS
/** Room a combination needs before a time call, and after one, to be heard whole. */
const CALLOUT_LEAD_MS = 4 * SECOND_MS
const CALLOUT_TRAIL_MS = 2 * SECOND_MS

/** FNV-1a, 32 bit. Only its spread matters: it turns a slot's name into a pick. */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 0x01000193)
  }
  return value >>> 0
}

/** The remaining-time marks the coach speaks at in a phase `durationMs` long. */
function timeMarks(durationMs: number, boxing: boolean): ReadonlyArray<number> {
  return [
    ...(durationMs >= HALFWAY_MIN_MS ? [durationMs / 2] : []),
    ...(durationMs >= ONE_MINUTE_MIN_MS ? [MINUTE_MS] : []),
    ...(boxing && durationMs >= THIRTY_SECONDS_MIN_MS ? [THIRTY_SECONDS_MS] : []),
    ...(durationMs >= TEN_SECONDS_MIN_MS ? [10 * SECOND_MS] : []),
  ]
}

/** How many slots in a row get the same combination before the coach moves on. */
const COMBO_REPEATS = 3

/**
 * The combination for one slot of one round. A combination is called
 * `COMBO_REPEATS` times running: once to hear it, once to throw it properly,
 * once to throw it hard. A new call every few seconds is a memory test, not
 * bag work.
 *
 * Picked by hashing the set's name rather than by `Math.random`, so the timer
 * stays a function of the session and the clock: a reload mid-round calls the
 * same sequence, and a test can name the line it expects. A set that would
 * repeat the one before it takes the next line instead.
 */
function comboAt(sessionId: string, round: number, slot: number, pool: ReadonlyArray<CallCue>) {
  const pick = (at: number): number => hash(`${sessionId}:${round}:${at}`) % pool.length
  // Slots count from 1 — the bell itself is never a call.
  const set = Math.floor((slot - 1) / COMBO_REPEATS)
  const index = pick(set)
  return pool[index === pick(set - 1) ? (index + 1) % pool.length : index]
}

/**
 * The call that belongs to the slot `left` milliseconds from the end of a
 * boxing round falls in, if that slot has one.
 *
 * Slots are a fixed interval apart from the bell. The first has none — the
 * coach is still saying "Round three" — and neither does any slot that would
 * talk over the round's opening line, a time call, or the closing ten seconds.
 */
/** A slot of a round, and the call that belongs to it — if it has one. */
interface SlotCall {
  readonly slot: number
  readonly cue: CallCue | undefined
}

function callInSlot(
  session: CueSession,
  config: BoxingConfig,
  round: number,
  left: number,
): SlotCall {
  const plan = planFor(config, round)
  const everyMs = plan.everyMs ?? config.paceMs
  const offsetMs = plan.offsetMs ?? 0
  const slot = Math.floor((config.workMs - left - offsetMs) / everyMs)
  const silent = { slot, cue: undefined }
  // "Off" silences the calls inside a round, whatever its theme; the theme is
  // still announced, so a quiet session keeps its structure. And most themes
  // have no calls to silence.
  if (config.callouts === 'off' || plan.pool === undefined || slot < 1) return silent
  const slotElapsed = offsetMs + slot * everyMs
  if (plan.intro !== undefined && slotElapsed < INTRO_ROOM_MS) return silent

  const slotStart = config.workMs - slotElapsed
  // The closing seconds belong to "Ten seconds" and the 3-2-1.
  if (slotStart < 10 * SECOND_MS + CALLOUT_LEAD_MS) return silent
  const crowded = timeMarks(config.workMs, true).some(
    (mark) => slotStart - mark < CALLOUT_LEAD_MS && mark - slotStart < CALLOUT_TRAIL_MS,
  )
  if (crowded) return silent
  const pool = plan.pool(config.callouts)
  return {
    slot,
    cue: plan.alternate ? pool[slot % pool.length] : comboAt(session.id, round, slot, pool),
  }
}

/** The call due as a round moves from `before` to `left` remaining: a slot was just entered. */
function roundCall(
  session: CueSession,
  config: BoxingConfig,
  round: number,
  before: number,
  left: number,
): VoiceCue | undefined {
  const now = callInSlot(session, config, round, left)
  if (now.slot === callInSlot(session, config, round, before).slot) return undefined
  const { cue } = now
  // The sprint calls have no number; everything else in a round is a combination.
  if (cue === undefined || cue === 'fast-hands' || cue === 'easy-breathe') return cue
  return config.callsAs === 'numbers' ? asNumbers(cue) : cue
}

/** Which hand throws a punch, by stance rather than by side: the jab hand, or the power hand. */
type Hand = 'lead' | 'rear'
/** One word of a call as the screen shows it, with the hand that throws it where it is a punch. */
/**
 * `number` is the same step in the gym's punch numbers, for a right-hander:
 * 1 jab, 2 cross, 3 lead hook, 5 lead uppercut, 6 rear uppercut. A slip or a
 * roll has none and is called by name either way.
 */
type CallStep = readonly [label: string, hand?: Hand, number?: string]

const JAB = ['Jab', 'lead', '1'] as const
const DOUBLE_JAB = ['Double jab', 'lead', '1 · 1'] as const
const CROSS = ['Cross', 'rear', '2'] as const
/** The hook is the lead hand's punch unless a call says otherwise; none here does. */
const HOOK = ['Hook', 'lead', '3'] as const
const LEAD_UPPERCUT = ['Uppercut', 'lead', '5'] as const
const REAR_UPPERCUT = ['Uppercut', 'rear', '6'] as const
const BODY_JAB = ['Jab to the body', 'lead', '1 body'] as const
const BODY_HOOK = ['Hook to the body', 'lead', '3 body'] as const
const SLIP = ['Slip'] as const
const ROLL = ['Roll'] as const

/**
 * What each call says, word for word, and which hand throws each punch.
 *
 * The voice says "Cross, hook, cross" and leaves the hands to the athlete,
 * which is exactly what a beginner cannot work out mid-round. The hands
 * follow the one rule of combination punching — they alternate — so an
 * uppercut is whichever hand the punch before it did not use.
 *
 * The words are English in every locale, because they are what the athlete
 * just heard: a translation beside an English voice would be two instructions.
 */
const CALL_STEPS = {
  'combo-01': [JAB],
  'combo-02': [DOUBLE_JAB],
  'combo-03': [JAB, CROSS],
  'combo-04': [DOUBLE_JAB, CROSS],
  'combo-05': [JAB, CROSS, HOOK],
  'combo-06': [JAB, CROSS, JAB],
  'combo-07': [CROSS, HOOK, CROSS],
  'combo-08': [JAB, HOOK],
  'combo-09': [JAB, CROSS, HOOK, CROSS],
  'combo-10': [HOOK, CROSS],
  'combo-11': [JAB, CROSS, JAB, CROSS],
  'combo-12': [DOUBLE_JAB, CROSS, HOOK],
  'combo-13': [JAB, CROSS, LEAD_UPPERCUT],
  'combo-14': [JAB, REAR_UPPERCUT, HOOK],
  'combo-15': [BODY_JAB, CROSS],
  'combo-16': [JAB, CROSS, SLIP, CROSS],
  'combo-17': [JAB, CROSS, ROLL, HOOK],
  'combo-18': [CROSS, BODY_HOOK],
  'combo-19': [SLIP, CROSS, HOOK],
  'combo-20': [REAR_UPPERCUT, HOOK, CROSS],
  'combo-21': [JAB, CROSS, BODY_HOOK],
  'combo-22': [DOUBLE_JAB, CROSS, ROLL],
  'combo-23': [JAB, CROSS, HOOK, REAR_UPPERCUT],
  'combo-24': [ROLL, HOOK, CROSS],
  'combo-25': [JAB, REAR_UPPERCUT, HOOK, CROSS],
  'combo-26': [JAB, CROSS, LEAD_UPPERCUT, CROSS],
  'combo-27': [JAB, HOOK, CROSS],
  'combo-28': [HOOK, CROSS, HOOK],
  'combo-29': [JAB, CROSS, BODY_HOOK, HOOK],
  'combo-30': [CROSS, HOOK, CROSS, HOOK],
  'fast-hands': [['Fast hands']],
  'easy-breathe': [['Easy'], ['Breathe']],
} satisfies Readonly<Record<CallCue, ReadonlyArray<CallStep>>>

/** A step ready to draw: its words, and the side that throws it. */
export interface ShownStep {
  readonly label: string
  readonly side: 'L' | 'R' | undefined
}

/** A right-hander's stance: left foot and left hand forward. */
const SIDES = { lead: 'L', rear: 'R' } as const

/**
 * A call as the screen shows it — "Cross R · Hook L · Cross R", or in the
 * numbers the voice is using, "2 R · 3 L · 2 R". Empty for no call.
 */
export function callSteps(
  cue: CallCue | '',
  callsAs: BoxingConfig['callsAs'] = 'names',
): ReadonlyArray<ShownStep> {
  if (cue === '') return []
  const steps: ReadonlyArray<CallStep> = CALL_STEPS[cue]
  return steps.map(([label, hand, number]) => ({
    label: callsAs === 'numbers' ? (number ?? label) : label,
    side: hand === undefined ? undefined : SIDES[hand],
  }))
}

/** How this workout's combinations are called — and so how the screen should write them. */
export function callStyleOf(session: CueSession): BoxingConfig['callsAs'] {
  return session.config.mode === 'boxing' ? session.config.callsAs : 'names'
}

/**
 * The call the athlete is working on right now — on screen from the moment
 * it is spoken until the next one replaces it. A glance between punches
 * should confirm what the ear caught, and catch what it missed.
 *
 * Read off the same slot the voice reads, so the two cannot disagree; and a
 * function of the reading alone, so a reload mid-round shows it at once.
 *
 * Empty while a boxing round has nothing called — its opening seconds, the
 * moments a time call owns, a themed round that is explained once and then
 * left to the athlete — and `undefined` when there is no boxing round.
 */
export function currentCall(state: DerivedTimer, session: CueSession): CallCue | '' | undefined {
  const { config } = session
  if (config.mode !== 'boxing' || state.phase !== 'work' || state.remainingMs === undefined) {
    return undefined
  }
  return callInSlot(session, config, state.round, state.remainingMs).cue ?? ''
}

/**
 * The line that frames a boxing round rather than fills it: its opening,
 * a beat after the bell, and — into the rest before it — what is coming.
 * Only a themed session has either; freestyle rounds are all alike.
 */
function themeCue(
  config: BoxingConfig,
  state: DerivedTimer,
  before: number,
  left: number,
): VoiceCue | undefined {
  if (config.themes.length === 0) return undefined
  const crossed = (elapsedMs: number, durationMs: number): boolean =>
    before > durationMs - elapsedMs && left <= durationMs - elapsedMs

  if (state.phase === 'work') {
    return crossed(INTRO_AT_MS, config.workMs) ? planFor(config, state.round).intro : undefined
  }
  return config.restMs >= NEXT_UP_MIN_REST_MS && crossed(NEXT_UP_AT_MS, config.restMs)
    ? planFor(config, state.round + 1).next
    : undefined
}

/** What the coach needs to know about the workout: which one, and how it was set up. */
export type CueSession = Pick<WorkoutSession, 'id' | 'config'>

function workStartCue(previous: DerivedTimer, state: DerivedTimer, mode: TimerMode): VoiceCue {
  if (capturesRoundSplits(mode) || state.totalRounds === undefined) return 'go'
  // A circuit can hold several work blocks per pass: only the first is a round.
  const startsRound = previous.phase === 'countdown' || previous.round !== state.round
  if (!startsRound) return 'go'
  if (state.totalRounds > 1 && state.round === state.totalRounds) return 'last-round'
  return ROUND_CUES[state.round - 1] ?? 'go'
}

/**
 * What the coach says as the timer moves from `previous` to `state`, if
 * anything. At most one line per tick, and never one that overlaps another:
 * the thresholds above keep "Halfway", "One minute left" and "Ten seconds"
 * apart from each other and from the phase announcements.
 *
 * A boxing round adds a second layer underneath: she opens it with what it
 * is for, and with nothing else to say calls what its theme asks for.
 *
 * The 3-2-1 and the finish are not here — the driver already owns those
 * moments and hands them their clips directly.
 */
export function voiceCueFor(
  previous: DerivedTimer | undefined,
  state: DerivedTimer,
  session: CueSession,
): VoiceCue | undefined {
  const { config } = session
  const { mode } = config
  if (state.phase === 'finished') return undefined
  if (previous === undefined) {
    return state.phase === 'countdown' && (state.remainingMs ?? 0) > GET_READY_MIN_MS
      ? 'get-ready'
      : undefined
  }

  if (previous.phase !== state.phase) {
    return state.phase === 'rest' ? 'rest' : workStartCue(previous, state, mode)
  }
  if (previous.round !== state.round) {
    // In AMRAP and For Time a new round is a tap, which cues itself.
    return capturesRoundSplits(mode) ? undefined : workStartCue(previous, state, mode)
  }

  // `remainingMs`, not `primaryMs`: For Time counts up, and uncapped it has no
  // boundary to count towards at all.
  const before = previous.remainingMs
  const left = state.remainingMs
  if (state.phase === 'countdown' || before === undefined || left === undefined) return undefined
  const duration = phaseDurationMs(left, state.progress)
  if (duration === undefined) return undefined
  const crossed = (thresholdMs: number): boolean => before > thresholdMs && left <= thresholdMs

  const boxing = config.mode === 'boxing'
  if (duration >= HALFWAY_MIN_MS && crossed(duration / 2)) return 'halfway'
  if (duration >= ONE_MINUTE_MIN_MS && crossed(MINUTE_MS)) return 'one-minute'
  if (boxing && duration >= THIRTY_SECONDS_MIN_MS && crossed(THIRTY_SECONDS_MS)) {
    return 'thirty-seconds'
  }
  if (duration >= TEN_SECONDS_MIN_MS && crossed(10 * SECOND_MS)) return 'ten-seconds'
  if (config.mode !== 'boxing') return undefined
  return (
    themeCue(config, state, before, left) ??
    (state.phase === 'work' ? roundCall(session, config, state.round, before, left) : undefined)
  )
}
