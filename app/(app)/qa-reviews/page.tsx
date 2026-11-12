import Link from 'next/link'
import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { isQaReviewer, qaConfigCanManage, qaReviewCanDelete } from '@/lib/auth/authz'
import { redirect } from 'next/navigation'
import { Plus, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import Header from '@/components/layout/Header'
import ReviewTable from '@/components/qaReviews/ReviewTable'
import QaReviewOverview from '@/components/qaReviews/QaReviewOverview'
import QaOverviewReport from '@/components/qaReviews/QaOverviewReport'
import WarningsManager from '@/components/warnings/WarningsManager'
import { listReviews, getReviewableAgents, REVIEWS_PAGE_SIZE } from '@/lib/qa/reviewPageData'
import { getQaReviewOverview, resolveOverviewPeriod, OverviewPeriod } from '@/lib/qa/reviewOverviewData'
import { getQaOverviewReport } from '@/lib/qa/overviewReportData'
import { DEPARTMENT_LABELS } from '@/lib/qa/constants'
import { SCORECARD_ITEMS, type ItemCode } from '@/lib/qa/scorecard'
import { DEPARTMENTS, groupAgentsByDepartment, type Department } from '@/lib/departments'
import { Role, Warning, WarningTargetCandidate } from '@/types'

interface Props {
  searchParams: Promise<{
    agentId?: string; from?: string; to?: string; page?: string
    period?: string; overviewDepartment?: string; category?: string; department?: string
  }>
}

export default async function QaReviewsPage({ searchParams }: Props) {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/home')

  const [profile] = await sql<{ id: string; role: Role }[]>`SELECT id, role FROM profiles WHERE id = ${userId}`
  if (!profile) redirect('/home')
  if (!isQaReviewer(profile.role)) redirect('/dashboard')

  const params = await searchParams
  const from = params.from || undefined
  const to = params.to || undefined
  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const period: OverviewPeriod = params.period === 'week' || params.period === 'month' ? params.period : 'day'
  const overviewDepartment = DEPARTMENTS.includes(params.overviewDepartment as Department) ? (params.overviewDepartment as Department) : undefined
  const categoryCode = SCORECARD_ITEMS.find((i) => i.code === params.category)?.code as ItemCode | undefined
  const overviewRange = resolveOverviewPeriod(period)

  const canManageSettings = qaConfigCanManage(profile.role)
  const isAdmin = profile.role === 'admin'
  const isManagement = profile.role === 'management' || profile.role === 'hod'
  const department = DEPARTMENTS.includes(params.department as Department) ? (params.department as Department) : undefined

  const [agents, overviewStats, overviewReport] = await Promise.all([
    getReviewableAgents(),
    getQaReviewOverview({ from: overviewRange.from, to: overviewRange.to, department: overviewDepartment, itemCode: categoryCode }),
    getQaOverviewReport({ from: overviewRange.from, to: overviewRange.to, department: overviewDepartment }),
  ])
  const agentsByDepartment = groupAgentsByDepartment(agents)
  const { rows, totalCount } = await listReviews({ agentId: params.agentId || undefined, department, from, to, page })

  const totalPages = Math.max(1, Math.ceil(totalCount / REVIEWS_PAGE_SIZE))

  function pageHref(targetPage: number): string {
    const sp = new URLSearchParams()
    if (params.agentId) sp.set('agentId', params.agentId)
    if (params.department) sp.set('department', params.department)
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    if (params.period) sp.set('period', params.period)
    if (params.overviewDepartment) sp.set('overviewDepartment', params.overviewDepartment)
    if (params.category) sp.set('category', params.category)
    sp.set('page', String(targetPage))
    return `/qa-reviews?${sp.toString()}`
  }

  // Relocated from the old standalone /qa-reviews/warnings page — this
  // page already redirects agents (and everyone else isQaReviewer excludes)
  // away above, so the audience here is exactly the same as that page had.
  const warnings = await sql<(Warning & { target: { id: string; full_name: string; email: string; role: string }; issuer: { id: string; full_name: string; email: string } })[]>`
    SELECT w.*,
      jsonb_build_object('id', tgt.id, 'full_name', tgt.full_name, 'email', tgt.email, 'role', tgt.role) AS target,
      jsonb_build_object('id', iss.id, 'full_name', COALESCE(iss.full_name, 'Deleted user'), 'email', COALESCE(iss.email, '')) AS issuer
    FROM warnings w
    JOIN profiles tgt ON tgt.id = w.issued_to
    LEFT JOIN profiles iss ON iss.id = w.issued_by
    ORDER BY w.created_at DESC
  `

  let targetCandidates: WarningTargetCandidate[] = []
  if (isManagement) {
    const leaders = await sql<{ profiles: WarningTargetCandidate }[]>`
      SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email) AS profiles
      FROM team_leaders tl JOIN profiles p ON p.id = tl.profile_id
    `
    const map = new Map<string, WarningTargetCandidate>()
    for (const row of leaders) {
      const p = row.profiles
      if (p && !map.has(p.id)) map.set(p.id, p)
    }
    targetCandidates = Array.from(map.values())
  } else if (isAdmin) {
    targetCandidates = await sql<WarningTargetCandidate[]>`
      SELECT id, full_name, email FROM profiles WHERE role = 'agent' AND is_active = true ORDER BY full_name
    `
  }

  return (
    <div className="flex-1 flex flex-col">
      <Header title="QA Reviews" userId={userId} userRole={profile.role} />
      <div className="p-6 space-y-4">
        <QaReviewOverview
          stats={overviewStats}
          period={period}
          department={overviewDepartment}
          categoryCode={categoryCode}
          hiddenParams={{
            ...(params.agentId ? { agentId: params.agentId } : {}),
            ...(params.department ? { department: params.department } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          }}
        />

        <QaOverviewReport
          report={overviewReport}
          departments={overviewDepartment ? [overviewDepartment] : DEPARTMENTS}
          from={overviewRange.from}
          to={overviewRange.to}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            {params.period && <input type="hidden" name="period" value={params.period} />}
            {params.overviewDepartment && <input type="hidden" name="overviewDepartment" value={params.overviewDepartment} />}
            {params.category && <input type="hidden" name="category" value={params.category} />}
            <select name="department" defaultValue={params.department ?? ''} className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]">
              <option value="">All departments</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>)}
            </select>
            <select name="agentId" defaultValue={params.agentId ?? ''} className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]">
              <option value="">All agents</option>
              {DEPARTMENTS.map((d) => agentsByDepartment[d].length > 0 && (
                <optgroup key={d} label={d}>
                  {agentsByDepartment[d].map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </optgroup>
              ))}
            </select>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From</label>
              <input type="date" name="from" defaultValue={from ?? ''} className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To</label>
              <input type="date" name="to" defaultValue={to ?? ''} className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white dark:[color-scheme:dark]" />
            </div>
            <button type="submit" className="text-sm font-medium px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Filter</button>
          </form>
          <div className="flex items-center gap-2">
            {canManageSettings && (
              <Link href="/qa-reviews/settings" className="flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                <Settings className="w-4 h-4" /> Scorecard settings
              </Link>
            )}
            <Link href="/qa-reviews/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> New Review
            </Link>
          </div>
        </div>

        <ReviewTable rows={rows} deletableIds={rows.filter((r) => qaReviewCanDelete(userId, profile.role, r.reviewer_id)).map((r) => r.id)} />

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} title="Previous page" className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                <ChevronLeft className="w-4 h-4" />
              </Link>
            ) : (
              <span className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-700">
                <ChevronLeft className="w-4 h-4" />
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">Page {page} of {totalPages} · {totalCount} review{totalCount === 1 ? '' : 's'}</span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} title="Next page" className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <span className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-700">
                <ChevronRight className="w-4 h-4" />
              </span>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Warnings</h2>
          <WarningsManager
            warnings={(warnings ?? []) as Warning[]}
            targetCandidates={targetCandidates}
            currentUserId={userId}
            isManagement={isManagement}
          />
        </div>
      </div>
    </div>
  )
}
