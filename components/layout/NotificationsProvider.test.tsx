import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsProvider } from './NotificationsProvider'
import NotificationBell from './NotificationBell'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('@/app/(app)/qa-reviews/warningsActions', () => ({ createWarningAction: jest.fn() }))
jest.mock('@/lib/notifications/actions', () => ({
  fetchNotificationsAction: jest.fn(),
  markAllNotificationsReadAction: jest.fn().mockResolvedValue({ data: true }),
  markNotificationReadAction: jest.fn().mockResolvedValue({ data: true }),
}))
import { fetchNotificationsAction, markNotificationReadAction } from '@/lib/notifications/actions'

const fetchMock = fetchNotificationsAction as jest.Mock
const markRead = markNotificationReadAction as jest.Mock

const n = (id: string, type: string, over = {}) => ({
  id, type, read: false, title: `${type} ${id}`, message: `message ${id}`, created_at: `2030-01-01T10:0${id.length}:00Z`, sender: null, ...over,
})
const respond = (...lists: unknown[][]) => {
  lists.forEach((l) => fetchMock.mockResolvedValueOnce({ data: l }))
  fetchMock.mockResolvedValue({ data: lists[lists.length - 1] })
}

const flush = () => act(async () => { await Promise.resolve() })
const poll = () => act(async () => { jest.advanceTimersByTime(30_000) })

// A page with NO header (and so no bell) — the provider alone must produce the pop-up.
async function mountHeaderless() {
  render(<NotificationsProvider userId="u1" userRole="agent"><p>a page with no header</p></NotificationsProvider>)
  await flush()
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  localStorage.clear()
})
afterEach(() => jest.useRealTimers())

describe('NotificationsProvider pop-ups', () => {
  it('shows the pop-up on a page that has no header', async () => {
    respond([], [n('b', 'escalation')])
    await mountHeaderless()
    await poll()
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('escalation b')
    expect(screen.queryByTitle('View notifications')).not.toBeInTheDocument()
  })

  it('does not pop up for notifications that were already there at page load', async () => {
    respond([n('a', 'callback')])
    await mountHeaderless()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it.each(['callback', 'reminder', 'escalation', 'followup'])('pops up a new %s notification on a later poll', async (type) => {
    respond([], [n('b', type)])
    await mountHeaderless()
    await poll()
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(`${type} b`)
  })

  it('does not pop up for other notification types', async () => {
    respond([], [n('c', 'request'), n('d', 'queue_assignment'), n('e', 'schedule_conflict')])
    await mountHeaderless()
    await poll()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Dismiss marks the notification read and closes the pop-up', async () => {
    respond([], [n('b', 'callback')])
    await mountHeaderless()
    await poll()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(markRead).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it("View marks it read and opens the notification's page", async () => {
    respond([], [n('b', 'escalation')])
    await mountHeaderless()
    await poll()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.click(screen.getByRole('button', { name: /^view/i }))
    expect(markRead).toHaveBeenCalledWith('b')
    expect(push).toHaveBeenCalledWith('/support-tickets')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('queues several new notifications oldest first and does not repeat one after it is dismissed', async () => {
    respond([], [n('bb', 'callback', { created_at: '2030-01-01T10:05:00Z' }), n('a', 'escalation', { created_at: '2030-01-01T10:01:00Z' })])
    await mountHeaderless()
    await poll()
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('escalation a')
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('callback bb')
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    await poll() // the same two ids come back on the next poll — they must not pop up again
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('drops a queued pop-up if the notification is read elsewhere before the agent gets to it', async () => {
    respond([], [n('b', 'callback')], [n('b', 'callback', { read: true })])
    await mountHeaderless()
    await poll()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await poll()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('polls once per interval no matter how many things on the page read the notifications', async () => {
    respond([])
    render(
      <NotificationsProvider userId="u1" userRole="agent">
        <NotificationBell />
        <NotificationBell />
      </NotificationsProvider>,
    )
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await poll()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
