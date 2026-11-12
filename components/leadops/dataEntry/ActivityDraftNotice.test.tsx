import { fireEvent, render, screen } from '@testing-library/react'
import ActivityDraftNotice from './ActivityDraftNotice'

describe('ActivityDraftNotice', () => {
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<ActivityDraftNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says a draft was restored', () => {
    render(<ActivityDraftNotice restored />)
    expect(screen.getByText('Restored your unsent entry from this device — check it, then Save.')).toBeInTheDocument()
  })

  it('says the entry is kept on the device and offers Retry', () => {
    const onRetry = jest.fn()
    render(<ActivityDraftNotice unsent onRetry={onRetry} />)
    expect(screen.getByText('Not saved yet — kept on this device. It is sent again when the connection returns.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('disables Retry while a retry is in flight', () => {
    render(<ActivityDraftNotice unsent retrying onRetry={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
  })

  it('offers Use them / Discard for a draft that differs from what is saved', () => {
    const onUse = jest.fn()
    const onDiscard = jest.fn()
    render(<ActivityDraftNotice pending onUsePending={onUse} onDiscardPending={onDiscard} />)
    expect(screen.getByText('Unsent changes from this device differ from what is saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use them' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onUse).toHaveBeenCalledTimes(1)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
