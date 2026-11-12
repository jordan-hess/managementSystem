'use client'

import { useRouter } from 'next/navigation'
import RequestsAdminPanel from './RequestsAdminPanel'
import PasswordResetPanel from '@/components/admin/PasswordResetPanel'
import { RequestWithDetail, PasswordResetRequest } from '@/types'

interface Props {
  requests: RequestWithDetail[]
  currentUserId: string
  resetRequests: PasswordResetRequest[]
}

export default function AdminRequestsWrapper({ requests, currentUserId, resetRequests }: Props) {
  const router = useRouter()
  return (
    <div className="space-y-6">
      <RequestsAdminPanel
        requests={requests}
        currentUserId={currentUserId}
        onRefresh={() => router.refresh()}
      />
      <PasswordResetPanel requests={resetRequests} onApproved={() => router.refresh()} />
    </div>
  )
}
