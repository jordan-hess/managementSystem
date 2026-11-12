import { getAgentDepartment, isBillingDepartment } from './departments'

describe('isBillingDepartment', () => {
  it.each(['Billing', 'billing', 'BILLING', 'Billing ', ' Billing\t'])('accepts %j', (value) => {
    expect(isBillingDepartment(value)).toBe(true)
  })

  it.each([null, undefined, '', 'Social', 'Billings'])('rejects %j', (value) => {
    expect(isBillingDepartment(value)).toBe(false)
  })
})

describe('getAgentDepartment', () => {
  it('buckets a padded Billing profile as Billing even on a Social team', () => {
    expect(getAgentDepartment({ department: 'Billing ', team_department: 'Social' })).toBe('Billing')
  })

  it('still falls back to Social with no signals', () => {
    expect(getAgentDepartment({})).toBe('Social')
  })
})
