import { useCallback, useState } from 'react'

export type FieldErrors<F extends string> = Partial<Record<F, string>>
export interface ActionErrorLike { error?: string; field?: string }

/**
 * Per-field validation errors plus one general (banner) error for a form.
 * Server errors can name a field; if the form does not render that field the
 * message falls back to the banner so it is never silently dropped.
 */
export function useFormErrors<F extends string>(knownFields: readonly F[]) {
  const [fieldErrors, setFieldErrorsState] = useState<FieldErrors<F>>({})
  const [formError, setFormError] = useState('')

  const setFieldErrors = useCallback((errors: FieldErrors<F>) => setFieldErrorsState(errors), [])
  const setFieldError = useCallback((field: F, message: string) => {
    setFieldErrorsState((prev) => ({ ...prev, [field]: message }))
  }, [])
  const clearFieldError = useCallback((field: F) => {
    setFieldErrorsState((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])
  const clearAll = useCallback(() => { setFieldErrorsState({}); setFormError('') }, [])

  const applyActionError = useCallback((result: ActionErrorLike, alias?: Partial<Record<string, F>>) => {
    if (!result.error) return
    const target = result.field ? (alias?.[result.field] ?? result.field) : undefined
    if (target && (knownFields as readonly string[]).includes(target)) {
      setFieldErrorsState((prev) => ({ ...prev, [target as F]: result.error }))
    } else {
      setFormError(result.error)
    }
  }, [knownFields])

  return { fieldErrors, formError, setFieldErrors, setFieldError, clearFieldError, setFormError, clearAll, applyActionError }
}
