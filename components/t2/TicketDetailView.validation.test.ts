import { validateSolve, validateEscalate, validateReassign, validateRespond, validateEditedSolution } from './TicketDetailView.validation'

describe('validateSolve', () => {
  it('reports every missing field with a prefixed key', () => {
    expect(validateSolve({ troubleshooting_performed: ' ', findings: '', solution: '' } as never, 'solve'))
      .toEqual({
        solve_troubleshooting: 'Troubleshooting performed is required.',
        solve_findings: 'Findings are required.',
        solve_solution: 'Solution is required.',
      })
  })
  it('uses the validate prefix for the escalation-validation form', () => {
    expect(Object.keys(validateSolve({ troubleshooting_performed: 'x', findings: '', solution: 'y' } as never, 'validate')))
      .toEqual(['validate_findings'])
  })
  it('is empty when complete', () => {
    expect(validateSolve({ troubleshooting_performed: 'a', findings: 'b', solution: 'c' } as never, 'solve')).toEqual({})
  })
})

describe('validateEscalate', () => {
  it('requires a team and a reason', () => {
    expect(validateEscalate({ escalate_to: '', escalation_reason: ' ' } as never))
      .toEqual({ escalate_to: 'Escalate To is required.', escalation_reason: 'Escalation Reason is required.' })
    expect(validateEscalate({ escalate_to: 'NPO', escalation_reason: 'why' } as never)).toEqual({})
  })
})

describe('single-field validators', () => {
  it('validateReassign', () => {
    expect(validateReassign('')).toEqual({ reassign_to: 'Pick who to reassign this ticket to.' })
    expect(validateReassign('a1')).toEqual({})
  })
  it('validateRespond', () => {
    expect(validateRespond('  ')).toEqual({ respond_text: 'Enter your response before submitting.' })
    expect(validateRespond('ok')).toEqual({})
  })
  it('validateEditedSolution', () => {
    expect(validateEditedSolution('')).toEqual({ edited_solution: 'Provide the edited solution text before submitting an edit.' })
    expect(validateEditedSolution('fixed')).toEqual({})
  })
})
