import { MAX_COUNT, MAX_NOTES, parseCount } from './activityLimits'

describe('limits', () => {
  it('are the numbers the database CHECK constraints enforce', () => {
    expect(MAX_COUNT).toBe(10000)
    expect(MAX_NOTES).toBe(2000)
  })
})

describe('parseCount', () => {
  it('treats an empty or blank field as 0 (nothing to report)', () => {
    expect(parseCount('')).toEqual({ ok: true, value: 0 })
    expect(parseCount('   ')).toEqual({ ok: true, value: 0 })
  })

  it('accepts whole numbers from 0 to 10,000', () => {
    expect(parseCount('0')).toEqual({ ok: true, value: 0 })
    expect(parseCount('7')).toEqual({ ok: true, value: 7 })
    expect(parseCount(' 42 ')).toEqual({ ok: true, value: 42 })
    expect(parseCount('10000')).toEqual({ ok: true, value: 10000 })
  })

  it('rejects anything else a number input can still hold', () => {
    for (const bad of ['-1', '1.5', '10001', '1e5', '+3', '0x10', '3,000', 'abc', '--2', '1 2']) {
      expect(parseCount(bad)).toEqual({ ok: false })
    }
  })
})
