import { sql } from '@/lib/db/pool'
import { FollowupStatus } from '@/types'

/**
 * NOTE: as of the Postgres migration, this standalone helper has zero
 * remaining call sites — app/(app)/support-tickets/actions.ts inlines this
 * exact INSERT (inside withTransaction, alongside the followups UPDATE it
 * accompanies) in updateFollowupAction/updateFollowupStatusAction/
 * reassignFollowupAction instead of calling out to a shared helper. Ported
 * for completeness in case something still imports it.
 *
 * Verified rule (Database/migrations/management-followups-access.sql):
 * INSERT allowed if changed_by = caller AND caller could see the parent
 * followup — callers of this helper must enforce that check themselves
 * before calling, same as the inlined call sites do.
 */
export async function insertFollowupHistory(
  followupId: string,
  changedBy: string,
  fromStatus: FollowupStatus,
  toStatus: FollowupStatus,
): Promise<void> {
  await sql`
    INSERT INTO followup_status_history (followup_id, changed_by, from_status, to_status)
    VALUES (${followupId}, ${changedBy}, ${fromStatus}, ${toStatus})
  `
}
