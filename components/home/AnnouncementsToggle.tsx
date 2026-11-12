'use client'

import { useState } from 'react'
import { Megaphone } from 'lucide-react'
import ManagementPostBoard from './ManagementPostBoard'
import { ManagementPost } from '@/types'
import { countUnseen, newestTimestamp } from '@/lib/unread/lastSeen'
import { useLastSeen } from '@/lib/unread/useLastSeen'

interface Props {
  posts: ManagementPost[]
  userId: string
  canPost: boolean
}

const SEEN_SCOPE = 'announcements'

export default function AnnouncementsToggle({ posts, userId, canPost }: Props) {
  const [open, setOpen] = useState(false)
  // lastSeen is undefined until the browser has read localStorage; no dot is
  // shown until then, which avoids a red flash on every page load.
  const { lastSeen, markSeen } = useLastSeen(SEEN_SCOPE, userId)

  // Your own posts never count as unseen.
  const hasUnseen = lastSeen !== undefined && countUnseen(posts.filter(p => p.author_id !== userId), lastSeen) > 0

  function openPanel() {
    setOpen(true)
    const newest = newestTimestamp(posts)
    if (newest !== null) markSeen(newest)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label="Announcements"
        title="Announcements"
        className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <Megaphone className="w-5 h-5" />
        {hasUnseen && (
          <span
            data-testid="announcements-unread-dot"
            aria-label="New announcements"
            className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900"
          />
        )}
      </button>

      {/* Slides in from the right instead of a centered modal, so it never
          covers the page's own content — that stays visible to the left. */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setOpen(false)}
      />
      <div
        className={`fixed right-0 top-0 h-screen w-full sm:w-md bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* No header or close button here — the board below carries its own
            "Announcements" title, and clicking the backdrop closes the panel. */}
        <div className="flex-1 min-h-0">
          <ManagementPostBoard posts={posts} userId={userId} canPost={canPost} />
        </div>
      </div>
    </>
  )
}
