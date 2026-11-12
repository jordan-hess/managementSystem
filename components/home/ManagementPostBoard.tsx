'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp, Megaphone, Plus, Trash2 } from 'lucide-react'
import { ManagementPost, ManagementPostCategory } from '@/types'
import Modal from '@/components/ui/Modal'
import { createManagementPost, deleteManagementPost, addPostReaction, removePostReaction } from './actions'

interface ManagementPostBoardProps {
  posts: ManagementPost[]
  userId: string
  canPost: boolean
}

const REACTION_EMOJIS = ['❤️', '👍', '🔥', '🎉', '👏']

const CATEGORY_OPTIONS: { value: ManagementPostCategory; label: string }[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'event', label: 'Event' },
  { value: 'general', label: 'General' },
]

const CATEGORY_BADGE: Record<ManagementPostCategory, string> = {
  announcement: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  challenge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400',
  event: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  general: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
}

function ReactionBar({ post, userId, onReact }: { post: ManagementPost; userId: string; onReact: (emoji: string, isCurrentReaction: boolean) => void }) {
  const reactions = post.management_post_reactions ?? []
  // One reaction per user per post (management-post-reactions-one-per-user-
  // 2026-09-18.sql) - at most one of these matches the current user.
  const myReaction = reactions.find(r => r.profile_id === userId)
  return (
    <div className="flex items-center gap-1 mt-3 flex-wrap">
      {REACTION_EMOJIS.map(emoji => {
        const forEmoji = reactions.filter(r => r.emoji === emoji)
        const mine = myReaction?.emoji === emoji
        const names = forEmoji.map(r => r.profiles?.full_name).filter((n): n is string => !!n)
        return (
          <button
            key={emoji}
            onClick={() => onReact(emoji, mine)}
            title={names.length > 0 ? names.join(', ') : undefined}
            className={`text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${
              mine
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span>{emoji}</span>
            {forEmoji.length > 0 && <span className="text-gray-500 dark:text-gray-400">{forEmoji.length}</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function ManagementPostBoard({ posts, userId, canPost }: ManagementPostBoardProps) {
  const router = useRouter()

  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ManagementPostCategory>('announcement')
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpanded(postId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setPosting(true)
    setError('')

    // Image attachments are temporarily unavailable — they used Supabase
    // Storage, which is being retired along with the rest of Supabase.
    // image_url stays null until this is migrated to a new storage backend.
    const result = await createManagementPost({
      title: title.trim(),
      category,
      content: content.trim(),
      image_url: null,
    })

    if ('error' in result) { setError(result.error); setPosting(false); return }

    setTitle('')
    setCategory('announcement')
    setContent('')
    setPosting(false)
    setModalOpen(false)
    router.refresh()
  }

  async function handleReact(postId: string, emoji: string, isCurrentReaction: boolean) {
    if (isCurrentReaction) {
      await removePostReaction(postId, emoji)
    } else {
      // addPostReaction upserts on (post_id, profile_id) - if you already
      // reacted with a different emoji on this post, this replaces it
      // rather than adding a second reaction.
      await addPostReaction(postId, emoji)
    }
    router.refresh()
  }

  async function handleDelete(postId: string) {
    if (!confirm('Delete this announcement? This cannot be undone.')) return
    const result = await deleteManagementPost(postId)
    if ('error' in result) { setError('Could not delete — please try again.'); return }
    router.refresh()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-blue-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Announcements</h2>
        </div>
        {canPost && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="New announcement"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {canPost && (
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Announcement">
          <form onSubmit={handlePost} className="space-y-3">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Post title"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ManagementPostCategory)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Share an update with everyone..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
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
                disabled={posting || !title.trim() || !content.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {error && <p className="mx-5 mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
        {posts.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No announcements yet</p>
        ) : (
          posts.map(post => (
            <div key={post.id} className="relative rounded-2xl overflow-hidden border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-gray-900">
              {canPost && (
                <button
                  type="button"
                  onClick={() => handleDelete(post.id)}
                  aria-label="Delete announcement"
                  title="Delete announcement"
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/90 dark:bg-gray-900/90 text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {post.image_url && (
                <img src={post.image_url} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20">
                {/* Click (or Enter/Space) toggles the full message. The reaction
                    bar and delete button sit outside this element on purpose, so
                    using them never expands or collapses the card. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded.has(post.id)}
                  onClick={() => toggleExpanded(post.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(post.id) }
                  }}
                  className="cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <h3 className={`font-bold text-sm text-gray-900 dark:text-white pr-6 ${expanded.has(post.id) ? '' : 'line-clamp-2'}`}>{post.title ?? 'Update'}</h3>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-1.5 ${CATEGORY_BADGE[post.category]}`}>
                    {post.category}
                  </span>
                  <p className={`text-xs text-gray-600 dark:text-gray-400 mt-2 ${expanded.has(post.id) ? 'whitespace-pre-wrap' : 'line-clamp-3'}`}>{post.content}</p>
                  <p className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1.5">
                    {expanded.has(post.id) ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read full message</>}
                  </p>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  {format(new Date(post.created_at), 'dd MMM yyyy, HH:mm')} &middot; {post.author?.full_name ?? 'Management'}
                </p>
                <ReactionBar post={post} userId={userId} onReact={(emoji, mine) => handleReact(post.id, emoji, mine)} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
