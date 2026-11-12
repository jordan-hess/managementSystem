import { resolveSlotsForDate } from './scheduleAlerts'
import { getBusinessMinutesOfDay, toBusinessLocalDate } from './calendarUtils'

const WORKING_STATUSES: ReadonlySet<string> = new Set(['on_shift', 'late'])

/** 'HH:MM:SS' (shift templates are always business-local) -> minutes since midnight. */
function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Which of the given profiles are on shift at the instant `at`.
 *
 * On shift means: the roster slot for `at`'s business date is `on_shift` or
 * `late`, AND, when the slot has a shift template, `at`'s business time of day
 * is >= its start and < its end (so the exact end minute is off shift).
 * `absent`, `sick`, `leave`, `off` and `no_rotation` are never on shift. A
 * working slot with no template (attendance recorded on a day the pattern says
 * OFF) counts as on shift, because its hours cannot be checked. A shift
 * template whose end is before its start (an overnight shift) never counts as
 * on shift, because the check is start <= now < end; none exist today.
 *
 * `unrostered` lists profiles whose roster is unknown (`no_rotation`: no team
 * and no personal pattern). They are not on shift, but nor are they known to be
 * off, so callers should not treat them as covered-by-someone-else.
 */
export async function getRosterAt(
  profileIds: string[],
  at: Date,
): Promise<{ onShift: Set<string>; unrostered: Set<string> }> {
  const slots = await resolveSlotsForDate(profileIds, toBusinessLocalDate(at))
  const minutesNow = getBusinessMinutesOfDay(at)

  const onShift = new Set<string>()
  const unrostered = new Set<string>()
  for (const [profileId, slot] of slots) {
    if (slot.effectiveStatus === 'no_rotation') unrostered.add(profileId)
    if (!WORKING_STATUSES.has(slot.effectiveStatus)) continue
    const template = slot.shiftTemplate
    if (template && (minutesNow < minutesOf(template.start_time) || minutesNow >= minutesOf(template.end_time))) continue
    onShift.add(profileId)
  }
  return { onShift, unrostered }
}

/** The subset of `profileIds` on shift at `at`. See getRosterAt for the rules. */
export async function getProfilesOnShiftAt(profileIds: string[], at: Date): Promise<Set<string>> {
  return (await getRosterAt(profileIds, at)).onShift
}
