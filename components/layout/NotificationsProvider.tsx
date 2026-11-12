'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { Notification } from '@/types'
import { fetchNotificationsAction, markAllNotificationsReadAction, markNotificationReadAction } from '@/lib/notifications/actions'
import { selectNewPopups } from '@/lib/notifications/popup'
import NotificationPopup from './NotificationPopup'

const POLL_INTERVAL_MS = 30_000

interface NotificationsContextValue {
  userId: string
  notifications: Notification[]
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  /** The page a notification opens, or null when it has none. */
  getDestination: (type: string) => string | null
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>')
  return ctx
}

/**
 * Owns the notification poll, the list and the centred pop-up queue for the whole
 * signed-in app. Mounted once in app/(app)/layout.tsx so a pop-up appears on every
 * page, header or not, and there is exactly one 30-second poll (which also drives
 * the due-time sweeps in lib/notifications/dueSweep.ts). NotificationBell only
 * reads from here.
 */
export function NotificationsProvider({ userId, userRole, children }: { userId: string; userRole?: string; children: React.ReactNode }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  // Centred pop-ups waiting to be read (see lib/notifications/popup.ts), and the ids already accounted for.
  // seenRef stays null until the first successful poll, which only seeds it.
  const [popupQueue, setPopupQueue] = useState<Notification[]>([])
  const seenRef = useRef<Set<string> | null>(null)

  const getDestination = useCallback((type: string): string | null => {
    switch (type) {
      case 'callback':
      case 'reminder':
      case 'escalation':
      case 'followup':
      case 'schedule_conflict':
        return '/support-tickets'
      case 'queue_assignment':
        // The agent's queue is what /tickets is filtered by — that is where
        // acting on this notification actually happens.
        return '/tickets'
      case 'request':
        return userRole === 'admin' ? '/admin/requests' : '/roster'
      case 'password_reset':
        // Only admin/team_leader actually see the Roster "Password Resets"
        // tab (app/(app)/roster/page.tsx gates passwordResetRequests to
        // those two roles) - management/hod get this notification too, but
        // there is nothing at /roster for them to click through to yet.
        return (userRole === 'admin' || userRole === 'team_leader') ? '/roster' : null
      default:
        return null
    }
  }, [userRole])

  const refresh = useCallback(async () => {
    const result = await fetchNotificationsAction()
    const list = result.data ?? []
    setNotifications(list)
    // A failed poll carries no information about what is new — leave the pop-up state alone.
    if (result.error) return
    const { popups, seen } = selectNewPopups(seenRef.current, list)
    seenRef.current = seen
    // Drop queued pop-ups that were read elsewhere (another tab, "mark all read") before this agent saw them.
    const unreadIds = new Set(list.filter((n) => !n.read).map((n) => n.id))
    setPopupQueue((prev) => [...prev.filter((p) => unreadIds.has(p.id)), ...popups])
  }, [])

  const markRead = useCallback(async (id: string) => {
    const result = await markNotificationReadAction(id)
    if (result.error) return
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllRead = useCallback(async () => {
    await markAllNotificationsReadAction()
    await refresh()
  }, [refresh])

  useEffect(() => {
    refresh()
    // Was a Supabase Realtime subscription (`postgres_changes`), which only
    // works against a Supabase-hosted Postgres instance — SIT is now a
    // self-managed instance with no equivalent wired up. Polling is a
    // pragmatic stand-in; a push-based replacement (Postgres LISTEN/NOTIFY
    // + SSE/WebSocket, or similar) would need its own design work if
    // near-instant delivery matters more than a ≤30s delay.
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [userId, refresh])

  function dismissPopup(n: Notification) {
    setPopupQueue((prev) => prev.filter((p) => p.id !== n.id))
    markRead(n.id)
  }

  async function viewPopup(n: Notification) {
    setPopupQueue((prev) => prev.filter((p) => p.id !== n.id))
    if (!n.read) await markRead(n.id)
    const dest = getDestination(n.type)
    if (dest) router.push(dest)
  }

  const value = useMemo(
    () => ({ userId, notifications, markRead, markAllRead, getDestination }),
    [userId, notifications, markRead, markAllRead, getDestination],
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {popupQueue.length > 0 && createPortal(
        <NotificationPopup
          notification={popupQueue[0]}
          position={1}
          total={popupQueue.length}
          canView={!!getDestination(popupQueue[0].type)}
          onDismiss={() => dismissPopup(popupQueue[0])}
          onView={() => viewPopup(popupQueue[0])}
        />,
        document.body,
      )}
    </NotificationsContext.Provider>
  )
}
