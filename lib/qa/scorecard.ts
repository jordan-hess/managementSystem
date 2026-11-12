/**
 * QA Scorecard scoring — pure, no I/O, no lib/db imports (used by
 * 'use client' code and by server actions alike). Formulas follow
 * docs/superpowers/specs/2026-10-20-qa-scorecard-design.md ("Scoring");
 * item text is transcribed verbatim from the spec source §4–§6.
 */

export type ItemCode = 'C1' | 'C2' | 'C3' | 'B1' | 'B2' | 'B3' | 'B4' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
export type Section = 'critical' | 'must_do' | 'quality'
export type QaLegs = 'written' | 'call' | 'both'
export type Leg = 'written' | 'call'
export type LegValue = 'yes' | 'no' | 'na' | 0 | 1 | 2 | 3 | 4 | 5 | null

export interface ScorecardItemDef {
  code: ItemCode
  section: Section
  label: string
  hint?: string
  points: number
  yesWhen?: string
  noWhen?: string
  anchors?: [string, string, string, string, string, string]
}

export const RATING_NAMES = ['Not done', 'Poor', 'Below Standard', 'Meets Minimum', 'Good', 'Excellent'] as const

export const SCORECARD_ITEMS: readonly ScorecardItemDef[] = [
  {
    code: 'C1',
    section: 'critical',
    label: 'Verification & data protection',
    points: 0,
    yesWhen:
      'Written: moved to DM/private channel before any account detail. Call: name + DOB + required checks and call-recording disclosure before the account is discussed. Only the verified holder / authorised person is given or asked for account info.',
    noWhen:
      "Account detail discussed before verification, verification skipped, details requested in a public post, or holder's ID/details requested from, confirmed with or shared with a 3rd party.",
  },
  {
    code: 'C2',
    section: 'critical',
    label: 'Promises kept',
    points: 0,
    yesWhen: 'Every promised callback/follow-up done; calls back after a dropped line.',
    noWhen: 'Promised callback never happened, or dropped call not returned.',
  },
  {
    code: 'C3',
    section: 'critical',
    label: 'Professional conduct',
    points: 0,
    yesWhen: 'Professional, on-brand language throughout.',
    noWhen: 'Slang/over-familiar ("bro", "cheers"), hanging up on the customer, dismissive behaviour.',
  },
  {
    code: 'B1',
    section: 'must_do',
    label: 'Greeting & acknowledgement',
    points: 10,
    yesWhen: 'Personalised greeting with name; written channels acknowledged promptly and kept updated.',
    noWhen: 'Generic/robotic/no greeting; customer left unacknowledged (e.g. >1 hr silence in chat).',
  },
  {
    code: 'B2',
    section: 'must_do',
    label: 'Verbatim closing question',
    points: 10,
    yesWhen: '"Have I answered all of your questions today?" asked exactly as worded.',
    noWhen: 'Not asked, paraphrased ("anything else?"), different wording. N/A only if the case isn\'t closed on this contact.',
  },
  {
    code: 'B3',
    section: 'must_do',
    label: 'Recap',
    points: 5,
    yesWhen: 'Outcome, next steps and timelines summarised before ending.',
    noWhen: 'Ends without telling the customer what happens next.',
  },
  {
    code: 'B4',
    section: 'must_do',
    label: 'Case notes',
    points: 10,
    yesWhen:
      'Issue, steps taken and outcome logged on every leg; correct category/macro; another agent could pick it up.',
    noWhen: 'No notes, notes only describe what was seen without action, or wrong category.',
  },
  {
    code: 'Q1',
    section: 'quality',
    label: 'Understanding & Investigation',
    points: 10,
    anchors: [
      'No attempt to understand the query.',
      'Misreads or ignores the actual complaint; no investigation.',
      'Partly understood; responds to something other than asked; jumps to troubleshooting without confirming.',
      'General understanding but misses nuance (prior contact, related charges, urgency); findings not explained.',
      'Understands well; one more probe would have confirmed fully. Findings explained.',
      'Reads tone and substance accurately, probes the right follow-up, investigates fully and explains findings and the "why".',
    ],
  },
  {
    code: 'Q2',
    section: 'quality',
    label: 'Knowledge, Accuracy & Process',
    points: 20,
    anchors: [
      'Info given is wrong in a way that harms the customer.',
      'Incorrect info given (publicly on a written channel); protocol ignored.',
      'Noticeable inaccuracies needing correction; sounds uncertain; several steps missed.',
      'Adequate but generic; repeats same answer without the why; one required step late/missed (tower optimisation, device-to-tower check, findings & solution template) — a skipped required step caps this at 3.',
      'Accurate with a small, non-critical gap; SLA met.',
      'Accurate, confident, tailored; every required step done (optimisation, escalation, findings & solution template); correct signposting, packages, device/coverage knowledge.',
    ],
  },
  {
    code: 'Q3',
    section: 'quality',
    label: 'Resolution, Ownership & FCR',
    points: 20,
    anchors: [
      'Case closed without helping the customer.',
      'No ownership; left unresolved or told to go elsewhere.',
      'Limited ownership; back-and-forth across channels; customer has to chase; incomplete resolution.',
      'Appropriate resolution attempted; avoidable transfer or missed opportunity (retention offer, optimisation) stops full closure.',
      'Owns the issue, accurate resolution, manages expectations, minimal back-and-forth; confirmation could be stronger.',
      'Owns it end-to-end on every channel; tailored fix; proactively handles related concerns; confirms resolved — no repeat contact needed.',
    ],
  },
  {
    code: 'Q4',
    section: 'quality',
    label: 'Communication, Empathy & Conversation Control',
    hint: '(tone, warmth, pace, dead air/holds, not speaking over, response times)',
    points: 15,
    anchors: [
      'Rude, hostile, or abandons the conversation.',
      'Dismissive or tone-deaf; long dead air/holds unacknowledged; repeatedly speaks over the customer.',
      'Unclear/inconsistent; rushed (customer asks to repeat/slow down); noticeable dead air; written replies overly long or mismatched to platform.',
      'Understandable but flat, clinical or template-like; little empathy; some dead air or one instance of speaking over; slow written replies.',
      'Clear, professional, good pace and listening; holds explained; could be warmer or more concise.',
      'Warm, human, on-brand, jargon-free; confident pace, active listening, no talking over, short explained holds, timely written replies; customer feels valued.',
    ],
  },
]

