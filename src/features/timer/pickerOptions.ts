export interface PickerOption {
  readonly value: number
  readonly label: string
}

interface SteppedRange {
  readonly from: number
  readonly to: number
  readonly step: number
}

function steppedValues(ranges: ReadonlyArray<SteppedRange>): Array<number> {
  const values = new Set<number>()

  for (const { from, to, step } of ranges) {
    for (let value = from; value <= to; value += step) values.add(value)
  }

  return [...values].sort((left, right) => left - right)
}

export function timerDurationValues(maxSeconds: number, minimumSeconds = 5): Array<number> {
  const firstQuarterMinute = Math.ceil(minimumSeconds / 15) * 15

  return steppedValues([
    { from: firstQuarterMinute, to: Math.min(60 * 60, maxSeconds), step: 15 },
    { from: 65 * 60, to: Math.min(3 * 60 * 60, maxSeconds), step: 5 * 60 },
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
