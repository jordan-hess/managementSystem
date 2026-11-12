import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DailySection from './DailySection'
import { draftKey, loadDraft } from '@/lib/leadops/activityDrafts'

// The provider's mutator resolves true once the server has saved the entry, false if it refused or failed.
const upsertDailyLog = jest.fn().mockResolvedValue(true)
const provider = {
  dailyLogs: [] as unknown[],
  selectedDate: '2030-01-07',
  todayDate: '2030-01-07',
  setSelectedDate: jest.fn(),
  upsertDailyLog,
}
jest.mock('../LeadOpsDataProvider', () => ({ useLeadOpsData: () => provider }))

const el = (id: string) => document.getElementById(id) as HTMLElement
const save = () => screen.getByRole('button', { name: /save entry/i })

beforeEach(() => localStorage.clear()) // device drafts are kept in localStorage — never leak between tests

function setup() {
  render(<DailySection tlId="tl1" tlName="Tess" canEdit />)
}

describe('DailySection field errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('outlines only the metric that is invalid, with its own message', async () => {
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '-3' } })
    await userEvent.click(save())
    expect(el('daily-calls_listened')).toHaveAttribute('aria-invalid', 'true')
    expect(el('daily-calls_listened').className).toContain('border-red-500')
    expect(screen.getByText('Calls listened must be a whole number from 0 to 10,000.')).toHaveAttribute('id', 'daily-calls_listened-error')
    expect(el('daily-tickets_reviewed')).not.toHaveAttribute('aria-invalid')
    expect(upsertDailyLog).not.toHaveBeenCalled()
  })

  it('reports several invalid metrics at once and clears each when edited', async () => {
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '-1' } })
    fireEvent.change(el('daily-audits_completed'), { target: { value: '-2' } })
    await userEvent.click(save())
    expect(screen.getByText('Calls listened must be a whole number from 0 to 10,000.')).toBeInTheDocument()
    expect(screen.getByText('Audits completed must be a whole number from 0 to 10,000.')).toBeInTheDocument()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    expect(screen.queryByText('Calls listened must be a whole number from 0 to 10,000.')).not.toBeInTheDocument()
    expect(screen.getByText('Audits completed must be a whole number from 0 to 10,000.')).toBeInTheDocument()
  })

  it('saves when every metric is valid and shows the Saved confirmation', async () => {
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    await userEvent.click(save())
    expect(upsertDailyLog).toHaveBeenCalledWith(expect.objectContaining({ calls_listened: 5 }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it.each(['1.5', '10001', '1e5', '-0.5'])('highlights the field for %s instead of sending a value the server would refuse', async (bad) => {
    setup()
    fireEvent.change(el('daily-tickets_reviewed'), { target: { value: bad } })
    await userEvent.click(save())
    expect(el('daily-tickets_reviewed')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Tickets reviewed must be a whole number from 0 to 10,000.')).toBeInTheDocument()
    expect(upsertDailyLog).not.toHaveBeenCalled()
  })

  it('accepts the limits themselves: 0, 10000 and an empty field (which means 0)', async () => {
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '10000' } })
    fireEvent.change(el('daily-tickets_reviewed'), { target: { value: '0' } })
    await userEvent.click(save())
    expect(upsertDailyLog).toHaveBeenCalledWith(expect.objectContaining({ calls_listened: 10000, tickets_reviewed: 0, audits_completed: 0 }))
  })

  it('limits the notes box to 2,000 characters and refuses longer notes that get in anyway (e.g. pasted programmatically)', async () => {
    setup()
    expect(el('daily-notes')).toHaveAttribute('maxlength', '2000')
    fireEvent.change(el('daily-notes'), { target: { value: 'x'.repeat(2001) } })
    await userEvent.click(save())
    expect(el('daily-notes')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Notes must be 2,000 characters or fewer.')).toBeInTheDocument()
    expect(upsertDailyLog).not.toHaveBeenCalled()
  })

  it('does not claim Saved when the server refused or failed to save the entry', async () => {
    upsertDailyLog.mockResolvedValueOnce(false)
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    await userEvent.click(save())
    await waitFor(() => expect(upsertDailyLog).toHaveBeenCalled())
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})

describe('DailySection on a day that has passed', () => {
  const PAST_LOG = {
    id: 'd1', tl_id: 'tl1', date: '2030-01-06', calls_listened: 7, tickets_reviewed: 0, audits_completed: 0,
    critical_fails: 0, coaching_sessions: 0, agent_in_seat: false, notes: null, created_at: '', updated_at: '',
  }
  beforeEach(() => {
    provider.selectedDate = '2030-01-06'
    provider.todayDate = '2030-01-07'
    provider.dailyLogs = [PAST_LOG]
  })
  afterEach(() => {
    provider.selectedDate = '2030-01-07'
    provider.dailyLogs = []
  })

  it('shows the saved values read-only with the reason, and no Save button', () => {
    setup()
    expect((el('daily-calls_listened') as HTMLInputElement).value).toBe('7')
    expect(el('daily-calls_listened')).toBeDisabled()
    expect(screen.getByText(/Locked — a day's entry can only be changed on that day\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('says so when nothing was recorded for that day', () => {
    provider.dailyLogs = []
    setup()
    expect(screen.getByText('Nothing was recorded for this day.')).toBeInTheDocument()
  })
})

describe('DailySection device drafts', () => {
  const TODAY = '2030-01-07'
  const KEY = draftKey('daily', 'tl1', TODAY)
  const draftValues = (over = {}) => ({
    calls_listened: '5', tickets_reviewed: '', audits_completed: '', critical_fails: '', coaching_sessions: '',
    agent_in_seat: false, notes: '', ...over,
  })
  const seed = (values: unknown, key = KEY) => localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), values }))
  const serverLog = (over = {}) => ({
    id: 'd1', tl_id: 'tl1', date: TODAY, calls_listened: 3, tickets_reviewed: 0, audits_completed: 0,
    critical_fails: 0, coaching_sessions: 0, agent_in_seat: false, notes: null, created_at: '', updated_at: '', ...over,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    upsertDailyLog.mockReset()
    upsertDailyLog.mockResolvedValue(true)
    provider.selectedDate = TODAY
    provider.todayDate = TODAY
    provider.dailyLogs = []
  })

  it('autosaves what is typed as a draft on the device', () => {
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '8' } })
    expect(loadDraft(KEY)).toEqual(draftValues({ calls_listened: '8' }))
  })

  it('restores an unsent draft when nothing is saved for the day, and says so', () => {
    seed(draftValues({ calls_listened: '5', notes: 'QA ref' }))
    setup()
    expect((el('daily-calls_listened') as HTMLInputElement).value).toBe('5')
    expect((el('daily-notes') as HTMLTextAreaElement).value).toBe('QA ref')
    expect(screen.getByText('Restored your unsent entry from this device — check it, then Save.')).toBeInTheDocument()
  })

  it('clears the draft only once the server has confirmed the save', async () => {
    seed(draftValues())
    setup()
    await userEvent.click(save())
    await waitFor(() => expect(upsertDailyLog).toHaveBeenCalled())
    await waitFor(() => expect(loadDraft(KEY)).toBeNull())
  })

  it('keeps the draft and says so when the save is refused or fails, and Retry sends it again', async () => {
    upsertDailyLog.mockResolvedValueOnce(false)
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    await userEvent.click(save())
    expect(await screen.findByText('Not saved yet — kept on this device. It is sent again when the connection returns.')).toBeInTheDocument()
    expect(loadDraft(KEY)).toEqual(draftValues({ calls_listened: '5' }))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(upsertDailyLog).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(loadDraft(KEY)).toBeNull()
  })

  it('sends the unsent entry again by itself when the connection returns', async () => {
    upsertDailyLog.mockResolvedValueOnce(false)
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    await userEvent.click(save())
    await screen.findByText(/Not saved yet/)

    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(upsertDailyLog).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('never sends twice at once: Retry and the online event together make one call', async () => {
    upsertDailyLog.mockResolvedValueOnce(false)
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    await userEvent.click(save())
    await screen.findByText(/Not saved yet/)

    upsertDailyLog.mockImplementationOnce(() => new Promise(() => {})) // a retry that never answers
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(upsertDailyLog).toHaveBeenCalledTimes(2) // the first save + ONE retry, not three
  })

  it('offers a draft that differs from the saved entry as a choice: Use them applies it', async () => {
    provider.dailyLogs = [serverLog({ calls_listened: 3 })]
    seed(draftValues({ calls_listened: '9', tickets_reviewed: '0', audits_completed: '0', critical_fails: '0', coaching_sessions: '0' }))
    setup()
    expect((el('daily-calls_listened') as HTMLInputElement).value).toBe('3') // the saved value, not silently replaced
    expect(screen.getByText('Unsent changes from this device differ from what is saved.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Use them' }))
    expect((el('daily-calls_listened') as HTMLInputElement).value).toBe('9')
    expect(screen.queryByText('Unsent changes from this device differ from what is saved.')).not.toBeInTheDocument()
  })

  it('Discard on a conflicting draft keeps the saved values and removes the draft', async () => {
    provider.dailyLogs = [serverLog({ calls_listened: 3 })]
    seed(draftValues({ calls_listened: '9' }))
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect((el('daily-calls_listened') as HTMLInputElement).value).toBe('3')
    expect(loadDraft(KEY)).toBeNull()
  })

  it('hides a draft identical to the saved entry without deleting it', () => {
    provider.dailyLogs = [serverLog({ calls_listened: 3 })]
    seed(draftValues({ calls_listened: '3', tickets_reviewed: '0', audits_completed: '0', critical_fails: '0', coaching_sessions: '0' }))
    setup()
    expect(screen.queryByText(/Unsent changes/)).not.toBeInTheDocument()
    expect(loadDraft(KEY)).not.toBeNull()
  })

  describe('a day that has passed', () => {
    const PAST = '2030-01-06'
    const PAST_KEY = draftKey('daily', 'tl1', PAST)
    beforeEach(() => { provider.selectedDate = PAST })

    it('shows the unsent figures read-only with a Discard, and never sends them — not even when the connection returns', async () => {
      seed(draftValues({ calls_listened: '7', notes: 'late' }), PAST_KEY)
      setup()
      expect(el('daily-calls_listened')).toBeDisabled()
      expect(screen.getByText(/This day has passed and can no longer be saved\. Unsent figures from this device/)).toBeInTheDocument()
      expect(screen.getByText(/Calls listened 7/)).toBeInTheDocument()
      expect(screen.getByText(/late/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /save|retry|use them/i })).not.toBeInTheDocument()

      act(() => { window.dispatchEvent(new Event('online')) })
      expect(upsertDailyLog).not.toHaveBeenCalled()
      expect(loadDraft(PAST_KEY)).not.toBeNull() // kept, not silently deleted

      await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
      expect(loadDraft(PAST_KEY)).toBeNull()
      expect(screen.queryByText(/This day has passed and can no longer be saved\./)).not.toBeInTheDocument()
    })
  })

  it("on today's form, points at earlier days that still hold unsent figures", async () => {
    seed(draftValues({ calls_listened: '7' }), draftKey('daily', 'tl1', '2030-01-05'))
    setup()
    expect(screen.getByText('Unsent figures from 2030-01-05 are still on this device.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View 2030-01-05' }))
    expect(provider.setSelectedDate).toHaveBeenCalledWith('2030-01-05')
  })

  it('a viewer who cannot edit never reads or writes drafts', () => {
    seed(draftValues({ calls_listened: '5' }))
    render(<DailySection tlId="tl1" tlName="Tess" canEdit={false} />)
    expect(screen.queryByText(/Restored your unsent entry/)).not.toBeInTheDocument()
    expect(loadDraft(KEY)).not.toBeNull() // untouched
  })

  it('still works when localStorage is blocked: no draft, but the entry saves', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    await userEvent.click(save())
    await waitFor(() => expect(upsertDailyLog).toHaveBeenCalledWith(expect.objectContaining({ calls_listened: 5 })))
    jest.restoreAllMocks()
  })
})

