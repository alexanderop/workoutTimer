import { describe, expect, it } from 'vitest'
import {
  countValues,
  includeSelectedValue,
  timerDurationValues,
} from '@/features/timer/pickerOptions'

describe('timer picker options', () => {
  it('offers one-tap choices every 15 seconds for short workout durations', () => {
    const values = timerDurationValues(24 * 60 * 60, 15)

    expect(values.slice(0, 5)).toEqual([15, 30, 45, 60, 75])
    expect(values).toContain(10 * 60)
    expect(values).toContain(24 * 60 * 60)
  })

  it('keeps 15-second choices throughout the full interval range', () => {
    const values = timerDurationValues(60 * 60)

    expect(values.slice(0, 6)).toEqual([15, 30, 45, 60, 75, 90])
    expect(values).toContain(15 * 60 + 15)
    expect(values).toContain(59 * 60 + 45)
    expect(values.at(-1)).toBe(60 * 60)
  })

  it('offers every valid round count and preserves custom preset values', () => {
    expect(countValues()).toHaveLength(999)
    expect(includeSelectedValue([30, 60, 90], 45)).toEqual([30, 45, 60, 90])
  })
})
