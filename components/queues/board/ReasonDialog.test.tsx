import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReasonDialog from './ReasonDialog'

// jsdom doesn't implement the modal-dialog API.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

function setup(open = true) {
  const onCancel = jest.fn()
  const onConfirm = jest.fn()
  const ui = (o: boolean) => (
    <ReasonDialog open={o} agentName="Ann Lee" from="VOICE" to="PORTING" onCancel={onCancel} onConfirm={onConfirm} />
  )
  const utils = render(ui(open))
  return { onCancel, onConfirm, rerender: (o: boolean) => utils.rerender(ui(o)) }
}

describe('ReasonDialog', () => {
  it('shows the title and all five chips, none pressed', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Move Ann Lee from VOICE to PORTING?' })).toBeInTheDocument()
    for (const c of ['Ticket volume spike', 'Covering absence', 'Skills match', 'Training', 'Other']) {
      expect(screen.getByRole('button', { name: c })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('chips are single-select', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Training' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skills match' }))
    expect(screen.getByRole('button', { name: 'Skills match' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Training' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('confirms with the chip, or null when none is chosen', async () => {
    const { onConfirm } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(onConfirm).toHaveBeenLastCalledWith(null)
    await userEvent.click(screen.getByRole('button', { name: 'Covering absence' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(onConfirm).toHaveBeenLastCalledWith('Covering absence')
  })

  it('Other reveals an input; blank text becomes "Other"', async () => {
    const { onConfirm } = setup()
    expect(screen.queryByLabelText('Other reason')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(onConfirm).toHaveBeenLastCalledWith('Other')
    await userEvent.type(screen.getByLabelText('Other reason'), '  Lunch cover ')
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(onConfirm).toHaveBeenLastCalledWith('Lunch cover')
  })

  it('Cancel button and the cancel event (Esc) call onCancel', async () => {
    const { onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('opens modally, closes, and returns focus to the opener', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { rerender } = setup(false)
    rerender(true)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    ;(document.activeElement as HTMLElement).blur()
    rerender(false)
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalled()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('forgets the previous selection when reopened', async () => {
    const { rerender } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Training' }))
    rerender(false)
    rerender(true)
    expect(screen.getByRole('button', { name: 'Training' })).toHaveAttribute('aria-pressed', 'false')
  })
})
