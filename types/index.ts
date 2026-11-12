import type { ItemCode, QaLegs, RatingLabel, ClosingLine } from '@/lib/qa/scorecard'
import type { Department } from '@/lib/departments'

export type Role = 'agent' | 'admin' | 'management' | 'team_leader' | 't3' | 'qa_analyst' | 'hod'
export type CallbackStatus = 'pending' | 'completed' | 'cancelled' | 'rescheduled'
export type FollowupStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type FollowupType = 'followup' | 'escalation'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type NotificationType = 'info' | 'followup' | 'escalation' | 'reminder' | 'request' | 'callback' | 'attendance_pattern' | 'warning' | 'schedule_conflict' | 'password_reset' | 'queue_assignment'
export type SupportTicketChannel = 'freescout' | 'whatsapp' | 'hellopeter' | 'mybroadband' | 'pissedcustomer'
export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated' | 'follow_up' | 'callback'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  department: string | null
  avatar_url: string | null
  is_active: boolean
  force_password_change: boolean
  created_at: string
  updated_at: string
  // T2 Queue Hub merge: set only for profiles migrated from T2 (see
  // add-team-leader-and-t3-roles.sql) — null for original CMS profiles.
  // Sidebar uses this to tell a "T2 agent" (restricted nav: T2 stats/form +
  // Roster only) from an original CMS agent (full nav, unchanged).
  t2_team?: string | null
  username?: string | null
  /** A team leader's own personal 28/30-day rotation (see
   *  lib/roster/resolveShift.ts's personalPatterns lookup) — independent of
   *  team membership, since a team leader rotates on their own schedule,
   *  not a team's. Null for everyone else. */
  rotation_pattern_id?: string | null
}

export interface PasswordResetRequest {
  id: string
  profile_id: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  profiles?: Pick<Profile, 'full_name' | 'email'>
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  account_number: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  profiles?: Pick<Profile, 'full_name' | 'email'>
}

export interface Callback {
  id: string
  customer_id: string | null
  agent_id: string | null
  created_by: string | null
  scheduled_at: string
  query_description: string
  possible_solution: string | null
  status: CallbackStatus
  notes: string | null
  completed_at: string | null
  reminder_sent: boolean
  // T2/Social/Billing queue or channel this callback relates to — see
  // Database/migrations/followups-callbacks-queue-field-2026-10-02.sql.
  // Null for callbacks created before that migration.
  queue: string | null
  // Manual (callback-only) contact details — set only when customer_id is null.
  // See Database/migrations/callbacks-contact-details-2026-10-12.sql. Personal data.
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  created_at: string
  updated_at: string
  customers?: Pick<Customer, 'name' | 'phone'>
  profiles?: Pick<Profile, 'full_name'>
}

export interface Followup {
  id: string
  customer_id: string
  agent_id: string | null
  created_by: string | null
  type: FollowupType
  query_description: string
  possible_solution: string | null
  status: FollowupStatus
  priority: Priority
  due_date: string | null
  resolution_notes: string | null
  resolved_at: string | null
  category_id: string | null
  cancellation_reason: string | null
  collection_address: string | null
  // T2/Social/Billing queue or channel this follow-up/escalation relates to
  // — see Database/migrations/followups-callbacks-queue-field-2026-10-02.sql.
  // Null for rows created before that migration.
  queue: string | null
  created_at: string
  updated_at: string
  customers?: Pick<Customer, 'name' | 'phone'>
  profiles?: Pick<Profile, 'full_name'>
  creator?: Pick<Profile, 'full_name'>
  case_categories?: Pick<CaseCategory, 'id' | 'name' | 'is_active'> | null
}

export interface SupportTicket {
  id: string
  customer_id: string
  agent_id: string | null
  created_by: string | null
  channel: SupportTicketChannel
  reference: string | null
  query_description: string
  query_type: string | null
  issue_type: string | null
  root_cause: string | null
  status: SupportTicketStatus
  priority: Priority
  due_date: string | null
  resolution_notes: string | null
  resolved_at: string | null
  // Added by Database/migrations/support-tickets-status-fields.sql, one
  // notes/scheduled-at pair per non-terminal status the status control can
  // move a ticket into.
  escalation_destination: string | null
  escalation_notes: string | null
  followup_notes: string | null
  followup_scheduled_at: string | null
  callback_notes: string | null
  callback_scheduled_at: string | null
  created_at: string
  updated_at: string
  customers?: Pick<Customer, 'name' | 'phone'>
  profiles?: Pick<Profile, 'full_name'>
  creator?: Pick<Profile, 'full_name'>
}

