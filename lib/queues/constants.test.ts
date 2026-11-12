import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ALL_QUEUES,
  ASSIGNABLE_QUEUES,
  EXTENDED_QUEUES,
  PICKER_EXTENDED_QUEUES,
  SOCIAL_QUEUES,
  TRUSTPILOT_LINKEDIN,
} from './constants'

const MIGRATION = join(
  process.cwd(),
  'Database/migrations/queue-additional-platforms-2026-11-01.sql',
)

describe('EXTENDED_QUEUES', () => {
  it('holds the 8 queues added 2026-09-23, in the business’s own casing', () => {
    expect([...EXTENDED_QUEUES]).toEqual([
      'ICASA',
      'ODU',
      'TikTok',
      'LinkedIn',
      'TrustPilot',
      'Reddit',
      'Sprinklr',
      'Dark posts',
    ])
  })

  it('is assignable — a team lead can roster an agent onto each one', () => {
    for (const q of EXTENDED_QUEUES) expect(ASSIGNABLE_QUEUES).toContain(q)
  })

  it('is part of the queue vocabulary the tickets filter accepts', () => {
    for (const q of EXTENDED_QUEUES) expect([...ALL_QUEUES]).toContain(q)
  })

  it('stays OUT of SOCIAL_QUEUES', () => {
    // SOCIAL_QUEUES drives the reporting Social channel summary, which reads
    // support_tickets.channel. These queues are assignment-only — no support
    // ticket can hold one — so including them would add permanently-empty
    // rows to that report.
    for (const q of EXTENDED_QUEUES) {
      expect([...SOCIAL_QUEUES] as string[]).not.toContain(q)
    }
  })

  it('introduces no duplicates into the queue vocabulary', () => {
    expect(new Set(ALL_QUEUES).size).toBe(ALL_QUEUES.length)
    expect(new Set(ASSIGNABLE_QUEUES).size).toBe(ASSIGNABLE_QUEUES.length)
  })

  it('keeps BILLING unassignable, as before', () => {
    expect([...ALL_QUEUES]).toContain('BILLING')
    expect(ASSIGNABLE_QUEUES).not.toContain('BILLING')
  })
})

describe('the CHECK constraint and the TS list must not drift', () => {
  // lib/queues/actions.ts validates against ASSIGNABLE_QUEUES before
  // inserting, and Postgres then validates against
  // agent_queue_assignments_queue_check. A value in one list and not the
  // other is either rejected by the action or blows up at the constraint,
  // so the migration is the other half of this change and is asserted here.
  const sqlText = readFileSync(MIGRATION, 'utf8')

  it('lists every assignable queue in the migration', () => {
    for (const q of ASSIGNABLE_QUEUES) {
      expect(sqlText).toContain(`'${q}'`)
    }
  })

  it('does not widen support_tickets.channel — these are assignment-only', () => {
    // Match the DDL, not the word: the migration's header discusses
    // support_tickets_channel_check at length to explain why it is left
    // alone, so a plain substring check would fail on the comment.
    expect(sqlText).not.toMatch(/ALTER\s+TABLE\s+support_tickets/i)
    expect(sqlText).toMatch(/ALTER\s+TABLE\s+agent_queue_assignments/i)
  })
})

describe('additional platforms (2026-11-01)', () => {
  const sqlText = readFileSync(MIGRATION, 'utf8')

  it('adds the combined TrustPilot & LinkedIn value as assignable, keeping the old ones valid', () => {
    expect(TRUSTPILOT_LINKEDIN).toBe('TrustPilot & LinkedIn')
    expect(ASSIGNABLE_QUEUES).toEqual(expect.arrayContaining(['TrustPilot & LinkedIn', 'TrustPilot', 'LinkedIn']))
  })
  it('offers the combined value instead of the two old ones in the picker', () => {
    expect(PICKER_EXTENDED_QUEUES).toEqual(['ICASA', 'ODU', 'TikTok', 'TrustPilot & LinkedIn', 'Reddit', 'Sprinklr', 'Dark posts'])
  })
  it('creates agent_additional_queues with a cascading profile FK and the same queue check', () => {
    expect(sqlText).toMatch(/CREATE TABLE IF NOT EXISTS agent_additional_queues/)
    expect(sqlText).toMatch(/user_id\s+uuid NOT NULL REFERENCES profiles\(id\) ON DELETE CASCADE/)
    expect(sqlText).toMatch(/created_by\s+uuid REFERENCES profiles\(id\) ON DELETE SET NULL/)
    expect(sqlText).toMatch(/ADD COLUMN IF NOT EXISTS kind/)
  })
})
