/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import AnnouncementsToggle from './AnnouncementsToggle'
import { ManagementPost } from '@/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('./actions', () => ({
  createManagementPost: jest.fn(),
  deleteManagementPost: jest.fn(),
  addPostReaction: jest.fn(),
  removePostReaction: jest.fn(),
}))

const LONG = 'A long announcement body. '.repeat(20).trim()

function post(id: string, createdAt: string, authorId = 'author-1'): ManagementPost {
  return {
    id,
    author_id: authorId,
    title: `Title ${id}`,
    category: 'announcement',
    content: LONG,
    image_url: null,
    created_at: createdAt,
    author: { id: authorId, full_name: 'Boss' },
    management_post_reactions: [],
  }
}

const dot = () => screen.queryByTestId('announcements-unread-dot')

beforeEach(() => localStorage.clear())

describe('announcements unread dot', () => {
  it('shows when there is a post the user has not seen', () => {
    render(<AnnouncementsToggle posts={[post('1', '2026-10-01T10:00:00Z')]} userId="me" canPost={false} />)
    expect(dot()).toBeInTheDocument()
  })

  it('does not show when there are no posts', () => {
    render(<AnnouncementsToggle posts={[]} userId="me" canPost={false} />)
    expect(dot()).not.toBeInTheDocument()
  })

  it('clears when the panel is opened, and stays cleared after a remount', () => {
    const posts = [post('1', '2026-10-01T10:00:00Z')]
    const { unmount } = render(<AnnouncementsToggle posts={posts} userId="me" canPost={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }))
    expect(dot()).not.toBeInTheDocument()
    unmount()

    render(<AnnouncementsToggle posts={posts} userId="me" canPost={false} />)
    expect(dot()).not.toBeInTheDocument()
  })

  it('comes back when a newer post is published after the last view', () => {
    const { rerender } = render(<AnnouncementsToggle posts={[post('1', '2026-10-01T10:00:00Z')]} userId="me" canPost={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }))
    expect(dot()).not.toBeInTheDocument()

    rerender(<AnnouncementsToggle posts={[post('2', '2026-10-02T10:00:00Z'), post('1', '2026-10-01T10:00:00Z')]} userId="me" canPost={false} />)
    expect(dot()).toBeInTheDocument()
  })

  it('does not flag the user\'s own post', () => {
    render(<AnnouncementsToggle posts={[post('1', '2026-10-01T10:00:00Z', 'me')]} userId="me" canPost />)
    expect(dot()).not.toBeInTheDocument()
  })
})

describe('announcement expand / collapse', () => {
  function open() {
    render(<AnnouncementsToggle posts={[post('1', '2026-10-01T10:00:00Z')]} userId="me" canPost={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Announcements' }))
  }

  it('starts collapsed, expands on click, and collapses on a second click', () => {
    open()
    const toggle = screen.getByRole('button', { name: /Title 1/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(LONG)).toHaveClass('line-clamp-3')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(LONG)).not.toHaveClass('line-clamp-3')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(LONG)).toHaveClass('line-clamp-3')
  })

  it('expands from the keyboard', () => {
    open()
    const toggle = screen.getByRole('button', { name: /Title 1/ })
    fireEvent.keyDown(toggle, { key: 'Enter' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('clicking a reaction does not toggle the card', () => {
    open()
    const toggle = screen.getByRole('button', { name: /Title 1/ })
    fireEvent.click(screen.getByText('👍'))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
