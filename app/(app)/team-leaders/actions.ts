'use server'

import { sql } from '@/lib/db/pool'
import { withTransaction } from '@/lib/db/tx'
import { getCurrentUserId } from '@/lib/auth/getCurrentUserId'
import { canAdministerTeamManagement, canAccessTeamManagement, Role } from '@/lib/auth/authz'
import type { Team, TeamColor } from '@/types'
import type { TransactionSql } from 'postgres'

/**
 * TeamLeadersBoard.tsx and EditPersonModal.tsx previously had NO app-code
 * authorization at all — they relied entirely on RLS for team_leaders,
 * team_members, teams, and profiles writes (confirmed during the migration
 * audit of this file). RLS is gone, so every mutation below re-implements
 * the final RLS rule for the table it touches — widened once since, to let
 * team_leader touch plain team_members rows (not team_leaders) and to let
 * management touch team_leaders (previously admin-only):
 *
 *  - team_leaders   INSERT/UPDATE/DELETE (moveToLeaderSlot; the leader-half
 *    of moveToTeam and removeFromTeam): role IN ('admin','management') —
 *    still stricter than the other roster tables (see
 *    team-leaders-schema.sql), team_leader is deliberately excluded from
 *    this tier since it grants/moves leadership and can auto-promote the
 *    target to 'team_leader' (an existing admin stays admin).
 *  - team_members/teams INSERT/UPDATE/DELETE for a PLAIN member (the
 *    member-half of moveToTeam and removeFromTeam): role IN
 *    ('team_leader','admin','management') — team_leader may move/remove a
 *    plain agent between teams but not touch a team_leaders row.
 *  - teams create/rename/delete, addPersonToTeam (AddToTeamModal), and
 *    profiles UPDATE (role promotion / is_active toggle): role IN
 *    ('admin','management') only — team_leader excluded. The profiles-UPDATE
 *    path also mirrors Database/migrations/fix-self-role-escalation.sql: an
 *    admin/management user may never use this path to change their OWN role.
 *
 * qa_analyst holds the admin tier on this page too (2026-11 product
 * decision): the "admin/management" tier above is canAdministerTeamManagement
 * and the "team_leader or above" tier is canAccessTeamManagement — both
 * page-scoped in lib/auth/authz.ts, so qa_analyst gains nothing elsewhere.
 *
 * The DB trigger enforce_team_leader_is_admin (team-leaders-schema.sql)
 * still runs unmodified and independently rejects any team_leaders
 * insert/update whose target profile isn't role 'admin' — that's data-driven
 * (checks the target row, not the connecting user) and needs no app-code
 * equivalent.
 */
async function currentUserAndRole(): Promise<{ userId: string; role: Role } | { error: string }> {
  const userId = await getCurrentUserId()
  if (!userId) return { error: 'Not authenticated.' }
  const rows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${userId}`
  const role = rows[0]?.role
  if (!role) return { error: 'Profile not found.' }
  return { userId, role }
}

/** Postgres unique_violation — a duplicate team name or profile email. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}

async function requireAdminOrManagement(): Promise<{ userId: string } | { error: string }> {
  const auth = await currentUserAndRole()
  if ('error' in auth) return auth
  if (!canAdministerTeamManagement(auth.role)) return { error: 'You do not have permission to perform this action.' }
  return { userId: auth.userId }
}

/**
 * team_members no longer enforces one row per profile at the DB level (see
 * Database/migrations/team-members-allow-multi-team-leaders.sql) — a
 * team_leader/admin profile can now hold a row in more than one team at
 * once (their own dedicated roster is a future feature, so for now they
 * just aren't pinned to a single team the way an agent is). Every other
 * role still gets at most one team, enforced here in app code: moving them
 * clears any other existing team_members row first.
 */
async function upsertTeamMembership(tx: TransactionSql, personId: string, teamId: string, targetRole: Role): Promise<void> {
  const multiTeamEligible = targetRole === 'team_leader' || targetRole === 'admin'
  if (!multiTeamEligible) {
    await tx`DELETE FROM team_members WHERE profile_id = ${personId} AND team_id != ${teamId}`
  }
  await tx`
    INSERT INTO team_members (profile_id, team_id, joined_at)
    VALUES (${personId}, ${teamId}, NOW())
    ON CONFLICT (team_id, profile_id) DO UPDATE SET joined_at = EXCLUDED.joined_at
  `
}

/** Drag a person (leader or plain member) into another team's Members zone. */
export async function moveToTeam(personId: string, newTeamId: string): Promise<{ success: true } | { error: string }> {
  const auth = await currentUserAndRole()
  if ('error' in auth) return auth
  const { role } = auth

  if (!canAccessTeamManagement(role)) return { error: 'You do not have permission to move team members.' }

  // Dragging a leader into a Members zone means "resign leadership" —
  // team_leaders writes are admin/management-only, so a team_leader user
  // can't do this half of the move even though they can do the
  // team_members half below.
  const oldLed = await sql<{ team_id: string }[]>`SELECT team_id FROM team_leaders WHERE profile_id = ${personId}`
  if (oldLed.length > 0 && !canAdministerTeamManagement(role)) {
    return { error: 'Only admins or management can resign a team leader — please try again.' }
  }

  const targetRows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${personId}`
  const targetRole = targetRows[0]?.role
  if (!targetRole) return { error: 'Profile not found.' }

  try {
    await withTransaction(async tx => {
      if (oldLed.length > 0) {
        await tx`DELETE FROM team_leaders WHERE team_id = ${oldLed[0].team_id} AND profile_id = ${personId}`
      }
      await upsertTeamMembership(tx, personId, newTeamId, targetRole)
    })
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not move — please try again.' }
  }
}

