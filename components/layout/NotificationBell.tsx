'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Loader2 } from 'lucide-react'
import { Notification, WarningType } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { createWarningAction } from '@/app/(app)/qa-reviews/warningsActions'
import { countUnseen, newestTimestamp } from '@/lib/unread/lastSeen'
import { useLastSeen } from '@/lib/unread/useLastSeen'
import { useNotifications } from './NotificationsProvider'

const SEEN_SCOPE = 'notifications'

const SICK_PATTERN_REASON = 'Repeated sick leave without a doctor’s note within a 6-week period.'

const WARNING_BUTTONS: { type: WarningType; label: string }[] = [
  { type: 'verbal', label: 'Verbal' },
  { type: 'written', label: 'Written' },
  { type: 'final', label: 'Final' },
]

/** The bell icon and its dropdown. The poll, the list and the pop-up live in NotificationsProvider. */
export default function NotificationBell() {
  const router = useRouter()
  const { userId, notifications, markRead, markAllRead, getDestination } = useNotifications()
  const [open, setOpen] = useState(false)
  const [issuingWarningId, setIssuingWarningId] = useState<string | null>(null)
  const [warningErrorId, setWarningErrorId] = useState<string | null>(null)
  const { lastSeen, markSeen } = useLastSeen(SEEN_SCOPE, userId)

  function toggleOpen() {
    if (!open) {
      const newest = newestTimestamp(notifications)
      if (newest !== null) markSeen(newest)
    }
    setOpen(!open)
  }

  async function handleClick(n: Notification) {
    // attendance_pattern alerts act only through their own warning buttons
    // below — a plain click on the row must not silently dismiss the alert
    // (mark it read) without a warning actually being issued.
    if (n.type === 'attendance_pattern') return
    if (!n.read) await markRead(n.id)
    const dest = getDestination(n.type)
    if (dest) {
      setOpen(false)
      router.push(dest)
    }
  }

  async function handleIssueWarning(n: Notification, warningType: WarningType) {
    if (!n.related_profile_id || issuingWarningId) return
    setIssuingWarningId(n.id)
    try {
      await createWarningAction({
        issuedTo: n.related_profile_id,
        type: warningType,
        reason: SICK_PATTERN_REASON,
        nextSteps: '',
      })
      setWarningErrorId(null)
      await markRead(n.id)
    } catch {
      setWarningErrorId(n.id)
    } finally {
      setIssuingWarningId(null)
    }
  }

  // The red badge counts notifications that are both unread AND newer than the
  // last time the bell was opened ("seen", kept in this browser only — see
  // lib/unread/lastSeen.ts). Opening the bell clears the badge but does not mark
  // anything read, so unread rows stay highlighted and "Mark all read" stays
  // available. lastSeen === undefined means storage has not been read yet.
  const unreadCount = notifications.filter(n => !n.read).length
  const unseenCount = lastSeen === undefined ? 0 : countUnseen(notifications.filter(n => !n.read), lastSeen)

  const badgeColor: Record<string, string> = {
    escalation: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
    followup:   'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
    reminder:   'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
    callback:   'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    request:    'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
    info:       'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    attendance_pattern: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
    schedule_conflict: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400',
    password_reset: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400',
    queue_assignment: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400',
  }

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        title="View notifications"
        className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unseenCount > 0 && (
          <span
            data-testid="notifications-unread-badge"
            className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs w-4 h-4 flex items-center justify-center rounded-full font-medium"
          >
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <span className="font-semibold text-gray-900 dark:text-white text-sm">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} title="Mark all notifications as read" className="text-xs text-blue-600 hover:text-blue-400">
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No notifications</p>
              ) : (
                notifications.map(n => {
                  const navigable = !!getDestination(n.type)
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleClick(n)}
                      title={navigable ? 'Go to details' : undefined}
                      className={`px-4 py-3 transition-colors ${!n.read ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''} ${navigable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : 'cursor-default'}`}
                    >
                      <div className="flex items-start gap-3">
                        {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
                        <div className={`flex-1 ${!n.read ? '' : 'ml-5'}`}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeColor[n.type] || badgeColor.info}`}>
                              {n.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{n.message}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            {n.sender && ` · from ${(n.sender as { full_name: string }).full_name}`}
                            {navigable && <span className="ml-1 text-blue-500 dark:text-blue-400">→ View</span>}
                          </p>

                          {n.type === 'attendance_pattern' && (
                            n.read ? (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">Warning issued</p>
                            ) : (
                              <div className="flex items-center gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                {WARNING_BUTTONS.map(({ type, label }) => (
                                  <button
                                    key={type}
                                    type="button"
                                    disabled={issuingWarningId === n.id}
                                    onClick={() => handleIssueWarning(n, type)}
                                    title={`Issue a ${label.toLowerCase()} warning`}
                                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 rounded-md transition-colors"
                                  >
                                    {issuingWarningId === n.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {label}
                                  </button>
                                ))}
                                {warningErrorId === n.id && (
                                  <span className="text-xs text-red-600 dark:text-red-400">Could not issue — try again.</span>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
