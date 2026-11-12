'use client'

import { useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { cardCls, mutedTextCls, sectionTitleCls, tableHeadCls } from '@/components/reports/theme'
import { metricsByKpa } from '@/lib/leadops/constants'
import { buildScoredKpi, formatThreshold } from '@/lib/leadops/scoring'
import { useLeadOpsData } from '../LeadOpsDataProvider'
import {
  BAND_CLS, VERIFICATION_CLS, VERIFICATION_ICON, badgeCls, btnOutline, btnPrimary, btnSecondary, inputCls, labelCls,
} from '../statusStyles'
import type { EfficiencyMetricDef, EfficiencyScore } from '@/lib/leadops/types'

interface Props {
  tlId: string
  tlName: string
  derivedValues: Record<string, number>
  /** Team Leader entering their own, Admin correcting, or Management correcting. */
  canEnterActual: boolean
  /** Management only. */
  canVerify: boolean
}

/**
 * KPI Actuals — the TL enters the ACTUAL, never the score. Score, RAG band
 * and every aggregate stay locked (Lock icon), computed in
 * lib/leadops/scoring.ts. N/A is offered only where naAllowed is true — the
 * two planner-derived KPIs are never N/A-able, since there is nothing to
 * except out of a computed value.
 *
 * Verification is per-KPI, belongs to the actual (not the score — there is
 * no separate score field to edit), and Admin is deliberately excluded from
 * verifying: only Management/HOD can, per the brief's explicit "Admins must
 * NOT" verification rule.
 */
export default function KpiActualsSection({ tlId, tlName, derivedValues, canEnterActual, canVerify }: Props) {
  const { scores, upsertScore, realDataLoading, selectedManagerMonth: period, scope } = useLeadOpsData()
  const [naDraft, setNaDraft] = useState<{ key: string; reason: string } | null>(null)
  const [verifyDraft, setVerifyDraft] = useState<{ key: string; value: string; note: string } | null>(null)

  function scoreFor(def: EfficiencyMetricDef): EfficiencyScore | undefined {
    const existing = scores.find((s) => s.tl_id === tlId && s.period === period && s.metric_key === def.key)
    if (existing) return existing
    if (def.inputMode === 'derived' && derivedValues[def.key] !== undefined) {
      return baseScore(def.key, { self_value: derivedValues[def.key] })
    }
    return undefined
  }

  function baseScore(metricKey: string, patch: Partial<EfficiencyScore> = {}): EfficiencyScore {
    const current = scores.find((s) => s.tl_id === tlId && s.period === period && s.metric_key === metricKey)
    return {
      id: current?.id ?? `score-${tlId}-${metricKey}`,
      tl_id: tlId,
      period,
      metric_key: metricKey,
      self_value: null,
      is_na: false,
      na_reason: null,
      verified_value: null,
      status: 'self_reported',
      verified_by: null,
      verified_at: null,
      verification_note: null,
      updated_at: '',
      ...current,
      ...patch,
    }
  }

  /** Editing the actual (by anyone) reverts verification — a Verified badge must never sit on a stale value. */
  function handleActualChange(def: EfficiencyMetricDef, raw: string) {
    const value = raw === '' ? null : Number(raw)
    upsertScore(baseScore(def.key, {
      self_value: value, is_na: false, na_reason: null,
      status: 'self_reported', verified_value: null, verified_by: null, verified_at: null, verification_note: null,
    }))
  }

  function openNaDraft(def: EfficiencyMetricDef) {
    const current = scoreFor(def)
    setNaDraft({ key: def.key, reason: current?.na_reason ?? '' })
  }

  function saveNaDraft() {
    if (!naDraft || !naDraft.reason.trim()) return
    upsertScore(baseScore(naDraft.key, {
      is_na: true, na_reason: naDraft.reason.trim(),
      status: 'self_reported', verified_value: null, verified_by: null, verified_at: null, verification_note: null,
    }))
    setNaDraft(null)
  }

  function clearNa(def: EfficiencyMetricDef) {
    upsertScore(baseScore(def.key, { is_na: false, na_reason: null }))
  }

  /** Accepting as-is: one click, verifies the current self-reported value unchanged. */
  function handleAccept(def: EfficiencyMetricDef) {
    const current = scoreFor(def)
    if (!current || current.self_value === null) return
    // verified_by / verified_at are set by the server from the signed-in user —
    // what is sent here only drives the optimistic display until it replies.
    upsertScore(baseScore(def.key, {
      status: 'verified', verified_value: current.self_value, verified_by: null, verified_at: new Date().toISOString(),
    }))
  }

  /**
   * Correct-and-verify as one action for Management, per the plan's
   * assumption #3: the stated rule ("editing an actual reverts verification")
   * would otherwise force Management to correct, then immediately re-verify
   * a value they just chose. This satisfies the invariant — the end state
   * has verification bound to the current value — without the extra step.
   */
  function saveVerifyDraft() {
    if (!verifyDraft) return
    const value = Number(verifyDraft.value)
    if (Number.isNaN(value)) return
    upsertScore(baseScore(verifyDraft.key, {
      status: 'verified', verified_value: value, verified_by: null, verified_at: new Date().toISOString(),
      verification_note: verifyDraft.note.trim() || null,
    }))
    setVerifyDraft(null)
  }

  if (realDataLoading) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <Loader2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3 animate-spin" />
        <p className={mutedTextCls}>Loading KPI actuals from the database…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-5`}>
        <h2 className={sectionTitleCls}>KPI actuals — {tlName}</h2>
        <p className={mutedTextCls}>
          Enter the actual value only. Score, RAG band and every aggregate are calculated by leadOps from
          whichever actual is current.
        </p>
      </div>

      {metricsByKpa().map(({ kpa, metrics }) => (
        <div key={kpa} className={`${cardCls} overflow-hidden`}>
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className={sectionTitleCls}>{kpa}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className={tableHeadCls}>
                  <th className="px-4 py-2.5">KPI</th>
                  <th className="px-4 py-2.5">Target</th>
                  <th className="px-4 py-2.5">Actual</th>
                  <th className="px-4 py-2.5">Verification</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((def) => {
                  const score = scoreFor(def)
                  const kpi = buildScoredKpi(def, score)
                  const VerIcon = VERIFICATION_ICON[kpi.status]
                  const isDerived = def.inputMode === 'derived'

                  return (
                    <tr key={def.key} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className="px-4 py-2.5">
                        <div className="text-gray-900 dark:text-white">{def.kpi}</div>
                        <div className={`${mutedTextCls} mt-0.5`}>{def.source} · {def.frequency}{def.provisional && ' · provisional'}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {formatThreshold(def.green, def)} <span className={mutedTextCls}>green</span>
                        <br />{formatThreshold(def.amber, def)} <span className={mutedTextCls}>amber</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isDerived ? (
                          <span className="inline-flex items-center gap-1.5 text-gray-900 dark:text-white font-medium" title="Derived from the Time & Motion Planner — not enterable">
                            <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
                            {scope === 'prod' ? 'Not tracked yet' : kpi.actual === null ? '—' : `${kpi.actual}${def.unit}`}
                          </span>
                        ) : kpi.isNa ? (
                          <div>
                            <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400`}>N/A</span>
                            <p className={`${mutedTextCls} mt-1 max-w-xs`}>{kpi.naReason}</p>
                            {canEnterActual && (
                              <button type="button" onClick={() => clearNa(def)} className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                                Clear N/A
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <input
                              type="number"
                              aria-label={`Actual for ${def.kpi}`}
                              disabled={!canEnterActual}
                              value={score?.self_value ?? ''}
                              onChange={(e) => handleActualChange(def, e.target.value)}
                              className={`${inputCls} w-24`}
                              placeholder="—"
                            />
                            {canEnterActual && def.naAllowed && (
                              <button type="button" onClick={() => openNaDraft(def)} className="block text-xs text-gray-500 dark:text-gray-400 hover:underline">
                                Mark N/A
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          {!isDerived && !kpi.isNa && (
                            <span className={`${badgeCls} ${VERIFICATION_CLS[kpi.status]} w-fit`}>
                              <VerIcon className="w-3 h-3" />
                              {kpi.status === 'verified' ? 'Verified' : 'Self-reported'}
                            </span>
                          )}
                          {kpi.isNa && (
                            <span className={`${badgeCls} bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 w-fit`}>Excluded</span>
                          )}
                          {kpi.score !== null && (
                            <span className={`${badgeCls} ${BAND_CLS[kpi.band as 'green' | 'amber' | 'red']} w-fit`}>Score {kpi.score}</span>
                          )}
                          {score?.verification_note && (
                            <p className={`${mutedTextCls} max-w-xs`}>&ldquo;{score.verification_note}&rdquo;</p>
                          )}
                          {canVerify && !isDerived && !kpi.isNa && kpi.actual !== null && kpi.status !== 'verified' && (
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => handleAccept(def)} className={btnPrimary}>Verify</button>
                              <button
                                type="button"
                                onClick={() => setVerifyDraft({ key: def.key, value: String(score?.self_value ?? ''), note: '' })}
                                className={btnOutline}
                              >
                                Correct
                              </button>
                            </div>
                          )}
                          {verifyDraft?.key === def.key && (
                            <div className="space-y-1.5 pt-1">
                              <input
                                type="number"
                                aria-label={`Corrected value for ${def.kpi}`}
                                value={verifyDraft.value}
                                onChange={(e) => setVerifyDraft({ ...verifyDraft, value: e.target.value })}
                                className={`${inputCls} w-24`}
                                autoFocus
                              />
                              <input
                                type="text"
                                aria-label={`Verification note for ${def.kpi}`}
                                value={verifyDraft.note}
                                onChange={(e) => setVerifyDraft({ ...verifyDraft, note: e.target.value })}
                                className={inputCls}
                                placeholder="Note (optional)"
                              />
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={saveVerifyDraft} className={btnPrimary}>Save &amp; verify</button>
                                <button type="button" onClick={() => setVerifyDraft(null)} className={btnOutline}>Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {naDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 p-5 w-full max-w-md space-y-3">
            <h3 className={sectionTitleCls}>Mark not applicable</h3>
            <div>
              <label className={labelCls} htmlFor="na-reason">Reason (required)</label>
              <textarea
                id="na-reason"
                rows={3}
                value={naDraft.reason}
                onChange={(e) => setNaDraft({ ...naDraft, reason: e.target.value })}
                className={`${inputCls} resize-none`}
                placeholder="Why doesn't this KPI apply this period?"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setNaDraft(null)} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={saveNaDraft} disabled={!naDraft.reason.trim()} className={btnPrimary}>Mark N/A</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