/** Drag a person into a team's Leader slot — promotes to team_leader if needed (leaves an existing admin as admin), assigns leadership, ensures membership. */
export async function moveToLeaderSlot(
  personId: string,
  newTeamId: string,
  currentRole: Role,
): Promise<{ success: true } | { error: string }> {
  const auth = await currentUserAndRole()
  if ('error' in auth) return auth
  const { userId, role } = auth

  // The whole operation writes team_leaders, which is admin/management-only.
  if (!canAdministerTeamManagement(role)) return { error: 'You do not have permission to assign team leaders.' }

  if (currentRole !== 'admin' && currentRole !== 'team_leader') {
    if (personId === userId) {
      // Mirrors fix-self-role-escalation.sql: never allow a role change
      // targeting the acting user's own row via this path.
      return { error: 'You cannot change your own role.' }
    }
    try {
      await sql`UPDATE profiles SET role = 'team_leader', updated_at = NOW() WHERE id = ${personId}`
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Could not promote to team leader — please try again.' }
    }
  }

  // By this point the person is guaranteed admin or team_leader (either
  // already, or just promoted above) — both are multi-team-eligible, so
  // dragging them onto another team's Leader slot ADDS a second leadership
  // (team_leaders has no unique(profile_id) — only unique(team_id), one
  // leader per team, never enforced per-person) rather than resigning their
  // existing one. upsertTeamMembership follows the same "duplicate, don't
  // move" rule for the team_members half.
  const effectiveRole: Role = currentRole === 'admin' ? 'admin' : 'team_leader'

  try {
    await withTransaction(async tx => {
      await tx`
        INSERT INTO team_leaders (team_id, profile_id, assigned_by)
        VALUES (${newTeamId}, ${personId}, ${userId})
        ON CONFLICT (team_id) DO UPDATE SET profile_id = EXCLUDED.profile_id, assigned_by = EXCLUDED.assigned_by
      `
      await upsertTeamMembership(tx, personId, newTeamId, effectiveRole)
    })
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not assign as leader — please try again.' }
  }
}

export async function removeFromTeam(
  personId: string,
  teamId: string,
  isLeader: boolean,
): Promise<{ success: true } | { error: string }> {
  const auth = await currentUserAndRole()
  if ('error' in auth) return auth
  const { role } = auth

  if (isLeader && !canAdministerTeamManagement(role)) return { error: 'You do not have permission to remove a team leader.' }
  if (!canAccessTeamManagement(role)) return { error: 'You do not have permission to remove team members.' }

  try {
    await withTransaction(async tx => {
      if (isLeader) {
        await tx`DELETE FROM team_leaders WHERE profile_id = ${personId} AND team_id = ${teamId}`
      }
      // Deletes only the row for THIS team — a team_leader/admin can now
      // hold a team_members row in more than one team at once (see
      // upsertTeamMembership), so this must never touch their other rows.
      await tx`DELETE FROM team_members WHERE profile_id = ${personId} AND team_id = ${teamId}`
    })
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not remove from team — please try again.' }
  }
}

export async function deleteTeam(teamId: string): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdminOrManagement()
  if ('error' in auth) return auth

  try {
    await sql`DELETE FROM teams WHERE id = ${teamId}`
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete team — please try again.' }
  }
}

export async function toggleProfileActive(
  personId: string,
  isActive: boolean,
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdminOrManagement()
  if ('error' in auth) return auth

  try {
    await sql`UPDATE profiles SET is_active = ${!isActive}, updated_at = NOW() WHERE id = ${personId}`
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not update status — please try again.' }
  }
}

/**
 * "Delete account" — team_leader/admin/management/hod tier (canAccessTeamManagement).
 * Permanently removes the profile row; toggleProfileActive above is the
 * reversible option. Relies on Database/migrations/hard-delete-profiles-2026-10-29.sql:
 * every FK to profiles(id) is CASCADE (personal data — team membership,
 * attendance, requests, notifications, warnings issued to them, notes, ...)
 * or SET NULL (shared history — QA reviews, tickets, follow-ups, coaching
 * actions, audit/status logs, ...), so history survives and reads as
 * "Deleted user". A 23503 here means a FK was added since that migration
 * without an ON DELETE rule.
 *
 * team_leader-tier callers may only target a plain 'agent' — matches every
 * other team_leader-tier restriction in this file (can't touch a team_leaders
 * row or an admin/management-tier profile). admin/management/hod may delete
 * any account except their own.
 */
