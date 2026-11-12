import { chooseRecipients } from './callbackRecipients'

const base = { agentId: 'agent', ownLeaderIds: ['own'], allLeaderIds: ['own', 'other-1', 'other-2'], unrostered: new Set<string>() }

describe('chooseRecipients', () => {
  it('sends to the agent when the agent is on shift', () => {
    expect(chooseRecipients({ ...base, onShift: new Set(['agent', 'own']) })).toEqual({ recipientIds: ['agent'], toLeaders: false })
  })

  it('sends to the agent\'s own team leader when the agent is off and that leader is on shift', () => {
    expect(chooseRecipients({ ...base, onShift: new Set(['own', 'other-1']) })).toEqual({ recipientIds: ['own'], toLeaders: true })
  })

  it('sends to every team leader on shift when the agent and their own leader are off', () => {
    expect(chooseRecipients({ ...base, onShift: new Set(['other-1', 'other-2']) })).toEqual({
      recipientIds: ['other-1', 'other-2'],
      toLeaders: true,
    })
  })

  it('falls back to the agent when nobody is on shift, rather than telling nobody', () => {
    expect(chooseRecipients({ ...base, onShift: new Set() })).toEqual({ recipientIds: ['agent'], toLeaders: false })
  })

  it('sends to an unrostered agent themselves even when their leaders are on shift', () => {
    expect(chooseRecipients({ ...base, onShift: new Set(['own', 'other-1']), unrostered: new Set(['agent']) })).toEqual({
      recipientIds: ['agent'],
      toLeaders: false,
    })
  })

  it('lists a team leader once even if they lead two of the agent\'s teams', () => {
    const r = chooseRecipients({ agentId: 'agent', ownLeaderIds: ['own', 'own'], allLeaderIds: ['own', 'own'], unrostered: new Set<string>(), onShift: new Set(['own']) })
    expect(r.recipientIds).toEqual(['own'])
  })

  it('never treats the agent as their own team leader', () => {
    // The agent is also a leader of another team and is off shift: not a recipient "as a leader".
    const r = chooseRecipients({ agentId: 'agent', ownLeaderIds: [], allLeaderIds: ['agent', 'other-1'], unrostered: new Set<string>(), onShift: new Set(['other-1']) })
    expect(r).toEqual({ recipientIds: ['other-1'], toLeaders: true })
  })
})
