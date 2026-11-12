import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QueueBoard from './QueueBoard'
import { TRUSTPILOT_LINKEDIN } from '@/lib/queues/constants'
import { BOARD_QUEUES, type BoardAgent, type BoardDay, type QueueBoardProps } from '@/lib/queues/board'

const refresh = jest.fn()
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
jest.mock('@/lib/queues/actions', () => ({
  applyBoardMovesAction: jest.fn(),
  undoBoardChangesAction: jest.fn(),
}))
import { applyBoardMovesAction, undoBoardChangesAction } from '@/lib/queues/actions'

const apply = applyBoardMovesAction as jest.Mock
const undo = undoBoardChangesAction as jest.Mock

const TODAY = '2030-01-07' // a Monday
const WEEK = ['2030-01-07', '2030-01-08', '2030-01-09', '2030-01-10', '2030-01-11', '2030-01-12', '2030-01-13']
const ann: BoardAgent = { id: 'u1', full_name: 'Ann Lee', department: 'T2' }
const bob: BoardAgent = { id: 'u2', full_name: 'Bob Ray', department: 'Social' }

const day = (main: BoardDay['main'] = {}, additional: BoardDay['additional'] = {}): BoardDay => ({ main, additional })
const emptyWeek = (): Record<string, BoardDay> => Object.fromEntries(WEEK.map((d) => [d, day()]))

