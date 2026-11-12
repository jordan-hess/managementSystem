/**
 * leadOps — the config/seed data the eventual `shift_templates`,
 * `shift_template_blocks` and `efficiency_metric_defs` tables will hold,
 * mirrored in TS for Phase 0.
 *
 * Pure constants only, NO lib/db/pool import — 'use client' components under
 * components/leadops/ import from here at runtime, and that module pulls in
 * the `postgres` package (needs Node's net/tls) which can't bundle for the
 * browser. Same pattern and reasoning as lib/qa/constants.ts's
 * QA_CATEGORY_OPTIONS and lib/t2/constants.ts.
 */

import type {
  EfficiencyMetricDef,
  ManagerKpa,
  ManagerKpaPillar,
  PlannerCategory,
  ShiftTemplate,
  ShiftTemplateBlock,
} from './types'

// ─── Planner categories ─────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<PlannerCategory, string> = {
  operations: 'Operations',
  coaching: 'Coaching',
  qa: 'QA',
  team_management: 'Team Management',
  admin: 'Admin',
  break: 'Break',
  escalations: 'Escalations',
}

/** The seven categories, in dashboard display order. */
export const PLANNER_CATEGORIES: PlannerCategory[] = [
  'operations',
  'coaching',
  'qa',
  'team_management',
  'admin',
  'break',
  'escalations',
]

export const BLOCK_STATUS_LABELS = {
  planned: 'Planned',
  completed: 'Completed',
  moved: 'Moved',
  not_completed: 'Not completed',
} as const

export const VERIFICATION_LABELS = {
  self_reported: 'Self-reported',
  verified: 'Verified',
  disputed: 'Disputed',
} as const

// ─── Shift templates ────────────────────────────────────────────────────

export const TEMPLATE_EARLY_ID = 'tpl-early'
export const TEMPLATE_LATE_ID = 'tpl-late'

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  { id: TEMPLATE_EARLY_ID, name: 'Team Leader — 08:00–17:00', start_time: '08:00:00', end_time: '17:00:00' },
  { id: TEMPLATE_LATE_ID, name: 'Team Leader — 11:00–20:00', start_time: '11:00:00', end_time: '20:00:00' },
]

/**
 * Block rows, built from a terse tuple list so the times/activities stay
 * readable against the source tables in the integration plan. Ids are
 * deterministic (`<template>-b<sort_order>`) so mock block logs can
 * reference them by hand.
 */
function buildBlocks(
  templateId: string,
  rows: [start: string, end: string, activity: string, category: PlannerCategory][],
): ShiftTemplateBlock[] {
  return rows.map(([start, end, activity, category], i) => ({
    id: `${templateId}-b${i + 1}`,
    shift_template_id: templateId,
    sort_order: i + 1,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    activity,
    category,
  }))
}

export const SHIFT_TEMPLATE_BLOCKS: ShiftTemplateBlock[] = [
  ...buildBlocks(TEMPLATE_EARLY_ID, [
    ['08:00', '08:30', 'Team check-in, attendance & daily priorities', 'team_management'],
    ['08:30', '10:00', 'Queue monitoring & operational support', 'operations'],
    ['10:00', '10:30', 'QA reviews', 'qa'],
    ['10:30', '11:30', 'Agent coaching / floor support', 'coaching'],
    ['11:30', '12:00', 'Escalations & follow-ups', 'escalations'],
    ['12:00', '13:00', 'Lunch / staggered team coverage', 'break'],
    ['13:00', '14:00', 'QA / ticket reviews', 'qa'],
    ['14:00', '15:00', '1:1s / performance coaching', 'coaching'],
    ['15:00', '16:00', 'Queue monitoring & agent support', 'operations'],
    ['16:00', '16:30', 'Reporting / admin', 'admin'],
    ['16:30', '17:00', 'End-of-day review, handover & outstanding actions', 'admin'],
  ]),
  ...buildBlocks(TEMPLATE_LATE_ID, [
    ['11:00', '11:30', 'Team check-in, attendance & priorities', 'team_management'],
    ['11:30', '13:00', 'Queue monitoring & operational support', 'operations'],
    ['13:00', '13:30', 'QA reviews', 'qa'],
    ['13:30', '14:30', 'Agent coaching / floor support', 'coaching'],
    ['14:30', '15:30', 'Lunch / staggered team coverage', 'break'],
    ['15:30', '16:30', 'Queue monitoring & escalations', 'operations'],
    ['16:30', '17:30', 'QA / ticket reviews', 'qa'],
    ['17:30', '18:30', '1:1s / performance coaching', 'coaching'],
    ['18:30', '19:30', 'Queue monitoring & evening support', 'operations'],
    ['19:30', '20:00', 'Reporting, handover & outstanding actions', 'admin'],
  ]),
]

