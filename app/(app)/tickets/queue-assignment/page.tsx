import { sql } from '@/lib/db/pool'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { canManageQueueAssignment, type Role } from '@/lib/auth/authz'
import Header from '@/components/layout/Header'
import { getAgentDepartment } from '@/lib/departments'
import { todayDate, mondayOf, weekDates } from '@/lib/queues/assignments'
import QueueBoard from '@/components/queues/board/QueueBoard'
import { buildBoards, type BoardAgent, type QueueBoardProps } from '@/lib/queues/board'

// Team Lead / Management: the Queue Board — drag active agents between queue
// lanes for today, or plan a Monday-Sunday week. Role-gated in proxy.ts
// (team_leader/admin/management/hod/qa_analyst) in addition to the action checks; canEdit
// mirrors canManageQueueAssignment for the client.
//
// Relocated from app/(app)/t2/queues/page.tsx (Phase 2) — originally fed the
// full 9-value ALL_QUEUES list instead of T2's 4, now that "current queue"
// spans both T2 and Social queues. Billing tickets are created via a
// dedicated "BOPs Ticket" button, not routed through this feature, and the
// agent_queue_assignments_queue_check CHECK constraint doesn't permit
// 'BILLING' (the lanes in lib/queues/board.ts are ASSIGNABLE_QUEUES). This is
// the "assign *someone else's* queue" tool and coexists with MyQueueWidget's
// self-service picker without overlap (different actor/target pairing on the
// same underlying table).
//
// Replaces the old per-agent dropdown panel (QueueAssignmentPanel). Only
// active agents appear on the board; the loader pulls today plus the selected
// week (?week=YYYY-MM-DD, snapped to its Monday) in one main-assignments
// query and one additional-platforms query.
export default async function TicketsQueueAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const userId = await getCurrentUserId()
  const [profile] = await sql<{ role: string }[]>`SELECT role FROM profiles WHERE id = ${userId!}`
  const role = profile?.role ?? 'agent'

  const today = await todayDate()
  // A malformed or impossible date (e.g. 2026-13-45) is treated as absent.
  const hasWeek = !!week && /^\d{4}-\d{2}-\d{2}$/.test(week) && !Number.isNaN(Date.parse(`${week}T00:00:00Z`))
  const monday = mondayOf(hasWeek ? week : today)
  const weekDays = weekDates(monday)
  const dates = [...new Set([today, ...weekDays])]

  const [agentRows, assignmentRows, additionalRows] = await Promise.all([
    sql<{
      id: string; full_name: string; department: string | null; t2_team: string | null; team_department: string | null
    }[]>`
      SELECT p.id, p.full_name, p.department, p.t2_team,
        (SELECT t.department FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.profile_id = p.id LIMIT 1) AS team_department
      FROM profiles p
      WHERE p.role = 'agent' AND p.is_active = true
      ORDER BY p.full_name ASC
    `,
    sql<{ user_id: string; date: string; queue: string }[]>`
      SELECT user_id, date, queue FROM agent_queue_assignments WHERE date = ANY(${dates})
    `,
    sql<{ user_id: string; date: string; queue: string }[]>`
      SELECT user_id, date, queue FROM agent_additional_queues WHERE date = ANY(${dates})
    `,
  ])

  const agents: BoardAgent[] = agentRows.map((a) => ({
    id: a.id,
    full_name: a.full_name,
    department: getAgentDepartment(a),
  }))

  // Assignments for people without a card (self-assigned non-agents,
  // deactivated agents) are dropped so every count matches the lanes.
  const boards = buildBoards(dates, agents.map((a) => a.id), assignmentRows, additionalRows)

  const props: QueueBoardProps = {
    today,
    weekDays,
    agents,
    boards,
    canEdit: canManageQueueAssignment(role as Role),
    initialTab: hasWeek ? 'week' : 'today',
  }

  return (
    <div>
      <Header title="Queue Board" userId={userId!} userRole={role} />
      <div className="p-6">
        <QueueBoard {...props} />
      </div>
    </div>
  )
}
