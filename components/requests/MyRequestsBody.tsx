'use client'

import { useEffect, useRef, useState } from 'react'
import { Profile, Team } from '@/types'
import LeaveRequestForm from './LeaveRequestForm'
import OvertimeRequestForm from './OvertimeRequestForm'

type RequestTab = 'leave' | 'overtime'

interface Props {
  profile: Profile
  userTeam: Team | null
  onSuccess: () => void
}

export default function MyRequestsBody({ profile, userTeam, onSuccess }: Props) {
  const [tab, setTab] = useState<RequestTab>('leave')
  const [tabKey, setTabKey] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  function handleTabChange(t: RequestTab) {
    if (t === tab) return
    setTab(t)
    setTabKey(k => k + 1)
  }

  useEffect(() => {
    if (!contentRef.current) return
    import('animejs').then(({ animate }) => {
      animate(contentRef.current!, {
        opacity: [0, 1],
        translateX: [10, 0],
        duration: 180,
        easing: 'easeOutQuad',
      })
    })
  }, [tabKey])

  return (
    <>
      <div className="flex items-center gap-1 px-5 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center border border-gray-700 rounded-lg overflow-hidden">
          {(['leave', 'overtime'] as RequestTab[]).map(t => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {t === 'leave' ? 'Leave Request' : 'Overtime Request'}
            </button>
          ))}
        </div>
      </div>

      <div ref={contentRef} key={tabKey} className="flex-1 overflow-y-auto">
        {tab === 'leave' ? (
          <LeaveRequestForm profile={profile} userTeam={userTeam} onSuccess={onSuccess} />
        ) : (
          <OvertimeRequestForm profile={profile} userTeam={userTeam} onSuccess={onSuccess} />
        )}
      </div>
    </>
  )
}
