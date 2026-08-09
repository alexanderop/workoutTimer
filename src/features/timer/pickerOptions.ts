export interface PickerOption {
  readonly value: number
  readonly label: string
}

export interface SteppedRange {
  readonly from: number
  readonly to: number
  readonly step: number
}

/**
 * Every value the ranges cover, deduplicated and ascending.
 *
 * Exported for its own spec. `timerDurationValues` hands it bands that are
 * already ordered and disjoint, so through that caller the sort and the `Set`
 * can never be seen to do anything — and a helper whose contract is only
 * exercised by accident is one somebody widens without noticing.
 */
export function steppedValues(ranges: ReadonlyArray<SteppedRange>): Array<number> {
  const values = new Set<number>()

  for (const { from, to, step } of ranges) {
    for (let value = from; value <= to; value += step) values.add(value)
  }

  return [...values].sort((left, right) => left - right)
}

/**
 * The duration picker's chips: fine near the bottom, where a workout actually
 * lives, and coarser above.
 *
 * The three bands describe the *shape* of the list and the trailing filter
 * applies the caller's bounds — once, to the result. Each band used to carry
 * its own `Math.min(…, maxSeconds)` as well, which said the same thing a
 * second time: a band capped at its own end can never emit a value the filter
 * would keep, so the two spellings could never disagree, and a test could not
 * tell which of them was doing the work.
 */
export function timerDurationValues(maxSeconds: number, minimumSeconds = 5): Array<number> {
  const firstQuarterMinute = Math.ceil(minimumSeconds / 15) * 15

  return steppedValues([
    { from: firstQuarterMinute, to: 60 * 60, step: 15 },
    { from: 65 * 60, to: 3 * 60 * 60, step: 5 * 60 },
    // Stryker disable next-line ArithmeticOperator: starting this band a step
    // *earlier* (2h45m) is an equivalent mutant — 9,900 and 10,800 are both
    // already on the 5-minute band above, so the union is unchanged. The `+`
    // stays because the band begins one step after the one it follows, which
    // is the rule, not because subtracting would show.
    { from: 3 * 60 * 60 + 15 * 60, to: maxSeconds, step: 15 * 60 },
  ]).filter((value) => value >= minimumSeconds && value <= maxSeconds)
}

export function countValues(maximum = 999): Array<number> {
  return Array.from({ length: maximum }, (_, index) => index + 1)
}

export function includeSelectedValue(
  values: ReadonlyArray<number>,
  selected: number | undefined,
): Array<number> {
  if (selected === undefined || values.includes(selected)) return [...values]
  return [...values, selected].sort((left, right) => left - right)
}

/**
 * A picker's list: the offered values with the current one folded in, each
 * given a label. Keeping the selected value in the list is what lets a custom
 * duration survive — a picker that does not offer what it is showing snaps to
 * something else the moment it re-renders.
 */
export function pickerOptions(
  values: ReadonlyArray<number>,
  selected: number | undefined,
  label: (value: number) => string,
): Array<PickerOption> {
  return includeSelectedValue(values, selected).map((value) => ({ value, label: label(value) }))
}
