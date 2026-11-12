'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteWarningAction } from '@/app/(app)/qa-reviews/warningsActions'
import { Warning, WarningTargetCandidate, WarningType } from '@/types'
import { AlertTriangle, Plus } from 'lucide-react'
import { format } from 'date-fns'
import WarningModal from './WarningModal'

interface Props {
  warnings: Warning[]
  targetCandidates: WarningTargetCandidate[]
  currentUserId: string
  isManagement: boolean
}

type ListTab = 'agent' | 'team_leader'

const typeBadge: Record<WarningType, string> = {
  verbal:  'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
  written: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  final:   'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
}

const typeLabel: Record<WarningType, string> = {
  verbal: 'Verbal',
  written: 'Written',
  final: 'Final',
}

export default function WarningsManager({ warnings, targetCandidates, currentUserId, isManagement }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<ListTab>('agent')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Warning | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [error, setError] = useState('')

  const displayed = useMemo(() => {
    if (!isManagement) return warnings
    return warnings.filter(w => (tab === 'agent' ? w.target?.role === 'agent' : w.target?.role === 'admin'))
  }, [warnings, isManagement, tab])

  function openAdd() { setEditing(null); setError(''); setModal(true) }
  function openEdit(w: Warning) { setEditing(w); setError(''); setModal(true) }

  async function handleDelete(id: string) {
    try {
      await deleteWarningAction(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete warning.')
      return
    }
    setConfirmingDelete(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {isManagement && (
          <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
            {(['agent', 'team_leader'] as ListTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t === 'agent' ? 'Agent Warnings' : 'Team-Leader Warnings'}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors ml-auto"
        >
          <Plus className="w-4 h-4" /> New Warning
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</p>}

      {displayed.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 py-16 text-center">
          <AlertTriangle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No warnings recorded</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800 shadow-sm">
          {displayed.map(w => (
            <div key={w.id} className="px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-gray-900 dark:text-white">{w.target?.full_name ?? 'Unknown'}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeBadge[w.type]}`}>{typeLabel[w.type]}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{w.reason}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Next steps: {w.next_steps ?? 'No follow-up actions recorded'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {format(new Date(w.created_at), 'dd MMM yyyy HH:mm')} · by {w.issuer?.full_name ?? 'Unknown'}
                  </p>
                </div>
                {w.issued_by === currentUserId && (
                  <div className="flex items-center gap-2 shrink-0">
                    {confirmingDelete === w.id ? (
                      <>
                        <button onClick={() => handleDelete(w.id)} className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 font-medium">Confirm Delete</button>
                        <button onClick={() => setConfirmingDelete(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 font-medium">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => openEdit(w)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 font-medium">Edit</button>
                        <button onClick={() => setConfirmingDelete(w.id)} className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 font-medium">Delete</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <WarningModal
          key={editing?.id ?? 'add'}
          open={modal}
          onClose={() => setModal(false)}
          editing={editing}
          targetCandidates={targetCandidates}
          currentUserId={currentUserId}
          onSaved={() => { setModal(false); router.refresh() }}
        />
      )}
    </div>
  )
}