describe('DailySection: edits cannot clobber a draft (review fixes)', () => {
  const TODAY = '2030-01-07'
  const KEY = draftKey('daily', 'tl1', TODAY)

  beforeEach(() => {
    jest.clearAllMocks()
    upsertDailyLog.mockReset()
    upsertDailyLog.mockResolvedValue(true)
    provider.selectedDate = TODAY
    provider.todayDate = TODAY
    provider.dailyLogs = []
  })

  it('locks the fields while a save is in flight, so a correction cannot be wiped when that save confirms', async () => {
    let finish: (ok: boolean) => void = () => {}
    upsertDailyLog.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
    setup()
    fireEvent.change(el('daily-calls_listened'), { target: { value: '5' } })
    fireEvent.click(save())
    expect(el('daily-calls_listened')).toBeDisabled()
    await act(async () => { finish(true) })
    expect(el('daily-calls_listened')).not.toBeDisabled()
  })

  it('while the Use them / Discard offer is open the fields are locked, so typing cannot replace the stored draft; Use them stores what it applies', async () => {
    provider.dailyLogs = [{
      id: 'd1', tl_id: 'tl1', date: TODAY, calls_listened: 3, tickets_reviewed: 0, audits_completed: 0,
      critical_fails: 0, coaching_sessions: 0, agent_in_seat: false, notes: null, created_at: '', updated_at: '',
    }]
    const stored = { calls_listened: '9', tickets_reviewed: '0', audits_completed: '0', critical_fails: '0', coaching_sessions: '0', agent_in_seat: false, notes: 'kept' }
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), values: stored }))
    setup()
    expect(el('daily-calls_listened')).toBeDisabled()
    expect(loadDraft(KEY)).toEqual(stored)
    await userEvent.click(screen.getByRole('button', { name: 'Use them' }))
    expect(el('daily-calls_listened')).not.toBeDisabled()
    expect(loadDraft(KEY)).toEqual(stored)
  })
})
