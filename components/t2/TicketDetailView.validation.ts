import type { FieldErrors } from '@/lib/forms/useFormErrors'
import type { SolveInput, EscalateInput } from '@/app/(app)/t2/actions'

export type TicketDetailField =
  | 'solve_troubleshooting' | 'solve_findings' | 'solve_solution'
  | 'validate_troubleshooting' | 'validate_findings' | 'validate_solution'
  | 'escalate_to' | 'escalation_reason'
  | 'reassign_to' | 'respond_text' | 'edited_solution'

export const TICKET_DETAIL_FIELDS: readonly TicketDetailField[] = [
  'solve_troubleshooting', 'solve_findings', 'solve_solution',
  'validate_troubleshooting', 'validate_findings', 'validate_solution',
  'escalate_to', 'escalation_reason', 'reassign_to', 'respond_text', 'edited_solution',
]

/** Used for both the "Resolve it yourself" form (prefix 'solve') and T2's "It worked" validation form (prefix 'validate'). */
export function validateSolve(form: Pick<SolveInput, 'troubleshooting_performed' | 'findings' | 'solution'>, prefix: 'solve' | 'validate'): FieldErrors<TicketDetailField> {
  const e: FieldErrors<TicketDetailField> = {}
  if (!form.troubleshooting_performed.trim()) e[`${prefix}_troubleshooting`] = 'Troubleshooting performed is required.'
  if (!form.findings.trim()) e[`${prefix}_findings`] = 'Findings are required.'
  if (!form.solution.trim()) e[`${prefix}_solution`] = 'Solution is required.'
  return e
}

export function validateEscalate(form: Pick<EscalateInput, 'escalate_to' | 'escalation_reason'>): FieldErrors<TicketDetailField> {
  const e: FieldErrors<TicketDetailField> = {}
  if (!form.escalate_to) e.escalate_to = 'Escalate To is required.'
  if (!(form.escalation_reason ?? '').trim()) e.escalation_reason = 'Escalation Reason is required.'
  return e
}

export function validateReassign(reassignTo: string): FieldErrors<TicketDetailField> {
  return reassignTo ? {} : { reassign_to: 'Pick who to reassign this ticket to.' }
}

export function validateRespond(text: string): FieldErrors<TicketDetailField> {
  return text.trim() ? {} : { respond_text: 'Enter your response before submitting.' }
}

export function validateEditedSolution(text: string): FieldErrors<TicketDetailField> {
  return text.trim() ? {} : { edited_solution: 'Provide the edited solution text before submitting an edit.' }
}
