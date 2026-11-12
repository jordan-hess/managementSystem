'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2 } from 'lucide-react'
import { deleteReviewAction } from '@/app/(app)/qa-reviews/actions'

/** Per-row delete on the QA reviews list — only rendered where qaReviewCanDelete allows it (re-checked server-side). */
export default function DeleteReviewButton({ id, agentName }: { id: string; agentName: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete this QA review for ${agentName}? Its scores, critical failures, audit log and coaching actions are removed too. This cannot be undone.`)) return
    setDeleting(true)
    const res = await deleteReviewAction(id)
    setDeleting(false)
    if (res.error) { alert(res.error); return }
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      title="Delete review"
      aria-label={`Delete QA review for ${agentName}`}
      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-60 transition-colors"
    >
      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  )
}
