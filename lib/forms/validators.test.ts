import { isValidEmail } from './validators'

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('first.last+tag@example.co.za')).toBe(true)
  })
  it('rejects empty, spaces, missing @ or domain', () => {
    for (const bad of ['', ' ', 'abc', 'a@', '@b.co', 'a@b', 'a b@c.co', 'a@b .co']) {
      expect(isValidEmail(bad)).toBe(false)
    }
  })
  it('ignores surrounding whitespace', () => {
    expect(isValidEmail('  a@b.co ')).toBe(true)
  })
})