export async function deleteUserAccount(personId: string): Promise<{ success: true } | { error: string }> {
  const auth = await currentUserAndRole()
  if ('error' in auth) return auth
  const { userId, role } = auth

  if (!canAccessTeamManagement(role)) return { error: 'You do not have permission to delete this account.' }
  if (personId === userId) return { error: 'You cannot delete your own account.' }

  const targetRows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${personId}`
  const targetRole = targetRows[0]?.role
  if (!targetRole) return { error: 'Profile not found.' }

  if (!canAdministerTeamManagement(role) && targetRole !== 'agent') {
    return { error: 'Only admins or management can delete this account.' }
  }

  try {
    await sql`DELETE FROM profiles WHERE id = ${personId}`
    return { success: true }
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23503') {
      return { error: 'This account is still referenced by records that block deletion — deactivate it instead and contact support.' }
    }
    return { error: err instanceof Error ? err.message : 'Could not delete account — please try again.' }
  }
}

export interface EditPersonInput {
  full_name: string
  email: string
  department: string | null
  role: Role
}

/**
 * profiles UPDATE for the Edit Person modal (full_name/email/department/role).
 * team_leader-tier callers may open this modal too, but may only change
 * email — full_name/department/role are held at their existing values for
 * them, enforced here (not just hidden client-side in EditPersonModal.tsx),
 * since this is a network-reachable action regardless of what the UI shows.
 * Self-role-escalation guard: if the target profile is the acting user's
 * own row, the role field is silently held at its existing value instead of
 * being rejected outright — this mirrors the modal's own client-side guard
 * (the role <select> is disabled when editing yourself) and
 * fix-self-role-escalation.sql's DB-level behavior for the equivalent case.
 */
export async function updatePersonProfile(
  personId: string,
  input: EditPersonInput,
): Promise<{ success: true } | { error: string; field?: 'email' }> {
  const auth = await currentUserAndRole()
  if ('error' in auth) return auth
  const { userId, role: actingRole } = auth

  if (!canAccessTeamManagement(actingRole)) return { error: 'You do not have permission to edit this profile.' }
  const canEditRoleAndDept = canAdministerTeamManagement(actingRole)

  const existingRows = await sql<{ full_name: string; role: Role; department: string | null }[]>`
    SELECT full_name, role, department FROM profiles WHERE id = ${personId}
  `
  const existing = existingRows[0]
  if (!existing) return { error: 'Profile not found.' }

  const nextRole = (personId === userId || !canEditRoleAndDept) ? existing.role : input.role
  const nextFullName = canEditRoleAndDept ? input.full_name : existing.full_name
  const nextDepartment = canEditRoleAndDept ? input.department?.trim() || null : existing.department

  try {
    await sql`
      UPDATE profiles
      SET full_name = ${nextFullName}, email = ${input.email}, department = ${nextDepartment}, role = ${nextRole}, updated_at = NOW()
      WHERE id = ${personId}
    `
    return { success: true }
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'Another account already uses that email.', field: 'email' }
    return { error: err instanceof Error ? err.message : 'Failed to save changes.' }
  }
}

/** Used by components/team-leaders/AddTeamModal.tsx — teams INSERT, admin/management only. */
export async function createTeam(
  name: string,
  color: TeamColor,
): Promise<{ data: Team } | { error: string; field?: 'name' }> {
  const auth = await requireAdminOrManagement()
  if ('error' in auth) return auth

  try {
    const rows = await sql<Team[]>`
      INSERT INTO teams (name, color)
      VALUES (${name}, ${color})
      RETURNING *
    `
    return { data: rows[0] }
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'A team with that name already exists.', field: 'name' }
    return { error: err instanceof Error ? err.message : 'Could not create team — please try again.' }
  }
}

/** Used by components/team-leaders/EditTeamNameModal.tsx — teams UPDATE, admin/management only. */
export async function renameTeam(
  teamId: string,
  name: string,
): Promise<{ success: true } | { error: string; field?: 'name' }> {
  const auth = await requireAdminOrManagement()
  if ('error' in auth) return auth

  try {
    await sql`UPDATE teams SET name = ${name}, updated_at = NOW() WHERE id = ${teamId}`
    return { success: true }
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'A team with that name already exists.', field: 'name' }
    return { error: err instanceof Error ? err.message : 'Could not rename team — please try again.' }
  }
}

/**
 * Used by components/team-leaders/AddToTeamModal.tsx — team_members INSERT,
 * admin/management only. Unlike moveToTeam (drag-and-drop), this action is
 * only ever invoked with a person from the "unassigned" list, so there is no
 * existing team_leaders row to reconcile — a plain upsert on team_members is
 * the whole operation.
 */
export async function addPersonToTeam(
  personId: string,
  teamId: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await requireAdminOrManagement()
  if ('error' in auth) return auth

  const targetRows = await sql<{ role: Role }[]>`SELECT role FROM profiles WHERE id = ${personId}`
  const targetRole = targetRows[0]?.role
  if (!targetRole) return { error: 'Profile not found.' }

  try {
    await withTransaction(tx => upsertTeamMembership(tx, personId, teamId, targetRole))
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add to team — please try again.' }
  }
}
