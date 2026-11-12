'use client'

import { useEffect, useRef, useState } from 'react'
import { Profile, Team, RequestWithDetail, PasswordResetRequest } from '@/types'
import { Inbox, X, User, Users2, KeyRound } from 'lucide-react'
import MyRequestsBody from '@/components/requests/MyRequestsBody'
import TeamRequestsBody from './TeamRequestsBody'
import PasswordResetPanel from '@/components/admin/PasswordResetPanel'

type HubTab = 'mine' | 'team' | 'passwordResets'

interface Props {
  open: boolean
  onClose: () => void
  profile: Profile
  userTeam: Team | null
  requests: RequestWithDetail[]
  /** Pending password-reset requests this viewer may act on - agent/team_leader
   *  targets for both admin and team_leader, plus admin/t3/qa_analyst targets
   *  (reviewed as a peer) for admin only - scoped server-side in
   *  app/(app)/roster/page.tsx to match /api/admin/review-password-reset's
   *  own authorization. */
  passwordResetRequests?: PasswordResetRequest[]
  currentUserId: string
  onRefresh: () => void
  teamLeaderTeamIds?: string[]
}

export default function AdminRequestsPanel({ open, onClose, profile, userTeam, requests, passwordResetRequests = [], currentUserId, onRefresh, teamLeaderTeamIds }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<HubTab>('team')

  useEffect(() => {
    if (!open || !panelRef.current) return
    import('animejs').then(({ animate }) => {
      animate(panelRef.current!, {
        scale: [0.97, 1],
        opacity: [0, 1],
        duration: 260,
        easing: 'easeOutQuart',
      })
      if (overlayRef.current) {
        animate(overlayRef.current, { opacity: [0, 1], duration: 200, easing: 'easeOutQuad' })
      }
    })
  }, [open])

  function handleClose() {
    if (!panelRef.current) { onClose(); return }
    import('animejs').then(({ animate }) => {
      animate(panelRef.current!, {
        scale: [1, 0.97],
        opacity: [1, 0],
        duration: 180,
        easing: 'easeInQuad',
        onComplete: () => onClose(),
      })
      if (overlayRef.current) {
        animate(overlayRef.current, { opacity: [1, 0], duration: 160, easing: 'easeInQuad' })
      }
    })
  }

  if (!open) return null

  const pendingCount = requests.filter(r => r.status === 'pending' || r.status === 'changes_requested').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        ref={overlayRef}
        style={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />

      <div
        ref={panelRef}
        style={{ opacity: 0 }}
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Requests</h2>
            {tab === 'team' && pendingCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                {pendingCount} pending
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setTab('mine')}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'mine'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" /> My Requests
            </button>
            <button
              onClick={() => setTab('team')}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'team'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Users2 className="w-3.5 h-3.5" /> Team Requests
              {pendingCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ml-0.5 ${
                  tab === 'team' ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                }`}>
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('passwordResets')}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'passwordResets'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" /> Password Resets
              {passwordResetRequests.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ml-0.5 ${
                  tab === 'passwordResets' ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                }`}>
                  {passwordResetRequests.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {tab === 'mine' && (
          <div className="flex-1 flex flex-col bg-gray-900 overflow-hidden">
            <MyRequestsBody profile={profile} userTeam={userTeam} onSuccess={() => { onRefresh(); handleClose() }} />
          </div>
        )}
        {tab === 'team' && (
          <TeamRequestsBody requests={requests} currentUserId={currentUserId} onRefresh={onRefresh} teamLeaderTeamIds={teamLeaderTeamIds} />
        )}
        {tab === 'passwordResets' && (
          <div className="flex-1 overflow-y-auto p-6">
            <PasswordResetPanel requests={passwordResetRequests} onApproved={onRefresh} />
          </div>
        )}
      </div>
    </div>
  )
}
