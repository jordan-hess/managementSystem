'use client'

import { useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import type { Notification } from '@/types'

interface Props {
  notification: Notification
  /** 1-based place in the queue of pop-ups waiting to be read. */
  position: number
  total: number
  /** Whether the notification has a page to open — View is hidden when it doesn't. */
  canView: boolean
  onDismiss: () => void
  onView: () => void
}

const TYPE_BADGE: Record<string, string> = {
  escalation: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  reminder: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  callback: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
}

/**
 * Centered, blocking pop-up for the notifications an agent must not miss
 * (see lib/notifications/popup.ts for which types). Stays until the agent acts.
 */
export default function NotificationPopup({ notification, position, total, canView, onDismiss, onView }: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null)

  // New notification in the queue -> put focus on the main action so Enter acts straight away.
  useEffect(() => { primaryRef.current?.focus() }, [notification.id])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  const sender = (notification.sender as { full_name: string } | null | undefined)?.full_name
  const titleId = `notification-popup-title-${notification.id}`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-6"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 p-2.5">
            <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_BADGE[notification.type] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                {notification.type}
              </span>
              {total > 1 && <span className="text-xs text-gray-500 dark:text-gray-400">{position} of {total}</span>}
            </div>
            <h2 id={titleId} className="mt-1.5 text-base font-semibold text-gray-900 dark:text-white">{notification.title}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{notification.message}</p>
            {sender && <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">from {sender}</p>}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            ref={canView ? undefined : primaryRef}
            onClick={onDismiss}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Dismiss
          </button>
          {canView && (
            <button
              type="button"
              ref={primaryRef}
              onClick={onView}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              View
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
