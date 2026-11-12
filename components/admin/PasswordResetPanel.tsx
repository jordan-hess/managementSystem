'use client'

import { useState } from 'react'
import { KeyRound, Check, X, Copy, Eye } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { PasswordResetRequest } from '@/types'

interface Props {
  requests: PasswordResetRequest[]
  onApproved?: () => void
}

export default function PasswordResetPanel({ requests: initial, onApproved }: Props) {
  const [requests, setRequests] = useState(initial)
  const [processing, setProcessing] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<{ name: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function review(req: PasswordResetRequest, action: 'approve' | 'reject') {
    setProcessing(req.id)
    const res = await fetch('/api/admin/review-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: req.id, action }),
    })
    const data = await res.json()
    setProcessing(null)

    if (!res.ok) { alert(data.error || 'Something went wrong.'); return }

    setRequests(r => r.filter(r => r.id !== req.id))

    if (action === 'approve' && data.temp_password) {
      setRevealed({ name: req.profiles?.full_name ?? 'User', password: data.temp_password })
      setCopied(false)
      onApproved?.()
    }
  }

  function copyPassword() {
    if (!revealed) return
    navigator.clipboard.writeText(revealed.password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <KeyRound className="w-4 h-4 text-orange-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Password Reset Requests</h2>
          {requests.length > 0 && (
            <span className="ml-auto text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 font-semibold px-2 py-0.5 rounded-full">
              {requests.length} pending
            </span>
          )}
        </div>

        {requests.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No pending reset requests</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {requests.map(req => (
              <div key={req.id} className="px-5 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-sm font-semibold text-orange-700 dark:text-orange-400 shrink-0">
                  {req.profiles?.full_name?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{req.profiles?.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{req.profiles?.email}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => review(req, 'approve')}
                    disabled={processing === req.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {processing === req.id ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => review(req, 'reject')}
                    disabled={processing === req.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 rounded-lg transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Temp password reveal modal */}
      {revealed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRevealed(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-3 w-fit mx-auto mb-4">
              <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Reset Approved</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Share this temporary password with <span className="font-semibold text-gray-700 dark:text-gray-300">{revealed.name}</span> securely. They will be prompted to change it on next login.
            </p>
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 mb-5">
              <span className="flex-1 font-mono text-sm font-semibold text-gray-900 dark:text-white tracking-wide">{revealed.password}</span>
              <button onClick={copyPassword} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mb-5 flex items-center justify-center gap-1">
              <Eye className="w-3.5 h-3.5" /> This password is shown only once and is not stored.
            </p>
            <button onClick={() => setRevealed(null)} className="w-full bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-medium py-2.5 rounded-lg transition">
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}