export interface ItemInput { code: ItemCode; written: LegValue; call: LegValue }
export interface ScorecardSettings { passMark: number; excellentFrom: number; criticalFailCap: number }
export interface SettingsRow extends ScorecardSettings { id: string; effectiveFrom: string }
export type CriticalStatus = 'FAIL' | 'PASS' | 'NA' | ''
export type RatingLabel = '' | 'Fail' | 'Good' | 'Excellent' | 'Fail (Critical)'
export type ClosingLine = 'Yes' | 'No' | 'NA' | null

export interface ItemResult {
  code: ItemCode
  status: CriticalStatus | null // only set on C rows
  used: number
  earned: number
}

export interface ScorecardResult {
  perItem: ItemResult[]
  earned: number
  used: number
  raw: number | null
  final: number | null
  criticalFail: boolean
  failedCriticals: ItemCode[]
  rating: RatingLabel
  closingLine: ClosingLine
}

const LEGS: Leg[] = ['written', 'call']

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function legValues(item: ItemInput | undefined): LegValue[] {
  return item ? [item.written, item.call] : [null, null]
}

function criticalStatus(vals: LegValue[]): CriticalStatus {
  if (vals.includes('no')) return 'FAIL'
  if (vals.includes('yes')) return 'PASS'
  if (vals.includes('na')) return 'NA'
  return ''
}

export function rateScore(final: number | null, criticalFail: boolean, s: ScorecardSettings): RatingLabel {
  if (criticalFail) return 'Fail (Critical)'
  if (final === null) return ''
  if (final >= s.excellentFrom) return 'Excellent'
  if (final >= s.passMark) return 'Good'
  return 'Fail'
}

