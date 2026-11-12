'use server'

import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import type { Notification } from '@/types'
import { runDueSweeps } from './dueSweep'

/**
 * Server actions backing the three direct
 * `supabase.from('notifications')` calls (fetch unread, markAllRead,
 * markRead). Ported off Supabase RLS — the final DB policies these mirror:
 *   - SELECT: recipient_id = caller OR caller.role = 'management' (NOT admin
 *     — deliberate, see the migration comment on notifications_select).
 *     This component only ever wants the caller's own inbox, so it's scoped
 *     to recipient_id = caller regardless of role; the wider management
 *     branch doesn't apply to a "my notifications" bell.
 *   - INSERT: unrestricted (not exercised by this file — the notification UI
 *     (NotificationBell/NotificationsProvider) doesn't insert notifications, only warnings, which is out of scope
 *     for this port).
 *   - UPDATE: recipient_id = caller. The old client code relied entirely on
 *     RLS for this and issued an unscoped update — markNotificationReadAction
 *     below adds the recipient_id filter explicitly, which is a real fix,
 *     not just redundant belt-and-braces, now that RLS is gone.
 */

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

export async function fetchNotificationsAction(): Promise<ActionResult<Notification[]>> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }

  // This poll doubles as the scheduler for the time-based alerts (callback
  // reminders, follow-ups falling due on an agent's off day). pg_cron isn't
  // available on this cluster, and NotificationsProvider already calls this every
  // 30s for every signed-in user, so it is the cheapest correct tick
  // available. An advisory lock inside means only one caller per tick does
  // the work; everyone else returns instantly. Deliberately awaited but
  // never allowed to fail the fetch — see runDueSweeps.
  await runDueSweeps()

  try {
    const rows = await sql<Notification[]>`
      SELECT n.*,
        CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('full_name', p.full_name) END AS sender
      FROM notifications n
      LEFT JOIN profiles p ON p.id = n.sender_id
      WHERE n.recipient_id = ${userId}
      ORDER BY n.created_at DESC
      LIMIT 20
    `
    return { data: rows }
  } catch (error) {
    console.error('fetchNotificationsAction failed', error)
    return { error: 'Could not load notifications.' }
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<true>> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }

  try {
    await sql`
      UPDATE notifications SET read = true, read_at = now()
      WHERE recipient_id = ${userId} AND read = false
    `
    return { data: true }
  } catch (error) {
    console.error('markAllNotificationsReadAction failed', error)
    return { error: 'Could not update notifications.' }
  }
}

export async function markNotificationReadAction(id: string): Promise<ActionResult<true>> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Unauthorized' }

  try {
    const rows = await sql<{ id: string }[]>`
      UPDATE notifications SET read = true, read_at = now()
      WHERE id = ${id} AND recipient_id = ${userId}
      RETURNING id
    `
    if (rows.length === 0) return { error: 'Notification not found.' }
    return { data: true }
  } catch (error) {
    console.error('markNotificationReadAction failed', error)
    return { error: 'Could not update notification.' }
  }
}