export interface CaseCategory {
  id: string
  name: string
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Row shape of the customer_callback_history view — every agent's callbacks for a customer. */
export interface CustomerCallbackHistoryRow extends Callback {
  agent_name: string
}

/** Row shape of the customer_case_history view — every agent's cases for a customer. */
export interface CustomerCaseHistoryRow extends Followup {
  agent_name: string
  creator_name: string
  category_name: string | null
}

export interface Notification {
  id: string
  recipient_id: string
  sender_id: string | null
  followup_id: string | null
  callback_id: string | null
  request_id: string | null
  password_reset_request_id: string | null
  related_profile_id: string | null
  title: string
  message: string
  type: NotificationType
  read: boolean
  read_at: string | null
  created_at: string
  sender?: Pick<Profile, 'full_name'>
  followups?: Pick<Followup, 'type' | 'status' | 'customer_id'>
}

export interface FollowupStatusHistory {
  id: string
  followup_id: string
  changed_by: string | null
  from_status: FollowupStatus
  to_status: FollowupStatus
  comment: string | null
  changed_at: string
  profiles?: Pick<Profile, 'full_name'>
}

/** Mirrors FollowupStatusHistory's shape (see Database/migrations/
 *  support-tickets-status-fields.sql) — no `comment` column, unlike
 *  followup_status_history. */
export interface SupportTicketStatusHistory {
  id: string
  support_ticket_id: string
  changed_by: string | null
  from_status: SupportTicketStatus
  to_status: SupportTicketStatus
  changed_at: string
  profiles?: Pick<Profile, 'full_name'>
}

// ── Customer Active Assistance ──────────────────────────────────────────
// "Is anyone already assisting this customer right now" — a customer-scoped,
// source-agnostic view across the four ticket-like tables (support_tickets,
// followups, callbacks, T2's tickets), all of which share the same
// customers(id) FK. See lib/activeAssistance/.

export type ActiveAssistanceSource = 'support_ticket' | 'followup' | 'callback' | 't2_ticket'

export interface ActiveAssistanceRecord {
  sourceType: ActiveAssistanceSource
  sourceId: string
  ticketLabel: string
  queueOrChannel: string | null
  status: string
  agentId: string | null
  agentName: string | null
  updatedAt: string
}

/** Full per-customer ticket history (all statuses, not just active) — see lib/customers/getTicketHistory.ts. */
export interface TicketHistoryRecord extends ActiveAssistanceRecord {
  createdAt: string
  // Needed by lib/tickets/getUnifiedTicketList.ts's cross-customer list (not
  // by lib/customers/getTicketHistory.ts's own customer-scoped queries,
  // which already know the customer — populated there too for shape parity).
  customerId: string | null
  customerName: string | null
  issueType: string | null
  rootCause: string | null
}

export type TicketActivityEventType = 'created' | 'ownership_transferred' | 'duplicate_warning_overridden'

export interface TicketActivityLogEntry {
  id: string
  source_type: ActiveAssistanceSource
  source_id: string
  customer_id: string
  event_type: TicketActivityEventType
  actor_id: string | null
  from_agent_id: string | null
  to_agent_id: string | null
  note: string | null
  created_at: string
}

/** Result shape for any create action that now goes through the duplicate-check wrapper. */
export type CreateCheckResult<T> =
  | { data: T; duplicates?: undefined; error?: undefined }
  | { data?: undefined; duplicates: ActiveAssistanceRecord[]; error?: undefined }
  | { data?: undefined; duplicates?: undefined; error: string }

/** Shared shape for the "Assign to" candidate pool (agents ∪ team leaders) */
export type FollowupAssignee = Pick<Profile, 'id' | 'full_name' | 'email' | 'department' | 't2_team'> & {
  /** This agent's roster team's department, when known — see lib/departments.ts's DepartmentProfile for why this takes priority over t2_team. */
  team_department?: string | null
}

// ─── Roster ──────────────────────────────────────────────────────────────────

export type TeamColor = 'green' | 'blue' | 'red' | 'yellow'
export type AttendanceStatus = 'on_shift' | 'late' | 'absent' | 'sick' | 'leave' | 'off'
export type OverrideType = 'off' | 'swap_in' | 'extra_shift'
export type CalendarView = 'month' | 'week' | 'day'
export type TeamGroup = 'social' | 't2' | 'mixed'

export interface Team {
  id: string
  name: string
  color: TeamColor
  description: string | null
  /** When set, this team's schedule is computed automatically from a rotation pattern instead of manually-assigned shift_templates/team_rotations. */
  rotation_pattern_id: string | null
  /** Backfilled from name prefix (see teams-department-grouping.sql) — null for any team outside the Social/T2/Billing naming convention, shown as "Other" in grouped filters. */
  department: string | null
  created_at: string
  updated_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  profile_id: string
  joined_at: string
  teams?: Pick<Team, 'id' | 'name' | 'color'>
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email' | 'is_active'>
}

/** One management-dashboard console: a team leader's team's aggregated agent activity */
export interface TeamLeaderConsoleData {
  teamId: string
  teamName: string
  teamColor: TeamColor
  leaderName: string
  totalCustomers: number
  pendingCallbacks: number
  openFollowups: number
  unreadAlerts: number
}

export interface ShiftTemplate {
  id: string
  name: string
  start_time: string   // 'HH:MM:SS' from Postgres
  end_time: string
  work_days: number[]  // ISO day-of-week: 1=Mon … 7=Sun
  description: string | null
  is_late_shift: boolean
  created_at: string
  updated_at: string
}

export interface TeamRotation {
  id: string
  team_id: string
  shift_template_id: string
  week_start_date: string   // 'YYYY-MM-DD', always a Monday
  created_by: string | null
  created_at: string
  teams?: Pick<Team, 'id' | 'name' | 'color'>
  shift_templates?: Pick<ShiftTemplate, 'id' | 'name' | 'start_time' | 'end_time' | 'work_days' | 'is_late_shift'>
}

export interface AttendanceRecord {
  id: string
  profile_id: string
  date: string   // 'YYYY-MM-DD'
  status: AttendanceStatus
  notes: string | null
  has_doctor_note: boolean
  marked_by: string | null
  marked_at: string
  created_at: string
  updated_at: string
}

export interface AgentLoginLog {
  id: string
  profile_id: string
  login_date: string   // 'YYYY-MM-DD'
  first_login_at: string
  created_at: string
}

export interface RosterOverride {
  id: string
  profile_id: string
  date: string   // 'YYYY-MM-DD'
  override_type: OverrideType
  shift_template_id: string | null
  /** For a team on the automatic pattern-based rotation — see Team.rotation_pattern_id. */
  override_shift: 'EARLY' | 'LATE' | 'OFF' | null
  notes: string | null
  created_by: string | null
  created_at: string
  shift_templates?: Pick<ShiftTemplate, 'id' | 'name' | 'start_time' | 'end_time'> | null
}

/** Fully resolved shift state for one agent on one date — computed client-side */
export interface ResolvedDaySlot {
  profileId: string
  date: string
  isWorkDay: boolean
  shiftTemplate: ShiftTemplate | null
  overrideType: OverrideType | null
  attendanceStatus: AttendanceStatus | null
  effectiveStatus: AttendanceStatus | 'off' | 'no_rotation'
  /** The note left on this day's roster override, if any — set by buildSlotMap, shown on hover in the month grid. */
  overrideNotes?: string | null
}

/** Shape passed from roster page.tsx → RosterManager */
export interface RosterPageData {
  profile: Profile
  teams: (Team & { team_members: TeamMember[] })[]
  allProfiles: (Pick<Profile, 'id' | 'full_name' | 'email' | 'is_active' | 'role' | 't2_team' | 'rotation_pattern_id' | 'department'> & {
    /** This agent's roster team's department, when known — see lib/departments.ts's DepartmentProfile for why this takes priority over t2_team. */
    team_department?: string | null
  })[]
  shiftTemplates: ShiftTemplate[]
  rotations: TeamRotation[]
  attendanceRecords: AttendanceRecord[]
  overrides: RosterOverride[]
  loginLog: AgentLoginLog[]
  userTeam: Team | null
  myRequests?: RequestWithDetail[]
  pendingRequests?: RequestWithDetail[]
  /** Admin/team_leader only — every pending password_reset_requests row, unscoped by team (any team leader can review any agent's or peer team leader's reset request). Empty for Management/agent viewers. */
  passwordResetRequests?: PasswordResetRequest[]
  teamLeaderTeamIds?: string[]
  teamLeaders?: Pick<Profile, 'id' | 'full_name' | 'is_active' | 'role'>[]
  patterns?: RosterRotationPattern[]
  /** Every agent-role profile regardless of is_active — unlike `allProfiles`
   *  (active-only, drives the rotation grid), this feeds the Active/On
   *  Break/In a Meeting/Inactive summary widget, which needs to be able to
   *  show a 4th "Inactive" bucket. Only fetched for admin/management/
   *  team_leader-role viewers. */
  allAgentsForStatus?: Pick<Profile, 'id' | 'full_name' | 'is_active'>[]
}

/** An automatic EARLY/LATE/OFF rotation — either a team's (Team.rotation_pattern_id, always 28 days so far)
 *  or a team leader's own personal one (Profile.rotation_pattern_id, e.g. 30 days) — see
 *  lib/roster/rotationEngine.ts, whose cycle length is the sequence's own length, not a fixed constant. */
export interface RosterRotationPattern {
  id: string
  code: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'
  shift_sequence: ('EARLY' | 'LATE' | 'OFF')[]
  anchor_date: string
  created_at: string
  updated_at: string
}

// ─── Team Leaders ─────────────────────────────────────────────────────────────

export interface TeamLeader {
  id: string
  team_id: string
  profile_id: string
  assigned_by: string | null
  created_at: string
  teams?: Pick<Team, 'id' | 'name' | 'color'>
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>
}

export interface RequestApprovalHistory {
  id: string
  request_id: string
  changed_by: string | null
  from_status: RequestStatus
  to_status: RequestStatus
  comment: string | null
  changed_at: string
  profiles?: Pick<Profile, 'full_name'>
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export type RequestStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'changes_requested'
export type RequestType = 'leave' | 'overtime'
export type LeaveType = 'annual' | 'sick' | 'family_responsibility' | 'unpaid' | 'other'
export type ShiftType = 'day' | 'night' | 'evening'

export interface Request {
  id: string
  profile_id: string
  team_id: string | null
  type: RequestType
  status: RequestStatus
  admin_comment: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email'>
  teams?: Pick<Team, 'id' | 'name' | 'color'> | null
  reviewer?: Pick<Profile, 'full_name'> | null
}

export interface LeaveRequest {
  id: string
  request_id: string
  leave_type: LeaveType
  dates: string[]
  notes: string | null
}

export interface OvertimeRequest {
  id: string
  request_id: string
  month: number
  year: number
  notes: string | null
  overtime_entries?: OvertimeEntry[]
}

export interface OvertimeEntry {
  id: string
  overtime_request_id: string
  date: string
  shift: ShiftType
  ot_1_5: number
  ot_2_0: number
  night_hours: number
  sort_order: number
}

/** A request with its type-specific detail joined in */
export interface RequestWithDetail extends Request {
  leave_requests?: LeaveRequest[]
  overtime_requests?: (OvertimeRequest & { overtime_entries?: OvertimeEntry[] })[]
}

// ─── Warnings ─────────────────────────────────────────────────────────────────

export type WarningType = 'verbal' | 'written' | 'final'

export interface Warning {
  id: string
  issued_to: string
  issued_by: string | null
  type: WarningType
  reason: string
  next_steps: string | null
  created_at: string
  updated_at: string
  target?: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>
  issuer?: Pick<Profile, 'id' | 'full_name' | 'email'>
}

/** Shared shape for the "who can I warn" target-candidate pool */
export type WarningTargetCandidate = Pick<Profile, 'id' | 'full_name' | 'email'>

// ─── Home page ──────────────────────────────────────────────────────────────

export type ManagementPostCategory = 'announcement' | 'challenge' | 'event' | 'general'

export interface ManagementPostReaction {
  id: string
  post_id: string
  profile_id: string
  emoji: string
  created_at: string
  profiles?: Pick<Profile, 'full_name'>
}

export interface ManagementPost {
  id: string
  author_id: string | null
  title: string | null
  category: ManagementPostCategory
  content: string
  image_url: string | null
  created_at: string
  author?: Pick<Profile, 'id' | 'full_name'>
  management_post_reactions?: ManagementPostReaction[]
}

export interface AgentKudos {
  id: string
  agent_id: string
  note: string
  customer_name: string | null
  rating: number
  created_by: string | null
  created_at: string
  agent?: Pick<Profile, 'id' | 'full_name'>
}

export interface PersonalNote {
  id: string
  profile_id: string
  content: string
  created_at: string
  updated_at: string
}

// ─── Team Leaders Management (board view-model) ────────────────────────────────

/** Computed client-side board-column view-model, one per team */
export interface TeamBoardColumn {
  team: Team
  leader: (Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active'> & { teamLeaderRowId: string }) | null
  members: Pick<Profile, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'is_active'>[]
}

// ─── Holistic QA Platform (Phase 1) ────────────────────────────────────────
// Replaced the old point-scored QA Management System (qa_templates/
// qa_assessments and friends), dropped entirely — see
// Database/migrations/qa-drop-old-assessment-system.sql.

export type { ItemCode, QaLegs, RatingLabel, ClosingLine }

export interface QaSettings {
  id: string
  pass_mark: number
  excellent_from: number
  critical_fail_cap: number
  effective_from: string
  created_by: string | null
  created_by_name?: string | null
  created_at: string
  updated_at: string
}

export interface QaCriticalFailureType {
  id: string
  name: string
  description: string | null
  /** Set = reason tag for that critical item; null = coaching-only flag. */
  item_code: 'C1' | 'C2' | 'C3' | null
  requires_coaching: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** Managed "Query / Category" dropdown option, per department (qa_query_categories). */
export interface QaQueryCategory {
  id: string
  department: Department
  name: string
  is_active: boolean
  sort_order: number
}

export interface QaReview {
  id: string
  agent_id: string | null
  reviewer_id: string | null
  /** The agent's team leader when the review was saved; null if they had none. */
  team_leader_id: string | null
  legs: QaLegs
  department: Department
  interaction_date: string
  review_date: string
  category_id: string | null
  /** Optional free-text detail for the category. */
  interaction_type: string | null
  ticket_reference: string | null
  customer_reference: string | null
  call_reference: string | null
  secondary_agent_name: string | null
  raw_score: number | null
  final_score: number | null
  critical_fail: boolean
  rating_label: RatingLabel
  closing_line: ClosingLine
  settings_id: string
  fcr: 'yes' | 'no' | 'na' | null
  root_cause_type_id: string | null
  gap_identified: string | null
  solution: string | null
  overall_comments: string | null
  agent_feedback: string | null
  created_at: string
  updated_at: string
  agent?: { id: string | null; full_name: string }
  reviewer?: { id: string | null; full_name: string }
}

export interface QaReviewItem {
  id: string
  review_id: string
  item_code: ItemCode
  written_value: string | null
  call_value: string | null
  points_snapshot: number
  used: number
  earned: number
  comments: string | null
  evidence: string | null
}

export interface QaReviewCriticalFailure {
  id: string
  review_id: string
  critical_failure_type_id: string
  notes: string | null
  requires_coaching_snapshot: boolean
  created_by: string | null
  created_at: string
  critical_failure_type?: Pick<QaCriticalFailureType, 'id' | 'name' | 'item_code'>
}

export interface QaAuditLogEntry {
  id: string
  review_id: string
  actor_id: string | null
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  reason: string | null
  created_at: string
  actor?: { id: string | null; full_name: string }
}

export type CoachingActionStatus = 'open' | 'in_progress' | 'completed'

export interface CoachingAction {
  id: string
  review_id: string
  agent_id: string | null
  category: string
  notes: string | null
  required_action: string
  due_date: string | null
  owner_id: string | null
  status: CoachingActionStatus
  completed_at: string | null
  completed_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  owner?: { id: string | null; full_name: string }
  created_by_profile?: { id: string | null; full_name: string }
  completed_by_profile?: Pick<Profile, 'id' | 'full_name'>
}

/** Composed view-model for the review detail/edit page. */
export interface QaReviewWithDetail extends QaReview {
  items: QaReviewItem[]
  criticalFailures: QaReviewCriticalFailure[]
  auditLog: QaAuditLogEntry[]
  coachingActions: CoachingAction[]
}

export interface QueueReassignment {
  id: string
  user_id: string | null
  date: string
  previous_queue: string | null
  /** NULL = sent to the bench (assignment removed). */
  new_queue: string | null
  reason: string | null
  changed_by: string | null
  effective_at: string | null
  /** 'additional' = an additional-platform change (agent_additional_queues). */
  kind: 'main' | 'additional'
}
