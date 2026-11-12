import { act, fireEvent, render, screen } from '@testing-library/react'
import NotificationBell from './NotificationBell'
import { NotificationsProvider } from './NotificationsProvider'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
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

const bell = () => (
  <NotificationsProvider userId="u1" userRole="agent">
    <NotificationBell />
  </NotificationsProvider>
)

async function mount() {
  render(bell())
  await flush()
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  localStorage.clear()
})
afterEach(() => jest.useRealTimers())

describe('NotificationBell', () => {
  it('still shows the bell and its unread badge', async () => {
    respond([n('a', 'callback')])
    await mount()
    expect(screen.getByTitle('View notifications')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})

// The red badge counts unread notifications newer than the last time the bell
// was opened ("seen", per browser — lib/unread/lastSeen.ts). Opening the bell
// clears it without marking anything read.
describe('NotificationBell red badge (seen)', () => {
  const badge = () => screen.queryByTestId('notifications-unread-badge')
  const info = (id: string, createdAt: string, read = false) => n(id, 'info', { created_at: createdAt, read })

  it('shows the unseen unread count', async () => {
    respond([info('a', '2026-10-01T10:00:00Z'), info('b', '2026-10-02T10:00:00Z')])
    await mount()
    expect(badge()).toHaveTextContent('2')
  })

  it('clears when the bell is opened, without marking anything read', async () => {
    respond([info('a', '2026-10-01T10:00:00Z')])
    await mount()
    expect(badge()).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('View notifications'))
    expect(badge()).not.toBeInTheDocument()
    expect(markRead).not.toHaveBeenCalled()
    // the row is still unread — "Mark all read" is still on offer
    expect(screen.getByText('Mark all read')).toBeInTheDocument()
  })

  it('stays cleared after a remount until a newer notification arrives', async () => {
    respond([info('a', '2026-10-01T10:00:00Z')])
    const first = render(bell())
    await flush()
    fireEvent.click(screen.getByTitle('View notifications'))
    first.unmount()

    render(bell())
    await flush()
    expect(badge()).not.toBeInTheDocument()
  })

  it('reappears for a notification newer than the last view', async () => {
    respond([info('a', '2026-10-01T10:00:00Z')])
    const first = render(bell())
    await flush()
    fireEvent.click(screen.getByTitle('View notifications'))
    first.unmount()

    respond([info('b', '2026-10-03T10:00:00Z'), info('a', '2026-10-01T10:00:00Z')])
    render(bell())
    await flush()
    expect(badge()).toHaveTextContent('1')
  })

  it('never counts already-read notifications', async () => {
    respond([info('a', '2026-10-01T10:00:00Z', true)])
    await mount()
    expect(badge()).not.toBeInTheDocument()
  })
})
