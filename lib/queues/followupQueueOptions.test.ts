import { resolveFollowupQueueOptions } from './followupQueueOptions'

describe('resolveFollowupQueueOptions', () => {
  it('Billing agents see only Billing escalation channels', () => {
    expect(resolveFollowupQueueOptions('Billing', null)).toEqual(['Stitch', 'Peach Payments', 'Pay@', 'Receivables'])
  })

  it('a T2 agent with a recognized active queue sees only that queue', () => {
    expect(resolveFollowupQueueOptions('T2', 'ADVANCED')).toEqual(['ADVANCED'])
  })

  it('a T2 agent with no active queue set falls back to all 4 T2 queues', () => {
    expect(resolveFollowupQueueOptions('T2', null)).toEqual(['ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING'])
  })

  it('a T2 agent whose self-declared active queue is not a real T2 queue falls back to all 4', () => {
    expect(resolveFollowupQueueOptions('T2', 'freescout')).toEqual(['ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING'])
  })

  it('Social agents see every T2 queue plus every Social channel, excluding Billing', () => {
    const options = resolveFollowupQueueOptions('Social', null)
    expect(options).toEqual([
      'ADVANCED', 'SIM SWAP', 'VOICE', 'PORTING',
      'freescout', 'whatsapp', 'hellopeter', 'mybroadband', 'pissedcustomer',
      'ICASA', 'ODU', 'TikTok', 'LinkedIn', 'TrustPilot', 'Reddit', 'Sprinklr', 'Dark posts',
    ])
    expect(options).not.toContain('Stitch')
  })
})