export function scoreScorecard(items: ItemInput[], settings: ScorecardSettings): ScorecardResult {
  const byCode = new Map<ItemCode, ItemInput>(items.map((i) => [i.code, i]))
  const perItem: ItemResult[] = []
  const failedCriticals: ItemCode[] = []
  let earned = 0
  let used = 0
  let closingLine: ClosingLine = null

  for (const def of SCORECARD_ITEMS) {
    const vals = legValues(byCode.get(def.code))

    if (def.section === 'critical') {
      const status = criticalStatus(vals)
      if (status === 'FAIL') failedCriticals.push(def.code)
      perItem.push({ code: def.code, status, used: 0, earned: 0 })
      continue
    }

    let itemUsed = 0
    let itemEarned = 0
    if (def.section === 'must_do') {
      const y = vals.filter((v) => v === 'yes').length
      const n = vals.filter((v) => v === 'no').length
      if (y + n > 0) {
        itemUsed = def.points
        itemEarned = (def.points * y) / (y + n)
      }
      if (def.code === 'B2') {
        closingLine = n > 0 ? 'No' : y > 0 ? 'Yes' : vals.includes('na') ? 'NA' : null
      }
    } else {
      const ratings = vals.filter((v) => typeof v === 'number') as number[]
      if (ratings.length > 0) {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length
        itemUsed = def.points
        itemEarned = (def.points * avg) / 5
      }
    }
    earned += itemEarned
    used += itemUsed
    perItem.push({ code: def.code, status: null, used: itemUsed, earned: itemEarned })
  }

  const criticalFail = failedCriticals.length > 0
  const raw = used === 0 ? null : round1((earned / used) * 100)
  const final = raw === null ? null : criticalFail ? round1(Math.min(raw, settings.criticalFailCap)) : raw

  return {
    perItem,
    earned,
    used,
    raw,
    final,
    criticalFail,
    failedCriticals,
    rating: rateScore(final, criticalFail, settings),
    closingLine,
  }
}

/** Row with the latest effectiveFrom <= onDate ('YYYY-MM-DD' compares lexically), or null. */
export function resolveSettings(rows: SettingsRow[], onDate: string): SettingsRow | null {
  let best: SettingsRow | null = null
  for (const r of rows) {
    if (r.effectiveFrom <= onDate && (best === null || r.effectiveFrom > best.effectiveFrom)) best = r
  }
  return best
}

/** Forces the leg(s) not in use to 'na'. */
export function applyLegs(items: ItemInput[], legs: QaLegs): ItemInput[] {
  if (legs === 'both') return items
  return items.map((i) => (legs === 'written' ? { ...i, call: 'na' as const } : { ...i, written: 'na' as const }))
}

/** Critical legs (for the legs in use) that have no answer yet, in C1..C3 / written, call order. */
export function missingCriticals(items: ItemInput[], legs: QaLegs): { code: ItemCode; leg: Leg }[] {
  const byCode = new Map<ItemCode, ItemInput>(items.map((i) => [i.code, i]))
  const wanted: Leg[] = legs === 'both' ? LEGS : [legs]
  const out: { code: ItemCode; leg: Leg }[] = []
  for (const def of SCORECARD_ITEMS) {
    if (def.section !== 'critical') continue
    for (const leg of wanted) {
      const v = byCode.get(def.code)?.[leg] ?? null
      if (v === null) out.push({ code: def.code, leg })
    }
  }
  return out
}

/** C/B: false if any scored leg is 'no'. Q: false if any numeric leg <= 2. null if nothing scored. */
export function itemPasses(item: ItemInput): boolean | null {
  const vals = [item.written, item.call]
  if (item.code.startsWith('Q')) {
    const nums = vals.filter((v): v is 0 | 1 | 2 | 3 | 4 | 5 => typeof v === 'number')
    if (nums.length === 0) return null
    return !nums.some((n) => n <= 2)
  }
  if (!vals.includes('yes') && !vals.includes('no')) return null
  return !vals.includes('no')
}

export function bandsLegend(s: ScorecardSettings): string {
  return `Fail < ${s.passMark} · Good ${s.passMark}–${round1(s.excellentFrom - 0.1)} · Excellent ≥ ${s.excellentFrom} · any critical No = Fail (capped at ${s.criticalFailCap})`
}

export function toDbLeg(v: LegValue): string | null {
  return v === null ? null : String(v)
}

export function fromDbLeg(code: ItemCode, v: string | null): LegValue {
  if (v === null || v === '') return null
  if (v === 'na') return 'na'
  if (code.startsWith('Q')) {
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= 5 ? (n as LegValue) : null
  }
  return v === 'yes' || v === 'no' ? v : null
}
