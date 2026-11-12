import { act, renderHook } from '@testing-library/react'
import { useFormErrors } from './useFormErrors'

type F = 'name' | 'email' | 'phone'
const FIELDS = ['name', 'email', 'phone'] as const

function setup() {
  return renderHook(() => useFormErrors<F>(FIELDS))
}

describe('useFormErrors', () => {
  it('starts empty', () => {
    const { result } = setup()
    expect(result.current.fieldErrors).toEqual({})
    expect(result.current.formError).toBe('')
  })

  it('setFieldErrors replaces all field errors at once', () => {
    const { result } = setup()
    act(() => result.current.setFieldErrors({ name: 'a', email: 'b' }))
    act(() => result.current.setFieldErrors({ phone: 'c' }))
    expect(result.current.fieldErrors).toEqual({ phone: 'c' })
  })

  it('clearFieldError clears only that field', () => {
    const { result } = setup()
    act(() => result.current.setFieldErrors({ name: 'a', email: 'b' }))
    act(() => result.current.clearFieldError('name'))
    expect(result.current.fieldErrors).toEqual({ email: 'b' })
  })

  it('clearAll resets field errors and the form error', () => {
    const { result } = setup()
    act(() => { result.current.setFieldErrors({ name: 'a' }); result.current.setFormError('boom') })
    act(() => result.current.clearAll())
    expect(result.current.fieldErrors).toEqual({})
    expect(result.current.formError).toBe('')
  })

  it('applyActionError puts a known field error under that field', () => {
    const { result } = setup()
    act(() => result.current.applyActionError({ error: 'Dup email', field: 'email' }))
    expect(result.current.fieldErrors).toEqual({ email: 'Dup email' })
    expect(result.current.formError).toBe('')
  })

  it('applyActionError falls back to the banner for an unknown field (Review Focus 1)', () => {
    const { result } = setup()
    act(() => result.current.applyActionError({ error: 'Bad thing', field: 'zzz' }))
    expect(result.current.fieldErrors).toEqual({})
    expect(result.current.formError).toBe('Bad thing')
  })

  it('applyActionError uses the banner when no field is given', () => {
    const { result } = setup()
    act(() => result.current.applyActionError({ error: 'Could not save' }))
    expect(result.current.formError).toBe('Could not save')
  })

  it('applyActionError honors an alias map from server field to form field', () => {
    const { result } = setup()
    act(() => result.current.applyActionError({ error: 'Bad phone', field: 'tel' }, { tel: 'phone' }))
    expect(result.current.fieldErrors).toEqual({ phone: 'Bad phone' })
  })

  it('a server error replaces an earlier client error on the same field (Review Focus 4)', () => {
    const { result } = setup()
    act(() => result.current.setFieldError('email', 'Email is required.'))
    act(() => result.current.applyActionError({ error: 'Already exists', field: 'email' }))
    expect(result.current.fieldErrors).toEqual({ email: 'Already exists' })
  })

  it('applyActionError with no error message is a no-op', () => {
    const { result } = setup()
    act(() => result.current.applyActionError({}))
    expect(result.current.fieldErrors).toEqual({})
    expect(result.current.formError).toBe('')
  })
})
