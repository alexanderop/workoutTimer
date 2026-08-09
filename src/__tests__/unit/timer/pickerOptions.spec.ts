import { describe, expect, it } from 'vitest'
import {
  countValues,
  includeSelectedValue,
  pickerOptions,
  steppedValues,
  timerDurationValues,
} from '@/features/timer/pickerOptions'

describe('steppedValues', () => {
  it('walks a range inclusively', () => {
    expect(steppedValues([{ from: 15, to: 60, step: 15 }])).toEqual([15, 30, 45, 60])
  })

  it('stops before overshooting the end', () => {
    expect(steppedValues([{ from: 10, to: 35, step: 10 }])).toEqual([10, 20, 30])
  })

  it('yields nothing for a range that ends before it starts', () => {
    expect(steppedValues([{ from: 100, to: 50, step: 10 }])).toEqual([])
  })

  /**
   * The two behaviours `timerDurationValues` cannot exercise, because it hands
   * over bands that are already ordered and disjoint. They are the helper's
   * contract, and the next caller is the one who will rely on them.
   */
  it('sorts across ranges given out of order', () => {
    expect(
      steppedValues([
        { from: 100, to: 120, step: 10 },
        { from: 10, to: 30, step: 10 },
      ]),
    ).toEqual([10, 20, 30, 100, 110, 120])
  })

  it('reports a value covered by two ranges once', () => {
    expect(
      steppedValues([
        { from: 10, to: 30, step: 10 },
        { from: 20, to: 40, step: 10 },
      ]),
    ).toEqual([10, 20, 30, 40])
  })
})

/**
 * The duration picker's three bands: fine near the bottom where a workout
 * actually lives, coarser above. What matters is that the bands hand over to
 * each other cleanly — a band that runs past its own end floods the picker
 * with hundreds of chips nobody scrolls through, and one that stops short
 * leaves a gap you can only cross with the custom field.
 */
describe('timerDurationValues', () => {
  // Built inside each test, not once in the describe: a value computed while
  // the suite is being collected is produced before a mutant is activated, so
  // every assertion against it would pass no matter what the function did.
  const fullDay = () => timerDurationValues(24 * 60 * 60, 15)

  it('steps by 15 seconds up to the first hour', () => {
    const values = fullDay()

    expect(values.slice(0, 5)).toEqual([15, 30, 45, 60, 75])
    expect(values).toContain(10 * 60)
    expect(values).toContain(59 * 60 + 45)
    expect(values).toContain(60 * 60)
  })

  it('hands over to 5-minute steps after the first hour', () => {
    const values = fullDay()

    // Not 3615: the fine band ends at an hour, it does not run to the maximum.
    expect(values).not.toContain(60 * 60 + 15)
    expect(values[values.indexOf(60 * 60) + 1]).toBe(65 * 60)
    expect(values).toContain(2 * 60 * 60)
    expect(values).toContain(3 * 60 * 60)
  })

  it('hands over to 15-minute steps after three hours', () => {
    const values = fullDay()
    const afterThreeHours = values.filter((value) => value > 3 * 60 * 60 && value <= 4 * 60 * 60)

    expect(afterThreeHours).toEqual([11_700, 12_600, 13_500, 14_400])
    expect(values).toContain(12 * 60 * 60)
    expect(values.at(-1)).toBe(24 * 60 * 60)
  })

  it('rises, without a repeat', () => {
    const values = fullDay()

    expect(values).toEqual([...new Set(values)].sort((left, right) => left - right))
  })

  /**
   * Every chip is a whole number of seconds, and every chip below the first
   * handover is on a quarter-minute. A band that starts a fraction off, or
   * steps by one, fills the picker with values no one would choose from —
   * and there are enough of them that the shape has to be asserted rather
   * than the members listed.
   */
  it('offers only whole seconds, on the grid each band sets', () => {
    const values = fullDay()

    expect(values.every(Number.isInteger)).toBe(true)
    expect(values.filter((value) => value <= 60 * 60).every((value) => value % 15 === 0)).toBe(true)
    expect(
      values
        .filter((value) => value > 60 * 60 && value <= 3 * 60 * 60)
        .every((value) => value % (5 * 60) === 0),
    ).toBe(true)
    expect(
      values.filter((value) => value > 3 * 60 * 60).every((value) => value % (15 * 60) === 0),
    ).toBe(true)
  })

  it('offers nothing past the maximum', () => {
    const twoMinutes = timerDurationValues(120, 15)

    expect(twoMinutes).toEqual([15, 30, 45, 60, 75, 90, 105, 120])
  })

  it('starts on the first quarter-minute at or above the minimum', () => {
    expect(timerDurationValues(600, 20)[0]).toBe(30)
    expect(timerDurationValues(600, 15)[0]).toBe(15)
    // The default minimum of 5 seconds still starts the picker at 15, since a
    // shorter chip would not be one of the quarter-minutes the band offers.
    expect(timerDurationValues(600)[0]).toBe(15)
  })

  /**
   * A minimum above the fine band empties it, and the coarse bands start
   * lower — so the floor has to be applied to the result, not just to where
   * the first band begins.
   */
  it('drops coarse values that fall below a high minimum', () => {
    const values = timerDurationValues(24 * 60 * 60, 70 * 60)

    expect(values.every((value) => value >= 70 * 60)).toBe(true)
    // The band itself starts at 65 minutes; the floor is what removes that one.
    expect(values).not.toContain(65 * 60)
    expect(values[0]).toBe(70 * 60)
  })
})

describe('countValues', () => {
  it('counts from one', () => {
    expect(countValues(3)).toEqual([1, 2, 3])
  })

  it('offers every count the schema allows', () => {
    const values = countValues()

    expect(values).toHaveLength(999)
    expect(values.at(0)).toBe(1)
    expect(values.at(-1)).toBe(999)
  })
})

/**
 * A picker that does not offer the value it is showing snaps to something else
 * the moment it re-renders — which is how a preset's custom duration would be
 * lost by opening it.
 */
describe('includeSelectedValue', () => {
  it('folds a custom value into the offered list, in order', () => {
    expect(includeSelectedValue([30, 60, 90], 45)).toEqual([30, 45, 60, 90])
    expect(includeSelectedValue([30, 60, 90], 5)).toEqual([5, 30, 60, 90])
    expect(includeSelectedValue([30, 60, 90], 120)).toEqual([30, 60, 90, 120])
  })

  it('leaves the list alone when nothing is selected or it is already offered', () => {
    expect(includeSelectedValue([30, 60], undefined)).toEqual([30, 60])
    expect(includeSelectedValue([30, 60], 60)).toEqual([30, 60])
  })

  it('never hands back the caller’s array', () => {
    const offered = [30, 60]

    expect(includeSelectedValue(offered, undefined)).not.toBe(offered)
    expect(includeSelectedValue(offered, 45)).not.toBe(offered)
    expect(offered).toEqual([30, 60])
  })
})

describe('pickerOptions', () => {
  it('labels every offered value, including the one folded in', () => {
    expect(pickerOptions([30, 90], 60, (value) => `${value}s`)).toEqual([
      { value: 30, label: '30s' },
      { value: 60, label: '60s' },
      { value: 90, label: '90s' },
    ])
  })

  it('labels a list nothing was selected from', () => {
    expect(pickerOptions([1, 2], undefined, String)).toEqual([
      { value: 1, label: '1' },
      { value: 2, label: '2' },
    ])
  })
})
