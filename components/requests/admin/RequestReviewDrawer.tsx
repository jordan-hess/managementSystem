'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RequestWithDetail, RequestStatus } from '@/types'
import { X, CheckCircle, XCircle, MessageSquare, Loader2, Calendar, Clock } from 'lucide-react'
import { teamColorClasses } from '@/lib/roster/teamColors'
import { reviewRequestAction } from '@/app/(app)/roster/actions'
import { useFormErrors } from '@/lib/forms/useFormErrors'
import { fieldInputClass, fieldA11y } from '@/lib/forms/fieldStyles'
import FieldError from '@/components/ui/FieldError'
import FormErrorBanner from '@/components/ui/FormErrorBanner'

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  family_responsibility: 'Family Responsibility',
  unpaid: 'Unpaid Leave',
  other: 'Other',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  request: RequestWithDetail | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
  currentUserId: string
}

export default function RequestReviewDrawer({ request, open, onClose, onSuccess, currentUserId }: Props) {
  const router = useRouter()
  const drawerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState<RequestStatus | null>(null)
  const { fieldErrors, formError, setFieldErrors, clearFieldError, clearAll, applyActionError } = useFormErrors<'comment'>(['comment'])

  useEffect(() => {
    if (!open || !drawerRef.current) return
    setComment(request?.admin_comment ?? '')
    clearAll()
    import('animejs').then(({ animate }) => {
      animate(drawerRef.current!, {
        translateX: [60, 0],
        opacity: [0, 1],
        duration: 280,
        easing: 'easeOutQuart',
      })
      if (overlayRef.current) {
        animate(overlayRef.current, { opacity: [0, 1], duration: 200, easing: 'easeOutQuad' })
      }
    })
  }, [open, request, clearAll])

  function handleClose() {
    if (!drawerRef.current) { onClose(); return }
    import('animejs').then(({ animate }) => {
      animate(drawerRef.current!, {
        translateX: [0, 60],
        opacity: [1, 0],
        duration: 200,
        easing: 'easeInQuad',
        onComplete: () => onClose(),
      })
      if (overlayRef.current) {
        animate(overlayRef.current, { opacity: [1, 0], duration: 180, easing: 'easeInQuad' })
      }
    })
  }

  async function handleAction(status: Extract<RequestStatus, 'approved' | 'rejected' | 'changes_requested'>) {
    if (!request) return
    clearAll()
    if ((status === 'rejected' || status === 'changes_requested') && !comment.trim()) {
      setFieldErrors({ comment: 'A comment is required when rejecting or requesting changes.' })
      return
    }
    setSaving(status)

    const result = await reviewRequestAction(request.id, status, comment.trim() || undefined)

    if (result.error) { setSaving(null); applyActionError(result); return }

    setSaving(null)
    router.refresh()
    onSuccess()
    handleClose()
  }

  if (!open || !request) return null

  const leaveDetail = request.leave_requests?.[0]
  const otDetail = request.overtime_requests?.[0]
  const entries = otDetail?.overtime_entries ?? []

  const totals = entries.reduce(
    (acc, e) => ({ ot_1_5: acc.ot_1_5 + e.ot_1_5, ot_2_0: acc.ot_2_0 + e.ot_2_0, night_hours: acc.night_hours + e.night_hours }),
    { ot_1_5: 0, ot_2_0: 0, night_hours: 0 }
  )

  const teamColors = request.teams ? teamColorClasses[request.teams.color] : null
  const initials = (request.profiles?.full_name ?? '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div
        ref={overlayRef}
        style={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      <div
        ref={drawerRef}
        style={{ opacity: 0 }}
        className="relative w-full sm:w-[520px] h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${teamColors ? teamColors.bg : 'bg-blue-500'}`}>
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {request.profiles?.full_name ?? 'Unknown'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {request.type === 'leave' ? 'Leave Request' : 'Overtime Request'}
                {request.teams && <span className="ml-1">· {request.teams.name} Team</span>}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status + metadata */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={request.status} />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Submitted {new Date(request.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          {/* Leave detail */}
          {leaveDetail && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {LEAVE_TYPE_LABELS[leaveDetail.leave_type] ?? leaveDetail.leave_type}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  · {leaveDetail.dates.length} day{leaveDetail.dates.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 overflow-hidden">
                {leaveDetail.dates.map(d => (
                  <div key={d} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {new Date(d + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>

              {leaveDetail.notes && (
                <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{leaveDetail.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Overtime detail */}
          {otDetail && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {MONTH_NAMES[otDetail.month - 1]} {otDetail.year}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  · {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
                </span>
              </div>

              {entries.length > 0 && (
                <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        {['Date', 'Shift', 'OT 1.5', 'OT 2.0', 'Night'].map(h => (
                          <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {entries.map(e => (
                        <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">
                            {new Date(e.date + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400 capitalize">{e.shift}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{e.ot_1_5 || '—'}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{e.ot_2_0 || '—'}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{e.night_hours || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <td className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 col-span-2" colSpan={2}>Totals</td>
                        <td className="px-2 py-2 font-semibold text-gray-900 dark:text-white">{totals.ot_1_5 || '—'}</td>
                        <td className="px-2 py-2 font-semibold text-gray-900 dark:text-white">{totals.ot_2_0 || '—'}</td>
                        <td className="px-2 py-2 font-semibold text-gray-900 dark:text-white">{totals.night_hours || '—'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {otDetail.notes && (
                <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{otDetail.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Existing admin comment */}
          {request.admin_comment && request.status !== 'pending' && (
            <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/50">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Admin Comment</p>
              <p className="text-sm text-amber-800 dark:text-amber-300">{request.admin_comment}</p>
            </div>
          )}

          {/* Action area */}
          {request.status === 'pending' || request.status === 'changes_requested' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Comment <span className="text-gray-400 font-normal">(required for Reject / Request Changes)</span>
                </label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={e => { setComment(e.target.value); clearFieldError('comment') }}
                  rows={3}
                  placeholder="Add a comment for the employee..."
                  className={fieldInputClass('w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none', !!fieldErrors.comment)}
                  {...fieldA11y('review-comment', fieldErrors.comment)}
                />
                <FieldError id="review-comment" message={fieldErrors.comment} />
              </div>

              <FormErrorBanner message={formError} />

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleAction('approved')}
                  disabled={!!saving}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition-colors"
                >
                  {saving === 'approved' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => handleAction('changes_requested')}
                  disabled={!!saving}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 rounded-lg transition-colors"
                >
                  {saving === 'changes_requested' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  Changes
                </button>
                <button
                  onClick={() => handleAction('rejected')}
                  disabled={!!saving}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition-colors"
                >
                  {saving === 'rejected' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This request has been <span className="font-medium">{request.status.replace('_', ' ')}</span>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const map: Record<RequestStatus, string> = {
    draft:              'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    pending:            'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    approved:           'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    rejected:           'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    changes_requested:  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  }
  const labels: Record<RequestStatus, string> = {
    draft: 'Draft', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', changes_requested: 'Changes Requested',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>
      {labels[status]}
    </span>
  )
}
