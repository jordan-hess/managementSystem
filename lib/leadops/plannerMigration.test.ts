import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const MIGRATION = 'Database/migrations/leadops-time-motion-2026-10-09.sql'
const sqlText = () => readFileSync(path.join(process.cwd(), MIGRATION), 'utf8')

describe('the Time & Motion migration encodes the spec', () => {
  it('is one idempotent transaction that creates the four tables', () => {
    const sql = sqlText()
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
    for (const table of ['planner_days', 'planner_block_logs', 'planner_unplanned_entries', 'planner_correction_log']) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })

  it('keys the revision row by team leader and date, and cascades the children from it', () => {
    const sql = sqlText()
    expect(sql).toMatch(/PRIMARY KEY \(tl_id, date\)/)
    expect(sql.match(/FOREIGN KEY \(tl_id, date\) REFERENCES planner_days \(tl_id, date\) ON DELETE CASCADE/g)).toHaveLength(2)
    expect(sql).toMatch(/UNIQUE \(tl_id, date, template_block_id\)/)
  })

  it('enforces the status rules in the database', () => {
    const sql = sqlText()
    expect(sql).toContain("status IN ('completed', 'moved', 'not_completed')")
    expect(sql).toContain('planner_block_logs_status_fields')
    expect(sql).toMatch(/not_completed[\s\S]*actual_minutes IS NULL[\s\S]*actual_category IS NULL[\s\S]*actual_activity IS NULL/)
    expect(sql).toMatch(/BETWEEN 1 AND 1440/)
    expect(sql).toMatch(/char_length\(reason\) <= 1000/)
    expect(sql).toMatch(/char_length\(actual_activity\) <= 200/)
  })

  it('guards every status branch against NULL minutes and blank reasons', () => {
    const start = sqlText().indexOf('CONSTRAINT planner_block_logs_status_fields')
    const end = sqlText().indexOf('CREATE TABLE IF NOT EXISTS planner_unplanned_entries')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const flat = sqlText().slice(start, end).replace(/\s+/g, ' ')
    expect(flat).toContain(
      "(status = 'not_completed' AND actual_minutes IS NULL AND actual_category IS NULL AND actual_activity IS NULL AND reason IS NOT NULL AND btrim(reason) <> '')"
    )
    expect(flat).toContain(
      "(status = 'completed' AND actual_minutes IS NOT NULL AND actual_minutes BETWEEN 1 AND 1440 AND actual_category IS NOT NULL)"
    )
    expect(flat).toContain(
      "(status = 'moved' AND actual_minutes IS NOT NULL AND actual_minutes BETWEEN 1 AND 1440 AND actual_category IS NOT NULL AND reason IS NOT NULL AND btrim(reason) <> '')"
    )
  })

  it('makes the audit table append-only and keeps it free of foreign keys', () => {
    const sql = sqlText()
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON planner_correction_log/)
    expect(sql).toMatch(/BEFORE TRUNCATE ON planner_correction_log/)
    expect(sql).toMatch(/REVOKE ALL ON planner_correction_log FROM PUBLIC/)
    const auditTable = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS planner_correction_log'), sql.indexOf('CREATE OR REPLACE FUNCTION'))
    expect(auditTable.length).toBeGreaterThan(0)
    expect(auditTable).toContain('CREATE TABLE IF NOT EXISTS planner_correction_log')
    expect(auditTable).not.toMatch(/REFERENCES/)
    expect(auditTable).toMatch(/performed_by\s+text\s+NOT NULL CHECK \(btrim\(performed_by\) <> ''\)/)
    expect(auditTable).toMatch(/reason\s+text\s+NOT NULL CHECK \(btrim\(reason\) <> ''\)/)
    expect(auditTable).toMatch(/before_state\s+jsonb\s+NOT NULL/)
    expect(auditTable).toMatch(/after_state\s+jsonb\s+NOT NULL/)
    for (const column of ['performed_by', 'performed_by_role', 'tl_id', 'planner_date', 'reason', 'before_state', 'after_state', 'change_ticket', 'performed_at']) {
      expect(auditTable).toContain(column)
    }
  })
})

/** No application code may read or change the audit table: the only route is the owner-run psql procedure in the runbook. */
describe('planner_correction_log is touched by no application code', () => {
  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full)
    }
    return out
  }

  it('is not referenced by any non-test source file in app, components or lib', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((dir) => sourceFiles(path.join(process.cwd(), dir)))
      .filter((file) => readFileSync(file, 'utf8').includes('planner_correction_log'))
    expect(offenders).toEqual([])
  })
})