function renderBoard(props: Partial<QueueBoardProps> = {}, today: BoardDay = day()) {
  const boards = emptyWeek()
  boards[TODAY] = today
  return render(
    <QueueBoard today={TODAY} weekDays={WEEK} agents={[ann, bob]} boards={boards} canEdit initialTab="today" {...props} />,
  )
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const lane = (queue: string) => screen.getByRole('region', { name: new RegExp(`^${queue} queue,`) })
const bench = () => screen.getByRole('complementary', { name: 'Bench' })
const card = (name: RegExp) => screen.getByRole('button', { name })

async function place(name: RegExp, queue: string, first: string) {
  await userEvent.click(card(name))
  await userEvent.click(within(lane(queue)).getByRole('button', { name: `Place ${first} here` }))
}

// Placing an agent who already has a lane asks whether to move or add first.
const moveHere = () => userEvent.click(screen.getByRole('button', { name: 'Move here' }))

// jsdom doesn't implement the modal-dialog API.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

describe('QueueBoard', () => {
  beforeEach(() => jest.clearAllMocks())

  it('places a bench agent into a lane optimistically', async () => {
    const d = deferred<unknown>()
    apply.mockReturnValue(d.promise)
    renderBoard()

    await place(/ann lee/i, 'VOICE', 'Ann')
    expect(within(lane('VOICE')).getByText('Ann Lee')).toBeInTheDocument()
    expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: null, queue: 'VOICE' }], undefined)

    await act(async () => d.resolve({ data: [{ userId: 'u1', date: TODAY, queue: 'VOICE', previousQueue: null, logId: 'l1' }] }))
    const toast = screen.getByText('Ann Lee → VOICE')
    // Success stays polite; only errors interrupt as an alert.
    expect(toast.closest('[aria-live="polite"]')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('undo calls undoBoardChangesAction with the returned changes and puts the card back', async () => {
    const changes = [{ userId: 'u1', date: TODAY, queue: 'VOICE', previousQueue: null, logId: 'l1' }]
    apply.mockResolvedValue({ data: changes })
    undo.mockResolvedValue({ data: true })
    renderBoard()

    await place(/ann lee/i, 'VOICE', 'Ann')
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledWith(changes)
    expect(within(bench()).getByText('Ann Lee')).toBeInTheDocument()
    expect(within(lane('VOICE')).queryByText('Ann Lee')).not.toBeInTheDocument()
  })

  it('a failed move rolls back only its own agents', async () => {
    const first = deferred<unknown>()
    apply
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ data: [{ userId: 'u2', date: TODAY, queue: 'PORTING', previousQueue: null, logId: 'l2' }] })
    renderBoard()

    await place(/ann lee/i, 'VOICE', 'Ann')
    await place(/bob ray/i, 'PORTING', 'Bob')
    refresh.mockClear()
    await act(async () => first.resolve({ error: 'Forbidden' }))

    expect(within(bench()).getByText('Ann Lee')).toBeInTheDocument()
    expect(within(lane('PORTING')).getByText('Bob Ray')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Forbidden')
    // A failure (e.g. a stale board) refreshes too, so the lead sees the real board.
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a refresh during a pending move keeps that move until it settles', async () => {
    const first = deferred<unknown>()
    apply
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ data: [{ userId: 'u2', date: TODAY, queue: 'PORTING', previousQueue: null, logId: 'l2' }] })
    const { rerender } = renderBoard()

    await place(/ann lee/i, 'VOICE', 'Ann')
    await place(/bob ray/i, 'PORTING', 'Bob')
    // u2's refresh lands: the server has u2 in PORTING but not u1 yet.
    const fresh = emptyWeek()
    fresh[TODAY] = day({ u2: 'PORTING' })
    rerender(<QueueBoard today={TODAY} weekDays={WEEK} agents={[ann, bob]} boards={fresh} canEdit initialTab="today" />)
    expect(within(lane('VOICE')).getByText('Ann Lee')).toBeInTheDocument()
    expect(within(lane('PORTING')).getByText('Bob Ray')).toBeInTheDocument()

    await act(async () => first.resolve({ error: 'Forbidden' }))
    expect(within(bench()).getByText('Ann Lee')).toBeInTheDocument()
    expect(within(lane('PORTING')).getByText('Bob Ray')).toBeInTheDocument()
  })

  it('send to bench unassigns with a null queue', async () => {
    apply.mockResolvedValue({ data: [{ userId: 'u1', date: TODAY, queue: null, previousQueue: 'VOICE', logId: 'l3' }] })
    renderBoard({}, day({ u1: 'VOICE' }))

    await userEvent.click(card(/ann lee/i))
    await userEvent.click(screen.getByRole('button', { name: 'Send Ann Lee back to the bench' }))
    expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: null }], undefined)
    expect(await screen.findByText('Ann Lee → bench')).toBeInTheDocument()
    expect(within(bench()).getByText('Ann Lee')).toBeInTheDocument()
  })

  it("click-to-place sends the agent's current queue as from, including a still-pending move", async () => {
    const first = deferred<unknown>()
    apply.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ data: [] })
    renderBoard({ initialTab: 'week' }, day({ u1: 'ODU' }))

    await place(/ann lee/i, 'VOICE', 'Ann')
    await moveHere()
    expect(apply).toHaveBeenLastCalledWith([{ userId: 'u1', date: TODAY, from: 'ODU', queue: 'VOICE' }], undefined)
    // The first save hasn't settled; the board already shows Ann on VOICE.
    await place(/ann lee/i, 'PORTING', 'Ann')
    await moveHere()
    expect(apply).toHaveBeenLastCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: 'PORTING' }], undefined)
  })

  it('keeps keyboard focus on the moved card after click-to-place', async () => {
    apply.mockReturnValue(deferred<unknown>().promise)
    renderBoard()

    await place(/ann lee/i, 'VOICE', 'Ann')
    expect(within(lane('VOICE')).getByRole('button', { name: /ann lee/i })).toHaveFocus()
  })

  it('focuses the card on the bench after send to bench', async () => {
    apply.mockReturnValue(deferred<unknown>().promise)
    renderBoard({}, day({ u1: 'VOICE' }))

    await userEvent.click(card(/ann lee/i))
    await userEvent.click(screen.getByRole('button', { name: 'Send Ann Lee back to the bench' }))
    expect(within(bench()).getByRole('button', { name: /ann lee/i })).toHaveFocus()
  })

  it('read-only board shows no action buttons and cards are aria-disabled', async () => {
    renderBoard({ canEdit: false }, day({ u2: 'VOICE' }))

    await userEvent.click(card(/ann lee/i))
    expect(screen.queryByRole('button', { name: /place .* here/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /back to the bench/i })).not.toBeInTheDocument()
    expect(card(/ann lee/i)).toHaveAttribute('aria-disabled', 'true')
    expect(card(/bob ray/i)).toHaveAttribute('aria-disabled', 'true')
    expect(apply).not.toHaveBeenCalled()
  })

  it("points every card's aria-describedby at the keyboard hint", () => {
    renderBoard()
    const hint = document.getElementById(card(/ann lee/i).getAttribute('aria-describedby') ?? '')
    expect(hint).toHaveTextContent('Press Enter to select, then choose a lane. Press Space to drag.')
  })

  it('shows the celebration banner when every queue is covered', () => {
    const agents: BoardAgent[] = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, full_name: `Agent ${i}`, department: 'T2' }))
    const full: BoardDay['main'] = Object.fromEntries(BOARD_QUEUES.map((q, i) => [`a${i}`, q]))
    full.a19 = 'ADVANCED'
    renderBoard({ agents }, day(full))
    expect(screen.getByText('Every queue is covered. Nice work, captain.')).toBeInTheDocument()
  })

  it('re-seeds from fresh server boards after a refresh', () => {
    const { rerender } = renderBoard()
    const boards = emptyWeek()
    boards[TODAY] = day({ u2: 'ODU' })
    rerender(<QueueBoard today={TODAY} weekDays={WEEK} agents={[ann, bob]} boards={boards} canEdit initialTab="today" />)
    expect(within(lane('ODU')).getByText('Bob Ray')).toBeInTheDocument()
  })

  it('pages the week tab with ?week=', async () => {
    renderBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
    expect(screen.getByText('Week of 7 Jan')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(push).toHaveBeenCalledWith('?week=2030-01-14')
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(push).toHaveBeenCalledWith('?week=2029-12-31')
  })

  describe('reason dialog', () => {
    it('Today lane to lane opens the dialog and saves the chosen chip', async () => {
      apply.mockResolvedValue({ data: [{ userId: 'u1', date: TODAY, queue: 'PORTING', previousQueue: 'VOICE', logId: 'l1' }] })
      renderBoard({}, day({ u1: 'VOICE' }))

      await place(/ann lee/i, 'PORTING', 'Ann')
      await moveHere()
      expect(apply).not.toHaveBeenCalled()
      expect(within(lane('VOICE')).getByText('Ann Lee')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Move Ann Lee from VOICE to PORTING?' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Skills match' }))
      await userEvent.click(screen.getByRole('button', { name: 'Move' }))
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: 'PORTING' }], 'Skills match')
      expect(within(lane('PORTING')).getByText('Ann Lee')).toBeInTheDocument()
    })

    it("Other uses the typed text, or 'Other' when blank", async () => {
      apply.mockResolvedValue({ data: [] })
      renderBoard({}, day({ u1: 'VOICE' }))

      await place(/ann lee/i, 'PORTING', 'Ann')
      await moveHere()
      await userEvent.click(screen.getByRole('button', { name: 'Other' }))
      await userEvent.click(screen.getByRole('button', { name: 'Move' }))
      expect(apply).toHaveBeenLastCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: 'PORTING' }], 'Other')

      await place(/ann lee/i, 'ODU', 'Ann')
      await moveHere()
      await userEvent.click(screen.getByRole('button', { name: 'Other' }))
      await userEvent.type(screen.getByLabelText('Other reason'), 'Lunch cover')
      await userEvent.click(screen.getByRole('button', { name: 'Move' }))
      expect(apply).toHaveBeenLastCalledWith([{ userId: 'u1', date: TODAY, from: 'PORTING', queue: 'ODU' }], 'Lunch cover')
    })

    it('Cancel saves nothing and leaves the card on its lane', async () => {
      renderBoard({}, day({ u1: 'VOICE' }))

      await place(/ann lee/i, 'PORTING', 'Ann')
      await moveHere()
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(apply).not.toHaveBeenCalled()
      expect(within(lane('VOICE')).getByText('Ann Lee')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      // Focus goes back to the Place button that opened the dialog.
      expect(within(lane('PORTING')).getByRole('button', { name: 'Place Ann here' })).toHaveFocus()
    })

    it('Move puts focus on the moved card in its new lane', async () => {
      apply.mockReturnValue(deferred<unknown>().promise)
      renderBoard({}, day({ u1: 'VOICE' }))

      await place(/ann lee/i, 'PORTING', 'Ann')
      await moveHere()
      await userEvent.click(screen.getByRole('button', { name: 'Move' }))
      expect(within(lane('PORTING')).getByRole('button', { name: /ann lee/i })).toHaveFocus()
    })

    it('week tab never asks for a reason', async () => {
      apply.mockResolvedValue({ data: [] })
      renderBoard({}, day({ u1: 'VOICE' }))

      await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
      await place(/ann lee/i, 'PORTING', 'Ann')
      await moveHere()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: 'PORTING' }], undefined)
    })

    it('bench to lane never opens the dialog', async () => {
      apply.mockResolvedValue({ data: [] })
      renderBoard()

      await place(/ann lee/i, 'VOICE', 'Ann')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: null, queue: 'VOICE' }], undefined)
    })
  })

  describe('additional platforms', () => {
    const inLane = (queue: string, name: string | RegExp) => within(lane(queue)).getByRole('button', { name })

    it('shows an additional card with a "+ additional" tag in its lane and counts the lane', () => {
      renderBoard({}, day({ u1: 'VOICE' }, { u1: ['Dark posts'] }))
      expect(inLane('Dark posts', /Ann Lee.*\+ additional/)).toBeInTheDocument()
      expect(lane('Dark posts')).toHaveAccessibleName(/1 of 1/)
      expect(inLane('VOICE', 'Ann Lee')).toBeInTheDocument()
      expect(within(bench()).queryByText('Ann Lee')).not.toBeInTheDocument()
    })

    it('offers move or add when placing an agent already on a lane, and Add sends an additional move', async () => {
      apply.mockReturnValue(deferred<unknown>().promise)
      renderBoard({}, day({ u1: 'VOICE' }))

      await place(/ann lee/i, 'PORTING', 'Ann')
      expect(screen.getByRole('dialog', { name: 'Put Ann Lee on PORTING?' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Add as additional platform' }))
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, kind: 'additional', from: null, queue: 'PORTING' }], undefined)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(inLane('PORTING', /Ann Lee.*\+ additional/)).toHaveFocus()
      expect(inLane('VOICE', 'Ann Lee')).toBeInTheDocument()
    })

    it('disables Add at 3 channels', async () => {
      renderBoard({}, day({ u1: 'VOICE' }, { u1: ['Dark posts', 'ODU'] }))
      await userEvent.click(inLane('VOICE', 'Ann Lee'))
      await userEvent.click(within(lane('PORTING')).getByRole('button', { name: 'Place Ann here' }))
      expect(screen.getByRole('button', { name: 'Add as additional platform' })).toBeDisabled()
      expect(screen.getByText('Already on 3 channels')).toBeInTheDocument()
    })

    it('Move here still asks for a reason on Today', async () => {
      renderBoard({}, day({ u1: 'VOICE' }))
      await place(/ann lee/i, 'PORTING', 'Ann')
      await moveHere()
      expect(screen.getByRole('heading', { name: 'Move Ann Lee from VOICE to PORTING?' })).toBeInTheDocument()
      expect(apply).not.toHaveBeenCalled()
    })

    it('offers no Place button on a lane the agent already covers', async () => {
      renderBoard({}, day({ u1: 'VOICE' }, { u1: ['Dark posts'] }))
      await userEvent.click(inLane('VOICE', 'Ann Lee'))
      expect(within(lane('Dark posts')).queryByRole('button', { name: 'Place Ann here' })).not.toBeInTheDocument()
      expect(within(lane('VOICE')).queryByRole('button', { name: 'Place Ann here' })).not.toBeInTheDocument()
      expect(within(lane('ODU')).getByRole('button', { name: 'Place Ann here' })).toBeInTheDocument()
    })

    it('sending an additional card to the bench removes only that platform', async () => {
      apply.mockReturnValue(deferred<unknown>().promise)
      renderBoard({}, day({ u1: 'VOICE' }, { u1: ['Dark posts'] }))

      await userEvent.click(inLane('Dark posts', /\+ additional/))
      await userEvent.click(screen.getByRole('button', { name: 'Send Ann Lee back to the bench' }))
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, kind: 'additional', from: 'Dark posts', queue: null }], undefined)
      expect(within(lane('Dark posts')).queryByText('Ann Lee')).not.toBeInTheDocument()
      expect(inLane('VOICE', 'Ann Lee')).toBeInTheDocument()
    })

    it('sending the main card to the bench also clears the additional cards', async () => {
      apply.mockReturnValue(deferred<unknown>().promise)
      renderBoard({}, day({ u1: 'VOICE' }, { u1: ['Dark posts'] }))

      await userEvent.click(inLane('VOICE', 'Ann Lee'))
      await userEvent.click(screen.getByRole('button', { name: 'Send Ann Lee back to the bench' }))
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: null }], undefined)
      expect(within(lane('Dark posts')).queryByText('Ann Lee')).not.toBeInTheDocument()
      expect(within(bench()).getByText('Ann Lee')).toBeInTheDocument()
    })

    it('moves an additional card to an uncovered lane with its stored value as from, no dialog', async () => {
      apply.mockReturnValue(deferred<unknown>().promise)
      renderBoard({}, day({ u1: 'VOICE' }, { u1: ['LinkedIn'] }))

      await userEvent.click(inLane(TRUSTPILOT_LINKEDIN, /\+ additional/))
      await userEvent.click(within(lane('ODU')).getByRole('button', { name: 'Place Ann here' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, kind: 'additional', from: 'LinkedIn', queue: 'ODU' }], undefined)
      expect(inLane('ODU', /Ann Lee.*\+ additional/)).toBeInTheDocument()
      expect(within(lane(TRUSTPILOT_LINKEDIN)).queryByText('Ann Lee')).not.toBeInTheDocument()
    })

    it('a removed-lane agent with an additional shows only as that card until it is removed', async () => {
      apply.mockReturnValue(deferred<unknown>().promise)
      renderBoard({ initialTab: 'week' }, day({ u1: 'freescout' }, { u1: ['ODU'] }))

      // A removed-lane main has no card of its own: Ann shows only as her additional.
      expect(within(bench()).queryByText('Ann Lee')).not.toBeInTheDocument()
      await userEvent.click(inLane('ODU', /\+ additional/))
      await userEvent.click(screen.getByRole('button', { name: 'Send Ann Lee back to the bench' }))
      expect(apply).toHaveBeenLastCalledWith([{ userId: 'u1', date: TODAY, kind: 'additional', from: 'ODU', queue: null }], undefined)
      expect(within(bench()).getByText('on Freescout')).toBeInTheDocument()
    })

    it('shows a removed-lane agent on the bench with a note, and clear board skips them', async () => {
      const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
      apply.mockResolvedValue({ data: [] })
      renderBoard({}, day({ u1: 'VOICE', u2: 'freescout' }))

      expect(within(bench()).getByText('on Freescout')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Clear board' }))
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: null }], 'Cleared board')
      confirm.mockRestore()
    })

    it('places a removed-lane agent from the bench without a dialog', async () => {
      apply.mockReturnValue(deferred<unknown>().promise)
      renderBoard({}, day({ u2: 'freescout' }))

      await place(/bob ray/i, 'ODU', 'Bob')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(apply).toHaveBeenCalledWith([{ userId: 'u2', date: TODAY, from: 'freescout', queue: 'ODU' }], undefined)
    })

    it('renders a stored LinkedIn main in the combined lane', () => {
      renderBoard({}, day({ u1: 'LinkedIn' }))
      expect(inLane(TRUSTPILOT_LINKEDIN, 'Ann Lee')).toBeInTheDocument()
      expect(lane(TRUSTPILOT_LINKEDIN)).toHaveAccessibleName(/1 of 1/)
    })

    it("copy today's plan brings the additionals in line: removals first, then adds", async () => {
      apply.mockResolvedValue({ data: [] })
      const boards = emptyWeek()
      boards[TODAY] = day({ u1: 'VOICE' }, { u1: ['Dark posts'] })
      boards['2030-01-13'] = day({ u1: 'VOICE' }, { u1: ['ODU'] })
      renderBoard({ boards })
      await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
      await userEvent.click(screen.getByRole('button', { name: /^Sun/ }))
      await userEvent.click(screen.getByRole('button', { name: "Copy today's plan" }))
      expect(apply).toHaveBeenCalledWith(
        [
          { userId: 'u1', date: '2030-01-13', kind: 'additional', from: 'ODU', queue: null },
          { userId: 'u1', date: '2030-01-13', kind: 'additional', from: null, queue: 'Dark posts' },
        ],
        "Copied from today's plan",
      )
    })

    it("copy today's plan places mains before adding additionals", async () => {
      apply.mockResolvedValue({ data: [] })
      const boards = emptyWeek()
      boards[TODAY] = day({ u1: 'VOICE' }, { u1: ['Dark posts'] })
      renderBoard({ boards })
      await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
      await userEvent.click(screen.getByRole('button', { name: /^Sun/ }))
      await userEvent.click(screen.getByRole('button', { name: "Copy today's plan" }))
      expect(apply).toHaveBeenCalledWith(
        [
          { userId: 'u1', date: '2030-01-13', from: null, queue: 'VOICE' },
          { userId: 'u1', date: '2030-01-13', kind: 'additional', from: null, queue: 'Dark posts' },
        ],
        "Copied from today's plan",
      )
    })
    it("copy today's plan skips an agent whose main on the target day is a removed lane", async () => {
      apply.mockResolvedValue({ data: [] })
      const boards = emptyWeek()
      boards[TODAY] = day({ u1: 'VOICE' }, { u1: ['Dark posts'] })
      boards['2030-01-13'] = day({ u1: 'freescout' })
      renderBoard({ boards })
      await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
      await userEvent.click(screen.getByRole('button', { name: /^Sun/ }))
      await userEvent.click(screen.getByRole('button', { name: "Copy today's plan" }))
      expect(apply).not.toHaveBeenCalled()
    })

    it("copy today's plan moving a main onto the day's additional lane drops that additional", async () => {
      apply.mockResolvedValue({ data: [] })
      const boards = emptyWeek()
      boards[TODAY] = day({ u1: 'VOICE' })
      boards['2030-01-13'] = day({ u1: 'PORTING' }, { u1: ['VOICE'] })
      renderBoard({ boards })
      await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
      await userEvent.click(screen.getByRole('button', { name: /^Sun/ }))
      await userEvent.click(screen.getByRole('button', { name: "Copy today's plan" }))
      // The server drops the VOICE additional itself, so only the main move is sent.
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: '2030-01-13', from: 'PORTING', queue: 'VOICE' }], "Copied from today's plan")
      expect(within(lane('VOICE')).getByRole('button', { name: 'Ann Lee' })).toBeInTheDocument()
      expect(within(lane('VOICE')).queryByRole('button', { name: /\+ additional/ })).not.toBeInTheDocument()
    })
  })

  describe('bulk actions', () => {
    const cy: BoardAgent = { id: 'u3', full_name: 'Cy Doe', department: 'T2' }
    const three = [ann, bob, cy]
    const btn = (name: string) => screen.getByRole('button', { name })

    it('auto-fill previews before saving', async () => {
      renderBoard({ agents: three })
      await userEvent.click(btn('Auto-fill gaps'))
      const dialog = screen.getByRole('dialog', { name: 'Assign 3 agents and notify them?' })
      expect(within(dialog).getByText('Ann Lee → ADVANCED')).toBeInTheDocument()
      expect(apply).not.toHaveBeenCalled()
    })

    it('auto-fill cancel saves nothing', async () => {
      renderBoard({ agents: three })
      await userEvent.click(btn('Auto-fill gaps'))
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
      expect(apply).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('auto-fill confirm sends one batch with reason Auto-fill', async () => {
      apply.mockResolvedValue({ data: [] })
      renderBoard({ agents: three })
      await userEvent.click(btn('Auto-fill gaps'))
      await userEvent.click(btn('Assign and notify'))
      expect(apply).toHaveBeenCalledTimes(1)
      const [moves, reason] = apply.mock.calls[0]
      expect(moves).toHaveLength(3)
      expect(moves[0]).toEqual({ userId: 'u1', date: TODAY, from: null, queue: 'ADVANCED' })
      // Auto-fill only ever places bench agents.
      expect(moves.every((m: { from: unknown }) => m.from === null)).toBe(true)
      expect(reason).toBe('Auto-fill')
      expect(await screen.findByText('Auto-filled 3 spots')).toBeInTheDocument()
    })

    it('auto-fill cannot commit an empty plan if the gaps fill while the dialog is open', async () => {
      const { rerender } = renderBoard({ agents: three })
      await userEvent.click(btn('Auto-fill gaps'))
      // A refresh lands with everyone placed: nothing left to auto-fill.
      const boards = emptyWeek()
      boards[TODAY] = day({ u1: 'VOICE', u2: 'ODU', u3: 'PORTING' })
      rerender(<QueueBoard today={TODAY} weekDays={WEEK} agents={three} boards={boards} canEdit initialTab="today" />)
      const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Assign and notify' })
      expect(confirm).toBeDisabled()
      await userEvent.click(confirm)
      expect(apply).not.toHaveBeenCalled()
    })

    it('auto-fill is disabled when there is nothing to fill', () => {
      renderBoard({ agents: [] })
      expect(btn('Auto-fill gaps')).toBeDisabled()
    })

    it('clear on Today asks first and does nothing when declined', async () => {
      const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
      renderBoard({}, day({ u1: 'VOICE' }))
      await userEvent.click(btn('Clear board'))
      expect(confirm).toHaveBeenCalledWith("Send everyone on today's board back to the bench?")
      expect(apply).not.toHaveBeenCalled()
      confirm.mockRestore()
    })

    it('clear sends every placed agent to null with reason Cleared board', async () => {
      const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
      apply.mockResolvedValue({ data: [] })
      renderBoard({}, day({ u1: 'VOICE', u2: 'ODU' }))
      await userEvent.click(btn('Clear board'))
      expect(apply).toHaveBeenCalledWith(
        [
          { userId: 'u1', date: TODAY, from: 'VOICE', queue: null },
          { userId: 'u2', date: TODAY, from: 'ODU', queue: null },
        ],
        'Cleared board',
      )
      expect(await screen.findByText('Cleared 2 agents')).toBeInTheDocument()
      confirm.mockRestore()
    })

    it('clear on the week tab does not confirm', async () => {
      const confirm = jest.spyOn(window, 'confirm')
      apply.mockResolvedValue({ data: [] })
      renderBoard({}, day({ u1: 'VOICE' }))
      await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
      await userEvent.click(btn('Clear board'))
      expect(confirm).not.toHaveBeenCalled()
      expect(apply).toHaveBeenCalledWith([{ userId: 'u1', date: TODAY, from: 'VOICE', queue: null }], 'Cleared board')
      confirm.mockRestore()
    })

    it("copy today's plan copies only differing agents onto the selected weekday", async () => {
      apply.mockResolvedValue({ data: [] })
      const boards = emptyWeek()
      boards[TODAY] = day({ u1: 'VOICE', u2: 'ODU' })
      boards['2030-01-13'] = day({ u2: 'ODU', u3: 'PORTING' }) // Sunday
      renderBoard({ agents: three, boards })
      await userEvent.click(screen.getByRole('button', { name: 'Plan the week' }))
      expect(btn("Copy today's plan")).toBeDisabled() // week tab opens on today
      await userEvent.click(screen.getByRole('button', { name: /^Sun/ }))
      await userEvent.click(btn("Copy today's plan"))
      expect(apply).toHaveBeenCalledWith(
        [
          { userId: 'u1', date: '2030-01-13', from: null, queue: 'VOICE' },
          { userId: 'u3', date: '2030-01-13', from: 'PORTING', queue: null },
        ],
        "Copied from today's plan",
      )
      expect(await screen.findByText("Copied today's plan to Sunday")).toBeInTheDocument()
    })

    it('copy is not offered on the Today tab', () => {
      renderBoard()
      expect(screen.queryByRole('button', { name: "Copy today's plan" })).not.toBeInTheDocument()
    })

    it('one undo reverts the whole bulk batch', async () => {
      const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)
      const changes = [
        { userId: 'u1', date: TODAY, queue: null, previousQueue: 'VOICE', logId: 'l1' },
        { userId: 'u2', date: TODAY, queue: null, previousQueue: 'ODU', logId: 'l2' },
      ]
      apply.mockResolvedValue({ data: changes })
      undo.mockResolvedValue({ data: true })
      renderBoard({}, day({ u1: 'VOICE', u2: 'ODU' }))
      await userEvent.click(btn('Clear board'))
      await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
      expect(undo).toHaveBeenCalledTimes(1)
      expect(undo).toHaveBeenCalledWith(changes)
      expect(within(lane('VOICE')).getByText('Ann Lee')).toBeInTheDocument()
      expect(within(lane('ODU')).getByText('Bob Ray')).toBeInTheDocument()
      confirm.mockRestore()
    })

    it('read-only boards show no bulk buttons', () => {
      renderBoard({ canEdit: false })
      expect(screen.queryByRole('button', { name: 'Auto-fill gaps' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Clear board' })).not.toBeInTheDocument()
    })
  })
})
