import type { TransactionSql } from 'postgres'
import { sql } from '@/lib/db/pool'
import { withCustomerLock } from './withCustomerLock'
import { getActiveAssistanceForCustomer } from './getActiveAssistance'
import { logTicketActivity } from './logActivity'
import { ActiveAssistanceSource, CreateCheckResult } from '@/types'

interface CreateWithDuplicateCheckArgs<T> {
  customerId: string
  actorId: string
  overrideDuplicateWarning?: boolean
  insert: (tx: TransactionSql) => Promise<{ row: T; sourceType: ActiveAssistanceSource; sourceId: string }>
}

/**
 * The race-safe "create a ticket-like record for this customer" wrapper.
 * Every create action (support ticket, followup, callback, T2 ticket) goes
 * through this instead of a bare INSERT.
 *
 * Why this actually closes the race: two simultaneous creates for the same
 * customer both call withCustomerLock. The first to arrive acquires the
 * advisory lock and proceeds uninterrupted — reads getActiveAssistanceForCustomer
 * (sees nothing), inserts, commits (which releases the lock). The second
 * caller's lock acquisition itself BLOCKS — it cannot even begin its own
 * recheck — until the first transaction ends. Only then does it acquire the
 * lock and recheck, which now sees the first transaction's already-committed
 * row (READ COMMITTED), so it correctly reports a duplicate instead of
 * inserting a second record. The caller's own pre-check (an earlier, unlocked
 * call for UI responsiveness) can't itself be race-safe — arbitrary time
 * passes between that read and the user clicking submit — which is exactly
 * why this in-transaction recheck, not the UI, is the actual authority.
 */
export async function createWithDuplicateCheck<T>(
  args: CreateWithDuplicateCheckArgs<T>,
): Promise<CreateCheckResult<T>> {
  return withCustomerLock(args.customerId, async (tx) => {
    const txSql = tx as unknown as typeof sql
    const active = await getActiveAssistanceForCustomer(args.customerId, txSql)

    if (active.length > 0 && !args.overrideDuplicateWarning) {
      return { duplicates: active }
    }

    const { row, sourceType, sourceId } = await args.insert(tx)

    if (active.length > 0) {
      await logTicketActivity(txSql, {
        sourceType, sourceId, customerId: args.customerId, actorId: args.actorId,
        eventType: 'duplicate_warning_overridden',
        note: `Proceeded despite ${active.length} active record(s): ${active.map(a => `${a.sourceType}:${a.sourceId}`).join(', ')}`,
      })
    }
    await logTicketActivity(txSql, {
      sourceType, sourceId, customerId: args.customerId, actorId: args.actorId, eventType: 'created',
    })

    return { data: row }
  })
}