export function blocksForTemplate(templateId: string): ShiftTemplateBlock[] {
  return SHIFT_TEMPLATE_BLOCKS.filter((b) => b.shift_template_id === templateId)
}

// ─── Efficiency scorecard metric library (8 KPAs, 21 KPIs) ──────────────

/**
 * Section 8.3 of the integration plan. Time & Capacity Management and
 * Agent-in-Seat & Frontline Insight are confirmed final; every other KPA is
 * carried over from the source workbook with targets that have NOT been
 * re-confirmed — those carry `provisional: true` and render a "Provisional"
 * chip.
 *
 * `productivity_occupancy` was written up in the source workbook as a 75–90%
 * band, which the green/amber/direction model can't express. Confirmed
 * 2026-09-23 that it is a plain threshold after all — 75%+ is green, 65% and
 * below is amber, and a high occupancy such as 95% should score green — so
 * no upper bound is needed and green 75 / amber 65 / higher_better is right.
 */
export const EFFICIENCY_METRIC_DEFS: EfficiencyMetricDef[] = [
  // ── Time & Capacity Management (confirmed) ──
  {
    key: 'time_on_coaching_support',
    category: 'Time & Capacity Management',
    kpi: '% Time on Coaching & Support activities',
    direction: 'higher_better',
    green: 60,
    amber: 50,
    unit: '%',
    source: 'Time & Motion Planner (auto)',
    frequency: 'Monthly',
    provisional: false,
    inputMode: 'derived',
    naAllowed: false,
  },
  {
    key: 'planner_adherence',
    category: 'Time & Capacity Management',
    kpi: 'Planner Adherence (variance to plan)',
    direction: 'lower_better',
    green: 10,
    amber: 20,
    unit: '%',
    source: 'Time & Motion Planner (auto)',
    frequency: 'Bi-weekly',
    provisional: false,
    inputMode: 'derived',
    naAllowed: false,
  },

  // ── Agent-in-Seat & Frontline Insight (confirmed) ──
  {
    key: 'agent_in_seat_days',
    category: 'Agent-in-Seat & Frontline Insight',
    kpi: 'Agent-in-Seat days completed (per month)',
    direction: 'higher_better',
    green: 2,
    amber: 1,
    unit: '/month',
    source: 'Roster / attendance log (manual)',
    frequency: 'Monthly',
    provisional: false,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'improvement_ideas',
    category: 'Agent-in-Seat & Frontline Insight',
    kpi: 'Process improvement ideas submitted (per month)',
    direction: 'higher_better',
    green: 2,
    amber: 1,
    unit: '/month',
    source: 'Continuous improvement log (manual)',
    frequency: 'Monthly',
    provisional: false,
    inputMode: 'manual',
    naAllowed: true,
  },

  // ── Coaching & People Development (carried over) ──
  {
    key: 'team_coached_on_schedule',
    category: 'Coaching & People Development',
    kpi: '% of team coached on the bi-weekly schedule',
    direction: 'higher_better',
    green: 100,
    amber: 90,
    unit: '%',
    source: 'Coaching log',
    frequency: 'Bi-weekly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'coaching_effectiveness',
    category: 'Coaching & People Development',
    kpi: 'Coaching quality / effectiveness score',
    direction: 'higher_better',
    green: 85,
    amber: 70,
    unit: '%',
    source: 'Coaching audit / QA of coaching sessions',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'team_skill_uplift',
    category: 'Coaching & People Development',
    kpi: 'Team skill uplift (avg QA score change, pts/quarter)',
    direction: 'higher_better',
    green: 2,
    amber: 0,
    unit: ' pts',
    source: 'QA scorecards',
    frequency: 'Quarterly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },

  // ── VIP Client Escalation Handling (carried over) ──
  {
    key: 'vip_resolved_in_sla',
    category: 'VIP Client Escalation Handling',
    kpi: 'VIP escalations resolved within SLA',
    direction: 'higher_better',
    green: 100,
    amber: 90,
    unit: '%',
    source: 'Escalation tracker',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'vip_repeat_rate',
    category: 'VIP Client Escalation Handling',
    kpi: 'Repeat VIP escalation rate (within 30 days)',
    direction: 'lower_better',
    green: 5,
    amber: 10,
    unit: '%',
    source: 'Escalation tracker',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },

  // ── Team Performance Management (carried over) ──
  {
    key: 'team_sla_adherence',
    category: 'Team Performance Management',
    kpi: 'Team SLA adherence',
    direction: 'higher_better',
    green: 90,
    amber: 80,
    unit: '%',
    source: 'WFM / platform reporting',
    frequency: 'Weekly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'backlog_aging',
    category: 'Team Performance Management',
    kpi: 'Backlog aging (% over SLA)',
    direction: 'lower_better',
    green: 5,
    amber: 10,
    unit: '%',
    source: 'Queue/backlog report',
    frequency: 'Weekly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'qa_average_score',
    category: 'Team Performance Management',
    kpi: 'QA average score',
    direction: 'higher_better',
    green: 90,
    amber: 80,
    unit: '%',
    source: 'QA scorecards',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'csat_cx_score',
    category: 'Team Performance Management',
    kpi: 'CSAT / CX score',
    direction: 'higher_better',
    green: 85,
    amber: 75,
    unit: '%',
    source: 'CSAT survey platform',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'productivity_occupancy',
    category: 'Team Performance Management',
    kpi: 'Productivity / Occupancy',
    direction: 'higher_better',
    green: 75,
    amber: 65,
    unit: '%',
    source: 'WFM report',
    frequency: 'Weekly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'monthly_reviews_completed',
    category: 'Team Performance Management',
    kpi: 'Monthly performance reviews completed (% of team)',
    direction: 'higher_better',
    green: 100,
    amber: 90,
    unit: '%',
    source: 'Performance review log',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },

  // ── Platform & Queue Management (carried over) ──
  {
    key: 'multi_platform_sla',
    category: 'Platform & Queue Management',
    kpi: 'Multi-platform SLA adherence',
    direction: 'higher_better',
    green: 90,
    amber: 80,
    unit: '%',
    source: 'Platform reporting',
    frequency: 'Weekly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'proactive_risk_flags',
    category: 'Platform & Queue Management',
    kpi: 'Proactive risk flags raised (per month)',
    direction: 'higher_better',
    green: 2,
    amber: 1,
    unit: '/month',
    source: 'Ops risk log',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },

  // ── Communication & Team Engagement (carried over) ──
  {
    key: 'engagement_pulse',
    category: 'Communication & Team Engagement',
    kpi: 'Team engagement / pulse score',
    direction: 'higher_better',
    green: 75,
    amber: 60,
    unit: '%',
    source: 'Engagement survey platform',
    frequency: 'Quarterly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },

  // ── Tools, Process Mastery & Optimisation (carried over) ──
  {
    key: 'process_audits',
    category: 'Tools, Process Mastery & Optimisation',
    kpi: 'Process audits completed (per month)',
    direction: 'higher_better',
    green: 2,
    amber: 1,
    unit: '/month',
    source: 'Audit log',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'process_error_rate',
    category: 'Tools, Process Mastery & Optimisation',
    kpi: 'Error rate (process/compliance)',
    direction: 'lower_better',
    green: 2,
    amber: 5,
    unit: '%',
    source: 'QA scorecards',
    frequency: 'Monthly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
  {
    key: 'documented_improvements',
    category: 'Tools, Process Mastery & Optimisation',
    kpi: 'Documented process improvements delivered (per quarter)',
    direction: 'higher_better',
    green: 2,
    amber: 1,
    unit: '/quarter',
    source: 'Continuous improvement log',
    frequency: 'Quarterly',
    provisional: true,
    inputMode: 'manual',
    naAllowed: true,
  },
]

/** KPA display order — the two confirmed KPAs lead. */
export const KPA_ORDER: string[] = [
  'Time & Capacity Management',
  'Agent-in-Seat & Frontline Insight',
  'Coaching & People Development',
  'VIP Client Escalation Handling',
  'Team Performance Management',
  'Platform & Queue Management',
  'Communication & Team Engagement',
  'Tools, Process Mastery & Optimisation',
]

/** Metric defs grouped by KPA, in KPA_ORDER. */
export function metricsByKpa(): { kpa: string; metrics: EfficiencyMetricDef[] }[] {
  return KPA_ORDER.map((kpa) => ({
    kpa,
    metrics: EFFICIENCY_METRIC_DEFS.filter((m) => m.category === kpa),
  }))
}

// ─── Manager Scorecard — NOT in the agreed Section 5 schema (new feature) ──
//
// 11 KPAs, weight sum 100 (17+15+13+13+6+6+7+6+6+6+5). Roll-Up KPAs are
// sourced from the REAL EfficiencyMetricDef keys above via sourceTlKpiKeys
// — see types.ts's ManagerKpa doc comment for why a key LIST rather than a
// single KPA reference. `whatThisCovers`/`frequency` text is copied from
// the source spec's own column text as a placeholder, pending the real
// workbook — see docs/manager-scorecard.md.

export const PILLAR_ORDER: ManagerKpaPillar[] = ['impact_delivery', 'collaboration_leadership', 'growth_potential']

export const PILLAR_LABELS: Record<ManagerKpaPillar, string> = {
  impact_delivery: 'Impact & Delivery',
  collaboration_leadership: 'Collaboration & Leadership',
  growth_potential: 'Growth Potential',
}

export const MANAGER_KPAS: ManagerKpa[] = [
  {
    key: 'departmental_team_performance',
    rank: 1,
    name: 'Departmental Team Performance (SLA/Backlog/QA/CSAT/Productivity)',
    pillar: 'impact_delivery',
    weight: 17,
    method: 'rollup',
    sourceTlKpiKeys: ['team_sla_adherence', 'backlog_aging', 'qa_average_score', 'csat_cx_score', 'productivity_occupancy', 'monthly_reviews_completed'],
    sourceTlKpaLabel: 'Team Performance Management',
    whatThisCovers: 'The department-wide average of each team leader’s Team Performance Management KPA — SLA adherence, backlog aging, QA average, CSAT, productivity/occupancy and completed reviews.',
    frequency: 'Monthly',
  },
  {
    key: 'quality_cx_involvement',
    rank: 2,
    name: 'Departmental Quality & CX Involvement Across Teams',
    pillar: 'impact_delivery',
    weight: 15,
    method: 'rollup',
    // Deliberately overlaps rank 1's qa_average_score/csat_cx_score — a
    // second, dedicated lens on quality/CX, not a bug. See
    // docs/manager-scorecard.md.
    sourceTlKpiKeys: ['qa_average_score', 'csat_cx_score'],
    sourceTlKpaLabel: null,
    whatThisCovers: 'The department-wide average of QA average score and CSAT/CX score specifically — quality and customer-experience involvement across every team, independent of the broader team-performance roll-up above.',
    frequency: 'Monthly',
  },
  {
    key: 'coaching_cadence_effectiveness',
    rank: 3,
    name: 'Coaching Cadence & Effectiveness Across Teams',
    pillar: 'impact_delivery',
    weight: 13,
    method: 'rollup',
    sourceTlKpiKeys: ['team_coached_on_schedule', 'coaching_effectiveness', 'team_skill_uplift'],
    sourceTlKpaLabel: 'Coaching & People Development',
    whatThisCovers: 'The department-wide average of each team leader’s Coaching & People Development KPA — coaching cadence adherence, coaching effectiveness and team skill uplift.',
    frequency: 'Bi-weekly',
  },
  {
    key: 'tl_people_leadership',
    rank: 4,
    name: 'TL People Leadership, Coaching & Performance Management',
    pillar: 'collaboration_leadership',
    weight: 13,
    method: 'rated',
    sourceTlKpiKeys: null,
    sourceTlKpaLabel: null,
    whatThisCovers: 'How well the manager leads, coaches and manages the performance of their team leaders.',
    frequency: 'Monthly',
  },
  {
    key: 'platform_queue_workforce_planning',
    rank: 5,
    name: 'Platform, Queue & Workforce Planning Across Teams',
    pillar: 'impact_delivery',
    weight: 6,
    method: 'rollup',
    sourceTlKpiKeys: ['multi_platform_sla', 'proactive_risk_flags'],
    sourceTlKpaLabel: 'Platform & Queue Management',
    whatThisCovers: 'The department-wide average of each team leader’s Platform & Queue Management KPA — multi-platform SLA adherence and proactive risk flags raised.',
    frequency: 'Weekly',
  },
  {
    key: 'vip_escalation_risk_management',
    rank: 6,
    name: 'VIP / Escalation Ownership & Departmental Risk Management',
    pillar: 'impact_delivery',
    weight: 6,
    method: 'rated',
    sourceTlKpiKeys: null,
    sourceTlKpaLabel: null,
    whatThisCovers: 'The manager’s own ownership of VIP escalations and department-level risk management.',
    frequency: 'Monthly',
  },
  {
    key: 'learning_agility_innovation',
    rank: 7,
    name: 'Learning Agility, Innovation & Talent Pipeline',
    pillar: 'growth_potential',
    weight: 7,
    method: 'rated',
    sourceTlKpiKeys: null,
    sourceTlKpaLabel: null,
    whatThisCovers: 'The manager’s own learning agility, innovation and contribution to the talent pipeline.',
    frequency: 'Quarterly',
  },
  {
    key: 'process_tools_mastery_compliance',
    rank: 8,
    name: 'Process, Tools Mastery & Compliance Across Teams',
    pillar: 'impact_delivery',
    weight: 6,
    method: 'rollup',
    sourceTlKpiKeys: ['process_audits', 'process_error_rate', 'documented_improvements'],
    sourceTlKpaLabel: 'Tools, Process Mastery & Optimisation',
    whatThisCovers: 'The department-wide average of each team leader’s Tools, Process Mastery & Optimisation KPA — process audits, error rate and documented process improvements.',
    frequency: 'Monthly',
  },
  {
    key: 'team_engagement_communication',
    rank: 9,
    name: 'Team Engagement & Communication Across Teams',
    pillar: 'impact_delivery',
    weight: 6,
    method: 'rollup',
    sourceTlKpiKeys: ['engagement_pulse'],
    sourceTlKpaLabel: 'Communication & Team Engagement',
    whatThisCovers: 'The department-wide average of each team leader’s Communication & Team Engagement KPA — the team engagement/pulse score.',
    frequency: 'Quarterly',
  },
  {
    key: 'cross_functional_communication',
    rank: 10,
    name: 'Cross-Functional Communication & Stakeholder Representation',
    pillar: 'collaboration_leadership',
    weight: 6,
    method: 'rated',
    sourceTlKpiKeys: null,
    sourceTlKpaLabel: null,
    whatThisCovers: 'The manager’s own cross-functional communication and representation of the department to other stakeholders.',
    frequency: 'Monthly',
  },
  {
    key: 'culture_values_governance',
    rank: 11,
    name: 'Culture, Values, Professionalism & Governance',
    pillar: 'collaboration_leadership',
    weight: 5,
    method: 'rated',
    sourceTlKpiKeys: null,
    sourceTlKpaLabel: null,
    whatThisCovers: 'The manager’s own adherence to and modelling of culture, values, professionalism and governance.',
    frequency: 'Monthly',
  },
]

if (MANAGER_KPAS.reduce((sum, k) => sum + k.weight, 0) !== 100) {
  throw new Error('MANAGER_KPAS weights must sum to 100')
}

/** Manager KPAs grouped by pillar, in PILLAR_ORDER, each group in rank order. */
export function kpasByPillar(): { pillar: ManagerKpaPillar; kpas: ManagerKpa[] }[] {
  return PILLAR_ORDER.map((pillar) => ({
    pillar,
    kpas: MANAGER_KPAS.filter((k) => k.pillar === pillar).sort((a, b) => a.rank - b.rank),
  }))
}
