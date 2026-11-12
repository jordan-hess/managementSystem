import { KpiSummary } from './kpis'
import { QueueSummaryRow } from './t2QueueSummary'
import { ChannelSummaryRow } from './socialChannelSummary'

export interface TopBreakdownFact {
  /** e.g. "ADVANCED root cause" — used verbatim in the generated sentence. */
  label: string
  value: string
  pct: number
}

export interface InsightsInput {
  kpis: KpiSummary
  t2QueueSummary: QueueSummaryRow[]
  socialChannelSummary: ChannelSummaryRow[]
  /** The top reason/root-cause fact for whichever queue is currently in view, if one was fetched. */
  topBreakdown?: TopBreakdownFact
  /** The top Social issue-type/root-cause fact, always fetched (Social has no per-queue tab to gate it on). */
  socialTopBreakdown?: TopBreakdownFact
}

// RULES has 7 entries after socialTopBreakdownInsight is added below, each
// independently thresholded (>30-40% etc.) — 6 leaves headroom for the new
// rule to actually surface instead of being crowded out by the original 5.
const MAX_INSIGHTS = 6

function volumeTrendInsight(input: InsightsInput): string | null {
  const { current, previous, deltaPct } = input.kpis.totalTickets
  if (deltaPct === null || Math.abs(deltaPct) < 5) return null
  const direction = deltaPct > 0 ? 'up' : 'down'
  return `Total ticket volume is ${direction} ${Math.abs(Math.round(deltaPct))}% vs the previous period (${current} vs ${previous}).`
}

function dominantT2QueueInsight(input: InsightsInput): string | null {
  const top = [...input.t2QueueSummary].sort((a, b) => b.pctOfT2 - a.pctOfT2)[0]
  if (!top || top.pctOfT2 <= 35 || top.volume === 0) return null
  return `${top.queue} accounts for ${Math.round(top.pctOfT2)}% of T2 Ops volume, the largest share of any queue.`
}

function dominantSocialChannelInsight(input: InsightsInput): string | null {
  const top = [...input.socialChannelSummary].sort((a, b) => b.pctOfSocial - a.pctOfSocial)[0]
  if (!top || top.pctOfSocial <= 40 || top.volume === 0) return null
  return `${top.channel} accounts for ${Math.round(top.pctOfSocial)}% of Social volume, the largest share of any channel.`
}

function escalationRateInsight(input: InsightsInput): string | null {
  const { current: total } = input.kpis.totalTickets
  const { current: escalated } = input.kpis.escalated
  if (total === 0) return null
  const rate = (escalated / total) * 100
  if (rate <= 15) return null
  return `${Math.round(rate)}% of tickets this period were escalated, above the typical range.`
}

function topBreakdownInsight(input: InsightsInput): string | null {
  const fact = input.topBreakdown
  if (!fact || fact.pct <= 30) return null
  return `${fact.value} is the leading ${fact.label}, making up ${Math.round(fact.pct)}% of tickets in that queue.`
}

function socialTopBreakdownInsight(input: InsightsInput): string | null {
  const fact = input.socialTopBreakdown
  if (!fact || fact.pct <= 30) return null
  return `${fact.value} is the leading ${fact.label}, making up ${Math.round(fact.pct)}% of Social tickets.`
}

function resolutionRateInsight(input: InsightsInput): string | null {
  const { current: total } = input.kpis.totalTickets
  const { current: resolved } = input.kpis.resolved
  if (total === 0) return null
  const rate = (resolved / total) * 100
  if (rate >= 60) return null
  return `Only ${Math.round(rate)}% of tickets this period are marked resolved or closed, below the typical range.`
}

const RULES = [volumeTrendInsight, dominantT2QueueInsight, dominantSocialChannelInsight, escalationRateInsight, topBreakdownInsight, socialTopBreakdownInsight, resolutionRateInsight]

/** Pure — every string is a template filled with real numbers already computed by kpis.ts/t2QueueSummary.ts/socialChannelSummary.ts, never a hardcoded string. */
export function generateInsights(input: InsightsInput): string[] {
  return RULES.map((rule) => rule(input)).filter((s): s is string => s !== null).slice(0, MAX_INSIGHTS)
}
