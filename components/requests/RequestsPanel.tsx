'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Profile, Team, RequestWithDetail } from '@/types'
import MyRequestsBody from './MyRequestsBody'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  profile: Profile
  userTeam: Team | null
  isAdmin: boolean
  myRequests: RequestWithDetail[]
}

export default function RequestsPanel({ open, onClose, onSuccess, profile, userTeam }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !panelRef.current) return
    import('animejs').then(({ animate }) => {
      animate(panelRef.current!, {
        translateX: [60, 0],
        opacity: [0, 1],
        duration: 280,
        easing: 'easeOutQuart',
      })
      if (overlayRef.current) {
        animate(overlayRef.current, {
          opacity: [0, 1],
          duration: 200,
          easing: 'easeOutQuad',
        })
      }
    })
  }, [open])

  function handleClose() {
    if (!panelRef.current || !overlayRef.current) { onClose(); return }
    import('animejs').then(({ animate }) => {
      animate(panelRef.current!, {
        translateX: [0, 60],
        opacity: [1, 0],
        duration: 200,
        easing: 'easeInQuad',
        onComplete: () => onClose(),
      })
      animate(overlayRef.current!, {
        opacity: [1, 0],
        duration: 180,
        easing: 'easeInQuad',
      })
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40"
        style={{ opacity: 0 }}
        onClick={handleClose}
      />

      <div
        ref={panelRef}
        style={{ opacity: 0 }}
        className="relative w-full sm:w-[480px] h-full bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">Submit a Request</h2>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <MyRequestsBody profile={profile} userTeam={userTeam} onSuccess={() => { onSuccess(); handleClose() }} />
      </div>
    </div>
  )
}
