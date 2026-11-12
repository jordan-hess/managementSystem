import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DndContext } from '@dnd-kit/core'
import QueueLane from './QueueLane'
import { useBoardSensors } from './sensors'
import type { BoardAgent } from '@/lib/queues/board'

const chris: BoardAgent = { id: 'a1', full_name: 'Chris Smith', department: 'T2' }
const bea: BoardAgent = { id: 'a2', full_name: 'Bea Jones', department: 'Social' }

function Wrapper({ children }: { children: React.ReactNode }) {
  return <DndContext sensors={useBoardSensors()}>{children}</DndContext>
}

function renderLane(props: Partial<React.ComponentProps<typeof QueueLane>> = {}) {
  const onSelect = jest.fn()
  const onPlace = jest.fn()
  render(
    <Wrapper>
      <QueueLane queue="ADVANCED" agents={[{ agent: bea, additional: false }]} selectedAgent={null} selectedCardId={null} canEdit onSelect={onSelect} onPlace={onPlace} {...props} />
    </Wrapper>,
  )
  return { onSelect, onPlace }
}

describe('QueueLane', () => {
  it('labels the region with count and target', () => {
    renderLane()
    expect(screen.getByRole('region', { name: 'ADVANCED queue, 1 of 2' })).toBeInTheDocument()
    expect(screen.getByText('Needs 1')).toBeInTheDocument()
  })

  it('labels a Social lane with its display name, not the raw value', () => {
    renderLane({ queue: 'hellopeter', agents: [] })
    expect(screen.getByRole('region', { name: 'HelloPeter queue, 0 of 1' })).toBeInTheDocument()
  })

  it("offers Place {first name} here when another lane's agent is selected", async () => {
    const { onPlace } = renderLane({ queue: 'VOICE', selectedAgent: chris, selectedCardId: 'a1' })
    await userEvent.click(screen.getByRole('button', { name: 'Place Chris here' }))
    expect(onPlace).toHaveBeenCalledWith('VOICE')
  })

  it("counts an additional card and doesn't offer Place to an agent already covering the lane", () => {
    renderLane({ agents: [{ agent: bea, additional: true }], selectedAgent: bea, selectedCardId: 'a2' })
    expect(screen.getByRole('region', { name: 'ADVANCED queue, 1 of 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bea Jones.*\+ additional/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /place bea here/i })).not.toBeInTheDocument()
  })

  it('hides place buttons when read-only', () => {
    renderLane({ queue: 'VOICE', selectedAgent: chris, selectedCardId: 'a1', canEdit: false })
    expect(screen.queryByRole('button', { name: /place chris here/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bea/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('Space on a card does not toggle selection', async () => {
    const { onSelect } = renderLane()
    screen.getByRole('button', { name: /bea/i }).focus()
    await userEvent.keyboard(' ')
    expect(onSelect).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}') // Space began a keyboard drag; cancel it
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('a2')
  })
})
