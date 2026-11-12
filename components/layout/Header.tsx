'use client'

import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { getHeaderProfileAction } from './actions'
import NotificationBell from './NotificationBell'
import AccountModal from './AccountModal'
import SettingsPopover from './SettingsPopover'

interface HeaderProps {
  title: React.ReactNode
  userId: string
  userRole?: string
  /** Extra page-specific action rendered before the notification bell — e.g. the home page's Announcements toggle. */
  extraAction?: React.ReactNode
}

export default function Header({ title, userId, extraAction }: HeaderProps) {
  const [profile, setProfile] = useState({ full_name: '', email: '' })
  const [accountOpen, setAccountOpen] = useState(false)

  useEffect(() => {
    getHeaderProfileAction().then(data => {
      if (data) setProfile({ full_name: data.full_name, email: data.email })
    })
  }, [userId])

  const initial = profile.full_name.charAt(0).toUpperCase() || '?'

  return (
    <header className="flex items-center justify-between px-16 pb-15">
      <div className="flex flex-col justify-between self-stretch">
        <div className="pl-2 pt-6 text-6xl font-extrabold tracking-tight shrink-0" aria-label="OpsHub">
          <span className="text-gray-400">ops</span><span className="text-blue-600">HUB</span>
        </div>
        <div className="text-2xl font-semibold text-gray-900 dark:text-white pl-2">{title}</div>
      </div>

      <div className="flex items-center gap-2">
        {extraAction}
        <NotificationBell />

        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-semibold text-white shrink-0">
          {initial}
        </div>

        <button
          onClick={() => setAccountOpen(true)}
          title="View your account settings"
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <SettingsPopover />
      </div>

      <AccountModal
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        userId={userId}
        fullName={profile.full_name}
        email={profile.email}
      />
    </header>
  )
}
