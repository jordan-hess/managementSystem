import { validateCreateTicket } from './CreateTicketModal.validation'

const base = { customer_id: 'c1', queue: 'ADVANCED', issue_type: 'X' } as never
const generic = { isSimSwap: false, isMnp: false, isGeneric: true }

describe('validateCreateTicket', () => {
  it('returns no errors for a valid generic ticket', () => {
    expect(validateCreateTicket(base, generic)).toEqual({})
  })

  it('reports every missing SIM SWAP field at once', () => {
    const form = { customer_id: 'c1', queue: 'SIM SWAP' } as never
    expect(Object.keys(validateCreateTicket(form, { isSimSwap: true, isMnp: false, isGeneric: false })).sort())
      .toEqual(['sim_type', 'swap_reason', 'swap_requested_date'])
  })

  it('asks the port-in follow-up only for the chosen answer', () => {
    const yes = { customer_id: 'c1', queue: 'PORTING', port_in: 'Yes' } as never
    expect(validateCreateTicket(yes, { isSimSwap: false, isMnp: true, isGeneric: false }))
      .toEqual({ port_customer_experiencing_issues: 'Please answer whether the customer is experiencing issues.' })
    const no = { customer_id: 'c1', queue: 'PORTING', port_in: 'No' } as never
    expect(validateCreateTicket(no, { isSimSwap: false, isMnp: true, isGeneric: false }))
      .toEqual({ port_inquiry_type: 'Please select what the inquiry relates to.' })
  })

  it('requires the port issue only when the customer is having issues', () => {
    const form = { customer_id: 'c1', queue: 'PORTING', port_in: 'Yes', port_customer_experiencing_issues: 'Yes' } as never
    expect(validateCreateTicket(form, { isSimSwap: false, isMnp: true, isGeneric: false }))
      .toEqual({ port_issue_type: 'Please select what the issue is.' })
    const fine = { customer_id: 'c1', queue: 'PORTING', port_in: 'Yes', port_customer_experiencing_issues: 'No' } as never
    expect(validateCreateTicket(fine, { isSimSwap: false, isMnp: true, isGeneric: false })).toEqual({})
  })

  it('requires the reversal reason only for a port reversal inquiry', () => {
    const form = { customer_id: 'c1', queue: 'PORTING', port_in: 'No', port_inquiry_type: 'Port reversal' } as never
    expect(validateCreateTicket(form, { isSimSwap: false, isMnp: true, isGeneric: false }))
      .toEqual({ port_reversal_reason: 'Please select the reason for the reversal.' })
    const out = { customer_id: 'c1', queue: 'PORTING', port_in: 'No', port_inquiry_type: 'Port Out' } as never
    expect(validateCreateTicket(out, { isSimSwap: false, isMnp: true, isGeneric: false })).toEqual({})
  })

  it('does not report fields of other queues (Review Focus 5)', () => {
    const form = { customer_id: 'c1', queue: 'ADVANCED', issue_type: 'X', sim_type: null } as never
    expect(validateCreateTicket(form, generic)).toEqual({})
  })

  it('reports customer, queue and issue type together when all are missing', () => {
    expect(Object.keys(validateCreateTicket({ customer_id: '', queue: '' } as never, generic)).sort())
      .toEqual(['customer', 'issue_type', 'queue'])
  })
})
