import { ResolvedDaySlot } from '@/types'
import { getBusinessMinutesOfDay } from './calendarUtils'
import { AgentStatusValue } from '@/lib/agentStatus/constants'

export type PresenceStatus =
  | 'not_scheduled' | 'offline_upcoming' | 'offline_overdue' | 'active_on_time' | 'active_late'
  | 'on_break' | 'in_meeting' | 'inactive'

export interface PresenceInfo {
  status: PresenceStatus
  /** Only set for 'active_late' */
  lateMinutes?: number
  /** 'HH:MM', only set when a shift start time applies (everything but 'not_scheduled') */
  expectedTime?: string
}

/**
 * Compares an agent's resolved shift for today against their first login of
 * the day. Only ever looks at effectiveStatus === 'on_shift' — if a team
 * leader has already manually marked today's attendance (late/absent/sick/
 * leave/off), that's a separate, deliberate judgment call this indicator
 * doesn't second-guess.
 */
export function derivePresence(
  todaySlot: ResolvedDaySlot | undefined,
  firstLoginAt: string | null,
  now: Date,
): PresenceInfo {
  if (!todaySlot || todaySlot.effectiveStatus !== 'on_shift' || !todaySlot.shiftTemplate) {
    return { status: 'not_scheduled' }
  }

  const expectedTime = todaySlot.shiftTemplate.start_time.slice(0, 5)
  const [expectedHour, expectedMinute] = expectedTime.split(':').map(Number)
  const expectedMinutesOfDay = expectedHour * 60 + expectedMinute

  if (!firstLoginAt) {
    const nowMinutesOfDay = getBusinessMinutesOfDay(now)
    return nowMinutesOfDay >= expectedMinutesOfDay
      ? { status: 'offline_overdue', expectedTime }
      : { status: 'offline_upcoming', expectedTime }
  }

  const loginMinutesOfDay = getBusinessMinutesOfDay(new Date(firstLoginAt))
  if (loginMinutesOfDay <= expectedMinutesOfDay) {
    return { status: 'active_on_time', expectedTime }
  }

  return { status: 'active_late', lateMinutes: loginMinutesOfDay - expectedMinutesOfDay, expectedTime }
}

/** Convenience for building profileId -> PresenceInfo across a roster.
 *  `slotMap` is whatever buildSlotMap() produced (keyed `profileId:date`) —
 *  only `todayDateStr`'s slot per profile is read out of it. */
export function buildPresenceMap(
  profiles: { id: string }[],
  slotMap: Map<string, ResolvedDaySlot>,
  todayDateStr: string,
  loginLog: { profile_id: string; first_login_at: string }[],
  now: Date,
): Map<string, PresenceInfo> {
  const loginByProfile = new Map(loginLog.map(l => [l.profile_id, l.first_login_at]))
  const map = new Map<string, PresenceInfo>()
  for (const profile of profiles) {
    const todaySlot = slotMap.get(`${profile.id}:${todayDateStr}`)
    map.set(profile.id, derivePresence(todaySlot, loginByProfile.get(profile.id) ?? null, now))
  }
  return map
}

/**
 * Overrides the schedule-derived presence dot with a manually-set (or
 * shift-end auto-set) agent status — see lib/agentStatus/. 'active' (or no
 * row at all, the default for a profile that's never toggled) is a
 * pass-through: it means "no override in effect," so the original on-time/
 * late/offline logic keeps showing through unchanged. 'break'/'meeting'/
 * 'inactive' fully replace the entry — a manual (or auto) override wins over
 * e.g. an existing lateness flag rather than being combined with it.
 */
export function mergeAgentStatusIntoPresence(
  presenceMap: Map<string, PresenceInfo>,
  statusMap: Map<string, AgentStatusValue>,
): Map<string, PresenceInfo> {
  const merged = new Map<string, PresenceInfo>()
  for (const [id, info] of presenceMap) {
    const status = statusMap.get(id)
    merged.set(id, status === 'break' ? { status: 'on_break' } : status === 'meeting' ? { status: 'in_meeting' } : status === 'inactive' ? { status: 'inactive' } : info)
  }
  return merged
}
