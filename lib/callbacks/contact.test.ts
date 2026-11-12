import { normalizeCallbackContact, manualCallbackLabel } from './contact'

const ok = (input: Parameters<typeof normalizeCallbackContact>[0]) => {
  const r = normalizeCallbackContact(input)
  if (!r.ok) throw new Error('expected ok: ' + JSON.stringify(r.errors))
  return r.value
}
const errors = (input: Parameters<typeof normalizeCallbackContact>[0]) => {
  const r = normalizeCallbackContact(input)
  if (r.ok) throw new Error('expected errors')
  return r.errors
}

describe('normalizeCallbackContact', () => {
  it('accepts a phone only, trimming it and keeping its formatting', () => {
    expect(ok({ phone: '  082 123 4567 ' })).toEqual({ name: null, email: null, phone: '082 123 4567' })
  })

  it('accepts an email only', () => {
    expect(ok({ email: ' ann@example.com ' })).toEqual({ name: null, email: 'ann@example.com', phone: null })
  })

  it('accepts all three and trims the name', () => {
    expect(ok({ name: ' Ann ', email: 'ann@example.com', phone: '0821234567' })).toEqual({ name: 'Ann', email: 'ann@example.com', phone: '0821234567' })
  })

  it('turns blank and whitespace-only fields into null', () => {
    expect(ok({ name: '   ', email: '\t', phone: '0821234567' })).toEqual({ name: null, email: null, phone: '0821234567' })
  })

  it('requires at least one of phone or email, even when a name is given', () => {
    expect(errors({ name: 'Ann' }).contact).toBe('Enter a contact number or an email address.')
    expect(errors({}).contact).toBe('Enter a contact number or an email address.')
    expect(errors({ name: 'Ann', email: '  ', phone: '' }).contact).toBe('Enter a contact number or an email address.')
  })

  it('rejects an email that is not shaped like one', () => {
    for (const bad of ['ann', 'ann@', '@example.com', 'ann@example', 'a b@example.com']) {
      expect(errors({ email: bad }).contact_email).toBe('Enter a valid email address.')
    }
  })

  it('rejects a number with fewer than 7 digits but allows spaces, dashes, brackets and +', () => {
    expect(errors({ phone: '12345' }).contact_phone).toBe('Contact number must have at least 7 digits.')
    expect(ok({ phone: '+27 (82) 123-4567' }).phone).toBe('+27 (82) 123-4567')
  })

  it('rejects oversize values', () => {
    expect(errors({ name: 'x'.repeat(121), phone: '0821234567' }).contact_name).toBe('Name must be 120 characters or fewer.')
    expect(errors({ email: 'x'.repeat(250) + '@a.co' }).contact_email).toBe('Enter a valid email address.')
    expect(errors({ phone: '1'.repeat(41) }).contact_phone).toBe('Contact number must be 40 characters or fewer.')
  })

  it('does not also report the at-least-one error when a given field is invalid', () => {
    expect(errors({ email: 'nope' }).contact).toBeUndefined()
  })
})

describe('manualCallbackLabel', () => {
  it('uses the contact name, never a phone or email', () => {
    expect(manualCallbackLabel('Ann')).toBe('Ann')
    expect(manualCallbackLabel(null)).toBe('a callback contact')
    expect(manualCallbackLabel('  ')).toBe('a callback contact')
  })
})
