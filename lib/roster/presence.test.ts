import { mergeAgentStatusIntoPresence, PresenceInfo } from './presence'
import { AgentStatusValue } from '@/lib/agentStatus/constants'

const BASE_PRESENCE_CASES: [string, PresenceInfo][] = [
  ['not_scheduled', { status: 'not_scheduled' }],
  ['offline_upcoming', { status: 'offline_upcoming', expectedTime: '08:00' }],
  ['offline_overdue', { status: 'offline_overdue', expectedTime: '08:00' }],
  ['active_on_time', { status: 'active_on_time', expectedTime: '08:00' }],
  ['active_late', { status: 'active_late', lateMinutes: 23, expectedTime: '08:00' }],
]

function mapOf(profileId: string, info: PresenceInfo): Map<string, PresenceInfo> {
  return new Map([[profileId, info]])
}

describe('mergeAgentStatusIntoPresence', () => {
  describe.each(BASE_PRESENCE_CASES)('base status %s', (_label, info) => {
    it('passes through unchanged when there is no status row', () => {
      const merged = mergeAgentStatusIntoPresence(mapOf('p1', info), new Map())
      expect(merged.get('p1')).toEqual(info)
    })

    it('passes through unchanged when status is "active"', () => {
      const statusMap = new Map<string, AgentStatusValue>([['p1', 'active']])
      const merged = mergeAgentStatusIntoPresence(mapOf('p1', info), statusMap)
      expect(merged.get('p1')).toEqual(info)
    })

    it('is fully overridden to on_break when status is "break", dropping any lateMinutes/expectedTime', () => {
      const statusMap = new Map<string, AgentStatusValue>([['p1', 'break']])
      const merged = mergeAgentStatusIntoPresence(mapOf('p1', info), statusMap)
      expect(merged.get('p1')).toEqual({ status: 'on_break' })
    })

    it('is fully overridden to in_meeting when status is "meeting", dropping any lateMinutes/expectedTime', () => {
      const statusMap = new Map<string, AgentStatusValue>([['p1', 'meeting']])
      const merged = mergeAgentStatusIntoPresence(mapOf('p1', info), statusMap)
      expect(merged.get('p1')).toEqual({ status: 'in_meeting' })
    })
  })

  it('returns a new Map with the same size and keys as the input presenceMap', () => {
    const presenceMap = new Map<string, PresenceInfo>([
      ['p1', { status: 'active_on_time', expectedTime: '08:00' }],
      ['p2', { status: 'not_scheduled' }],
      ['p3', { status: 'offline_overdue', expectedTime: '09:00' }],
    ])
    const statusMap = new Map<string, AgentStatusValue>([['p1', 'break'], ['p3', 'meeting']])

    const merged = mergeAgentStatusIntoPresence(presenceMap, statusMap)

    expect(merged).not.toBe(presenceMap)
    expect(merged.size).toBe(presenceMap.size)
    expect([...merged.keys()].sort()).toEqual([...presenceMap.keys()].sort())
    expect(merged.get('p1')).toEqual({ status: 'on_break' })
    expect(merged.get('p2')).toEqual({ status: 'not_scheduled' })
    expect(merged.get('p3')).toEqual({ status: 'in_meeting' })
  })
})
