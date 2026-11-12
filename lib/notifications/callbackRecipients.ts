export interface RecipientInput {
  agentId: string
  /** Leaders of the teams the agent belongs to. */
  ownLeaderIds: string[]
  /** Every team leader in the organisation. */
  allLeaderIds: string[]
  /** Profile ids on shift at the callback's due time. */
  onShift: ReadonlySet<string>
  /** Profile ids whose roster is unknown (no team, no personal pattern). */
  unrostered: ReadonlySet<string>
}

export interface RecipientChoice {
  recipientIds: string[]
  /** True when the reminder goes to team leader(s) covering for an off-shift agent. */
  toLeaders: boolean
}

/**
 * Who gets the "callback due in 5 minutes" reminder:
 *  - the agent, when they are on shift, or when their roster is unknown
 *    (unrostered) — we cannot claim they are off, so they get their own reminder;
 *  - otherwise their own team leader if on shift;
 *  - otherwise every team leader on shift;
 *  - otherwise the agent anyway — better than telling nobody.
 * Each person is listed once, and the agent is never counted as their own leader.
 */
export function chooseRecipients({ agentId, ownLeaderIds, allLeaderIds, onShift, unrostered }: RecipientInput): RecipientChoice {
  if (onShift.has(agentId) || unrostered.has(agentId)) return { recipientIds: [agentId], toLeaders: false }

  const onShiftLeaders = (ids: string[]) => [...new Set(ids)].filter((id) => id !== agentId && onShift.has(id))

  const own = onShiftLeaders(ownLeaderIds)
  if (own.length > 0) return { recipientIds: own, toLeaders: true }

  const any = onShiftLeaders(allLeaderIds)
  if (any.length > 0) return { recipientIds: any, toLeaders: true }

  return { recipientIds: [agentId], toLeaders: false }
}
