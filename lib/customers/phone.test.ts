import { isValidPhone, sanitizePhoneInput } from './phone'

describe('sanitizePhoneInput', () => {
  it('strips non-digit characters', () => {
    expect(sanitizePhoneInput('082 123-4567')).toBe('0821234567')
    expect(sanitizePhoneInput('abc123')).toBe('123')
  })

  it('keeps a leading + only', () => {
    expect(sanitizePhoneInput('+27 82 123 4567')).toBe('+27821234567')
    expect(sanitizePhoneInput('27+82')).toBe('2782')
    expect(sanitizePhoneInput('++27')).toBe('+27')
  })

  it('allows a lone + while typing', () => {
    expect(sanitizePhoneInput('+')).toBe('+')
  })
})

describe('isValidPhone', () => {
  it('accepts digits with an optional leading +', () => {
    expect(isValidPhone('0821234567')).toBe(true)
    expect(isValidPhone('+27821234567')).toBe(true)
  })

  it('rejects empty, lone +, spaces, dashes, letters and inner +', () => {
    for (const bad of ['', '+', '082 123', '082-123', '08a1', '27+82', '++27']) {
      expect(isValidPhone(bad)).toBe(false)
    }
  })
})
