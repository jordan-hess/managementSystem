'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { AgentKudos } from '@/types'
import Modal from '@/components/ui/Modal'
import { createAgentKudos } from './actions'

const AUTO_SCROLL_MS = 5000

interface AgentOption { id: string; full_name: string }

interface AgentKudosWallProps {
  kudos: AgentKudos[]
  userId: string
  canPost: boolean
  agents: AgentOption[]
}

function StarRating({ value, size = 'w-5 h-5' }: { value: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`${size} ${i < value ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}`} />
      ))}
    </div>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(starValue)}
            className="p-0.5"
          >
            <Star className={`w-5 h-5 transition-colors ${starValue <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-700 hover:text-amber-300'}`} />
          </button>
        )
      })}
    </div>
  )
}

export default function AgentKudosWall({ kudos, canPost, agents }: AgentKudosWallProps) {
  const router = useRouter()

  const [modalOpen, setModalOpen] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [note, setNote] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [rating, setRating] = useState(5)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const [index, setIndex] = useState(0)
  const current = kudos[index]

  const [viewOpen, setViewOpen] = useState(false)
  // Rough proxy for "line-clamp-2 below is actually cutting this off" -
  // measuring real DOM overflow would need a ref + resize handling for
  // every card the auto-scroll cycles through, for a cosmetic show-more
  // link. ~100 chars reliably wraps past 2 lines at this card's width/
  // font size; false positives (showing "Show more" when nothing's
  // actually hidden) just open a modal with the same text, which is
  // harmless.
  const noteTruncated = (current?.note.length ?? 0) > 100

  useEffect(() => {
    // Paused while the full-testimonial modal is open, so the card isn't
    // a different testimonial by the time you close it.
    if (kudos.length < 2 || viewOpen) return
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % kudos.length)
    }, AUTO_SCROLL_MS)
    return () => clearInterval(timer)
  }, [kudos.length, viewOpen])

  function goPrev() {
    setIndex(i => (i - 1 + kudos.length) % kudos.length)
  }
  function goNext() {
    setIndex(i => (i + 1) % kudos.length)
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!agentId || !note.trim()) return
    setPosting(true)
    setError('')

    const result = await createAgentKudos({
      agentId,
      note: note.trim(),
      customerName: customerName.trim() || null,
      rating,
    })

    if ('error' in result) { setError(result.error); setPosting(false); return }

    setAgentId('')
    setNote('')
    setCustomerName('')
    setRating(5)
    setPosting(false)
    setIndex(0)
    setModalOpen(false)
    router.refresh()
  }

  return (
    <div className="relative w-full animate-hero-in [animation-delay:320ms] motion-reduce:animate-none">
      {canPost && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Add testimonial"
          className="absolute top-0 right-0 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-blue-500 hover:bg-blue-600 text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}

      {canPost && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Testimonial">
          <form onSubmit={handlePost} className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
                className="flex-1 min-w-40 px-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">Select agent...</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What did the customer say?"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={posting || !agentId || !note.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
              >
                {posting ? 'Posting...' : 'Add testimonial'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <div className="relative flex flex-col items-start text-left gap-2">
        {kudos.length === 0 ? (
          canPost ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              Add the first testimonial
            </button>
          ) : (
            <p className="text-sm text-white/60">Customer shout-outs show up here.</p>
          )
        ) : (
          <>
            {/* Fixed-height block: testimonials vary a lot in name/quote length,
                and this section re-renders on every auto-scroll tick — without
                a locked height, everything below it shifts up and down as
                shorter/longer entries cycle through. line-clamp caps each
                field at a fixed number of lines so min-h always has enough
                room, regardless of which testimonial is showing. Text is a
                fixed light tone (not theme-adaptive) because this section
                sits directly on the page's dark background image, not on a
                card — see home/page.tsx's homepagebg.jpg background. */}
            <div className="w-full min-h-[4.75rem] flex flex-col items-start justify-start gap-1.5">
              <div className="flex items-center gap-2">
                <h2 className="text-base xl:text-lg font-bold text-white tracking-tight line-clamp-1">
                  {current.agent?.full_name ?? 'An Agent'}
                </h2>
                <StarRating value={current.rating} size="w-3 h-3" />
              </div>
              <p className="text-sm xl:text-[0.95rem] text-white/85 italic line-clamp-2">
                &ldquo;{current.note}&rdquo;
                {current.customer_name && <span className="text-gray-300 not-italic"> &mdash; {current.customer_name}</span>}
              </p>
              {noteTruncated && (
                <button
                  type="button"
                  onClick={() => setViewOpen(true)}
                  className="text-xs font-medium text-blue-300 hover:text-blue-200 -mt-0.5"
                >
                  Show more
                </button>
              )}
            </div>

            {kudos.length > 1 && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={goPrev}
                  aria-label="Previous testimonial"
                  className="w-7 h-7 flex items-center justify-center rounded-full border border-white/20 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-1.5">
                  {kudos.map((k, i) => (
                    <button
                      key={k.id}
                      onClick={() => setIndex(i)}
                      aria-label={`Go to testimonial ${i + 1}`}
                      className={`rounded-full transition-all ${i === index ? 'w-2.5 h-2.5 bg-blue-500' : 'w-1.5 h-1.5 bg-white/30'}`}
                    />
                  ))}
                </div>
                <button
                  onClick={goNext}
                  aria-label="Next testimonial"
                  className="w-7 h-7 flex items-center justify-center rounded-full border border-white/20 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* current's Modal has no title - the agent's name right below already serves that role. */}
      {current && (
        <Modal open={viewOpen} onClose={() => setViewOpen(false)} title="">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {current.agent?.full_name ?? 'An Agent'}
              </h3>
              <StarRating value={current.rating} size="w-4 h-4" />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 italic whitespace-pre-wrap">
              &ldquo;{current.note}&rdquo;
            </p>
            {current.customer_name && (
              <p className="text-sm text-gray-500 dark:text-gray-400">&mdash; {current.customer_name}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
