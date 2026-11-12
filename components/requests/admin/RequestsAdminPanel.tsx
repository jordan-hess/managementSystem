'use client'

import { useRef, useState } from 'react'
import { RequestWithDetail, RequestStatus, RequestType } from '@/types'
import { teamColorClasses } from '@/lib/roster/teamColors'
import { Calendar, Clock, Search, SlidersHorizontal } from 'lucide-react'
import RequestReviewDrawer from './RequestReviewDrawer'

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual',
  sick: 'Sick',
  family_responsibility: 'Family',
  unpaid: 'Unpaid',
  other: 'Other',
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface Props {
  requests: RequestWithDetail[]
  currentUserId: string
  onRefresh: () => void
}

export default function RequestsAdminPanel({ requests, currentUserId, onRefresh }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | RequestType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | RequestStatus>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<RequestWithDetail | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Collect unique teams from requests
  const teams = [...new Map(
    requests.filter(r => r.teams).map(r => [r.teams!.id, r.teams!])
  ).values()]

  const filtered = requests.filter(r => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (teamFilter !== 'all' && r.team_id !== teamFilter) return false
    if (search) {
      const name = r.profiles?.full_name?.toLowerCase() ?? ''
      if (!name.includes(search.toLowerCase())) return false
    }
    return true
  })

  function openDrawer(req: RequestWithDetail) {
    setSelected(req)
    setDrawerOpen(true)
  }

  const statusMap: Record<RequestStatus, string> = {
    draft:             'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    pending:           'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    approved:          'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    rejected:          'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    changes_requested: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  }
  const statusLabels: Record<RequestStatus, string> = {
    draft: 'Draft', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', changes_requested: 'Changes Req.',
  }

  const selectCls = 'px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)} className={selectCls}>
            <option value="all">All Types</option>
            <option value="leave">Leave</option>
            <option value="overtime">Overtime</option>
          </select>

          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className={selectCls}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="changes_requested">Changes Requested</option>
          </select>

          {/* Team filter */}
          {teams.length > 0 && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className={selectCls}>
              <option value="all">All Teams</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name} Team</option>
              ))}
            </select>
          )}

          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto whitespace-nowrap">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Request cards */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm py-16 text-center">
          <SlidersHorizontal className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No requests match the current filters.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden bg-white dark:bg-gray-900 divide-y divide-gray-50 dark:divide-gray-800">
          {filtered.map(req => {
            const teamColors = req.teams ? teamColorClasses[req.teams.color] : null
            const initials = (req.profiles?.full_name ?? '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
            const leaveDetail = req.leave_requests?.[0]
            const otDetail = req.overtime_requests?.[0]

            return (
              <div
                key={req.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
              >
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${teamColors ? teamColors.bg : 'bg-gray-400'}`}>
                  {initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {req.profiles?.full_name ?? 'Unknown'}
                    </p>
                    {req.teams && (
                      <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${teamColors?.lightBg} ${teamColors?.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${teamColors?.dot}`} />
                        {req.teams.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {/* Type badge */}
                    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${
                      req.type === 'leave'
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                    }`}>
                      {req.type === 'leave' ? <Calendar className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {req.type === 'leave' ? 'Leave' : 'Overtime'}
                    </span>

                    {/* Quick summary */}
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {leaveDetail
                        ? `${LEAVE_TYPE_LABELS[leaveDetail.leave_type] ?? leaveDetail.leave_type} · ${leaveDetail.dates.length} day${leaveDetail.dates.length !== 1 ? 's' : ''}`
                        : otDetail
                          ? `${MONTH_NAMES[otDetail.month - 1]} ${otDetail.year}`
                          : ''}
                    </span>

                    {/* Date */}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(req.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                {/* Status + Review */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusMap[req.status]}`}>
                    {statusLabels[req.status]}
                  </span>
                  <button
                    onClick={() => openDrawer(req)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Review
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Review drawer */}
      <RequestReviewDrawer
        request={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={() => { onRefresh(); setDrawerOpen(false) }}
        currentUserId={currentUserId}
      />
    </div>
  )
}
