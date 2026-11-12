/**
 * Coaching-opportunity detection — pure, no I/O. Structured as a registry
 * of independently named rule functions (same pattern as
 * lib/reports/generateInsights.ts's RULES array) rather than hardcoded
 * booleans in one function body, so a later phase can add rules without
 * restructuring this module or its callers.
 *
 * Suggest, never auto-create: this function only ever returns suggestions
 * for a human to act on. Nothing here calls createCoachingActionAction.
 */

import { ItemInput, SCORECARD_ITEMS } from './scorecard'

export interface CoachingOpportunityInput {
  items: ItemInput[]
  coachingFlags: { name: string; requiresCoaching: boolean }[]
}

export interface CoachingOpportunity {
  label: string
  reason: string
}

type CoachingOpportunityRule = (input: CoachingOpportunityInput) => CoachingOpportunity[]

/** Items in canonical C1..Q4 order, paired with their definition, for a given section. */
function inSection(input: CoachingOpportunityInput, section: 'critical' | 'must_do' | 'quality') {
  const byCode = new Map(input.items.map((i) => [i.code, i]))
  return SCORECARD_ITEMS.filter((d) => d.section === section).flatMap((def) => {
    const item = byCode.get(def.code)
    return item ? [{ def, item }] : []
  })
}

const criticalItemRule: CoachingOpportunityRule = (input) =>
  inSection(input, 'critical')
    .filter(({ item }) => item.written === 'no' || item.call === 'no')
    .map(({ def }) => ({ label: def.label, reason: 'Critical item failed' }))

const lowRatingRule: CoachingOpportunityRule = (input) =>
  inSection(input, 'quality').flatMap(({ def, item }) =>
    (['written', 'call'] as const).flatMap((leg) => {
      const n = item[leg]
      return typeof n === 'number' && n <= 2
        ? [{ label: def.label, reason: `Scored ${n}/5 (${leg === 'written' ? 'Written' : 'Call'})` }]
        : []
    }),
  )

// A single missed must-do is normal noise; two or more is a pattern worth coaching.
const mustDoRule: CoachingOpportunityRule = (input) => {
  const missed = inSection(input, 'must_do').filter(({ item }) => item.written === 'no' || item.call === 'no')
  if (missed.length < 2) return []
  return missed.map(({ def }) => ({ label: def.label, reason: 'Must-do behaviour missed' }))
}

const flagRule: CoachingOpportunityRule = (input) =>
  input.coachingFlags
    .filter((f) => f.requiresCoaching)
    .map((f) => ({ label: f.name, reason: `Critical failure: ${f.name}` }))

const RULES: CoachingOpportunityRule[] = [criticalItemRule, lowRatingRule, mustDoRule, flagRule]

export function identifyCoachingOpportunities(input: CoachingOpportunityInput): CoachingOpportunity[] {
  return RULES.flatMap((rule) => rule(input))
}
