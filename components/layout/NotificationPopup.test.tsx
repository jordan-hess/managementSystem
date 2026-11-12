import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationPopup from './NotificationPopup'
import type { Notification } from '@/types'

const notification = (over: Partial<Notification> = {}) =>
  ({ id: 'n1', type: 'callback', title: 'Callback assigned: Ann', message: 'Call Ann at 14:00.', read: false, created_at: '2030-01-01T10:00:00Z', sender: { full_name: 'Tess Lead' }, ...over }) as unknown as Notification

function setup(over: Partial<React.ComponentProps<typeof NotificationPopup>> = {}) {
  const props = { notification: notification(), position: 1, total: 1, canView: true, onDismiss: jest.fn(), onView: jest.fn(), ...over }
  render(<NotificationPopup {...props} />)
  return props
}

describe('NotificationPopup', () => {
  it('shows the notification in a centered alert dialog', () => {
    setup()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAccessibleName('Callback assigned: Ann')
    expect(screen.getByText('Call Ann at 14:00.')).toBeInTheDocument()
    expect(screen.getByText(/from Tess Lead/i)).toBeInTheDocument()
    // Centered on screen: a fixed full-screen flex container that centers its child.
    const overlay = dialog.parentElement as HTMLElement
    expect(overlay.className).toContain('fixed')
    expect(overlay.className).toContain('inset-0')
    expect(overlay.className).toContain('items-center')
    expect(overlay.className).toContain('justify-center')
  })

  it('labels the type so the agent can tell a reminder from an escalation', () => {
    setup({ notification: notification({ type: 'escalation' }) })
    expect(screen.getByText('escalation')).toBeInTheDocument()
  })

  it('calls onDismiss from Dismiss and from Escape', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    await userEvent.keyboard('{Escape}')
    expect(props.onDismiss).toHaveBeenCalledTimes(2)
  })

  it('calls onView from View', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: /^view/i }))
    expect(props.onView).toHaveBeenCalledTimes(1)
    expect(props.onDismiss).not.toHaveBeenCalled()
  })

  it('hides View when the notification has nowhere to go', () => {
    setup({ canView: false })
    expect(screen.queryByRole('button', { name: /^view/i })).not.toBeInTheDocument()
  })

  it('shows "1 of 3" only when more than one is queued', () => {
    const { rerender } = render(<NotificationPopup notification={notification()} position={2} total={3} canView onDismiss={jest.fn()} onView={jest.fn()} />)
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    rerender(<NotificationPopup notification={notification()} position={1} total={1} canView onDismiss={jest.fn()} onView={jest.fn()} />)
    expect(screen.queryByText(/of 1/)).not.toBeInTheDocument()
  })

  it('puts focus on the primary button so Enter acts immediately', () => {
    setup()
    expect(screen.getByRole('button', { name: /^view/i })).toHaveFocus()
  })

  it('falls back to focusing Dismiss when there is no View', () => {
    setup({ canView: false })
    expect(screen.getByRole('button', { name: /dismiss/i })).toHaveFocus()
  })
})
