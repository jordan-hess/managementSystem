import { fieldA11y, fieldInputClass } from './fieldStyles'

const BASE = 'w-full border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none'

describe('fieldInputClass', () => {
  it('returns the base class unchanged when there is no error', () => {
    expect(fieldInputClass(BASE, false)).toBe(BASE)
  })

  it('swaps border and focus ring to red when there is an error', () => {
    const out = fieldInputClass(BASE, true)
    expect(out).toContain('border-red-500')
    expect(out).toContain('dark:border-red-500')
    expect(out).toContain('focus:ring-red-500')
    expect(out).not.toContain('border-gray-300')
    expect(out).not.toContain('focus:ring-blue-500')
  })

  it('swaps dark-only borders (border-gray-600/700) so no neutral border is left competing with red', () => {
    const dark = 'w-full border border-gray-700 rounded focus:ring-1 focus:ring-blue-500'
    const out = fieldInputClass(dark, true)
    expect(out).toContain('border-red-500')
    expect(out).not.toContain('border-gray-700')
    expect(fieldInputClass('border-gray-600 rounded', true)).not.toContain('border-gray-600')
  })

  it('still produces a red outline when the base has none of the swappable classes', () => {
    expect(fieldInputClass('px-3 py-2', true)).toContain('border-red-500')
  })
})

describe('fieldA11y', () => {
  it('is empty without an error', () => {
    expect(fieldA11y('x', undefined)).toEqual({})
  })
  it('marks the input invalid and points at the message', () => {
    expect(fieldA11y('x', 'Bad')).toEqual({ 'aria-invalid': true, 'aria-describedby': 'x-error' })
  })
})
