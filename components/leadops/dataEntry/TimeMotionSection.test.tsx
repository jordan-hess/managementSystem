import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimeMotionSection from './TimeMotionSection'
import { PLANNER_MESSAGES as M } from '@/lib/leadops/plannerLimits'
import { draftKey, loadDraft } from '@/lib/leadops/activityDrafts'
import { plannerDayWindow } from '@/lib/leadops/periods'

const savePlannerDay = jest.fn()
const provider = {
  selectedDate: '2026-10-08',
  plannerDays: {} as Record<string, { logs: unknown[]; unplanned: unknown[] }>,
  plannerRevision: 0,
  plannerRosterMismatch: false,
  plannerWindowFor: jest.fn(() => ({ editable: true }) as { editable: true } | { editable: false; reason: 'future' | 'closed' }),
  // The window at the moment of sending (the provider reads the real clock); editable by default here.
  plannerWindowNow: jest.fn<{ editable: true } | { editable: false; reason: 'future' | 'closed' }, [string]>(() => ({ editable: true })),
  savePlannerDay,
  reloadPlannerDay: jest.fn(),
  peekPlannerRevision: jest.fn(),
  resolvedShift: { kind: 'early', startTime: '08:00:00', endTime: '17:00:00' } as unknown,
  resolvedShiftLoading: false,
  resolvedShiftError: null as string | null,
}
jest.mock('../LeadOpsDataProvider', () => ({
  useLeadOpsData: () => provider,
  plannerDayFor: (days: Record<string, { logs: unknown[]; unplanned: unknown[] }>, tl: string, date: string) => days[`${tl}|${date}`] ?? { logs: [], unplanned: [] },
}))

const KEY = 'tl1|2026-10-08'
const statusSelect = (time: string) => screen.getByLabelText(`Set status for the ${time} block`) as HTMLSelectElement
const saveDay = () => screen.getByRole('button', { name: 'Save day' })
const setup = (canEdit = true) => render(<TimeMotionSection tlId="tl1" tlName="Tess" canEdit={canEdit} />)
const storedLog = (over = {}) => ({
  id: 'l1', tl_id: 'tl1', date: '2026-10-08', template_block_id: 'tpl-early-b2', status: 'completed', actual_minutes: 90,
  actual_category: 'operations', actual_activity: null, reason: null, updated_at: '', ...over,
})

beforeEach(() => localStorage.clear())

beforeEach(() => {
  // jsdom has no matchMedia; DaySummary's bar animation asks for prefers-reduced-motion.
  window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
  jest.clearAllMocks()
  savePlannerDay.mockReset()
  savePlannerDay.mockResolvedValue({ ok: true, revision: 1 })
  provider.selectedDate = '2026-10-08'
  provider.plannerDays = {}
  provider.plannerRevision = 0
  provider.plannerRosterMismatch = false
  provider.plannerWindowFor.mockReturnValue({ editable: true })
  provider.plannerWindowNow.mockReset()
  provider.plannerWindowNow.mockReturnValue({ editable: true })
  provider.resolvedShift = { kind: 'early', startTime: '08:00:00', endTime: '17:00:00' }
  provider.resolvedShiftLoading = false
  provider.resolvedShiftError = null
})

describe('TimeMotionSection — marking blocks (local until Save day)', () => {
  it('shows the shift\'s planned blocks, all still planned, with nothing to save yet', () => {
    setup()
    expect(statusSelect('08:30–10:00')).toHaveValue('planned')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('marking a block completed pre-fills its planned minutes and category, and saves them explicitly', async () => {
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(1))
    expect(savePlannerDay).toHaveBeenCalledWith(
      { blocks: [{ template_block_id: 'tpl-early-b2', status: 'completed', actual_minutes: 90, actual_category: 'operations', actual_activity: null, reason: null }], unplanned: [] },
      0,
    )
  })

  it('moved needs minutes, a category and a reason: Save stays disabled until there is a reason', async () => {
    setup()
    await userEvent.selectOptions(statusSelect('10:00–10:30'), 'moved')
    const dialogSave = screen.getByRole('button', { name: 'Save' })
    expect(dialogSave).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Queue spike')
    expect(dialogSave).toBeEnabled()
    await userEvent.click(dialogSave)
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(savePlannerDay.mock.calls[0][0].blocks[0]).toEqual({
      template_block_id: 'tpl-early-b3', status: 'moved', actual_minutes: 30, actual_category: 'qa', actual_activity: null, reason: 'Queue spike',
    })
  })

  it('not completed stores only a reason (minutes, category and activity empty)', async () => {
    setup()
    await userEvent.selectOptions(statusSelect('10:30–11:30'), 'not_completed')
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'In a meeting')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(savePlannerDay.mock.calls[0][0].blocks[0]).toEqual({
      template_block_id: 'tpl-early-b4', status: 'not_completed', actual_minutes: null, actual_category: null, actual_activity: null, reason: 'In a meeting',
    })
  })

  it('setting a block back to planned removes it from the day', async () => {
    provider.plannerDays = { [KEY]: { logs: [storedLog()], unplanned: [] } }
    provider.plannerRevision = 2
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'planned')
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(savePlannerDay.mock.calls[0][0].blocks).toEqual([])
  })

  it('refuses a completed block whose minutes were cleared, saying why, without calling the server', async () => {
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.clear(screen.getByLabelText('Minutes for the 08:30–10:00 block'))
    await userEvent.click(saveDay())
    expect(await screen.findByText(M.invalidMinutes)).toBeInTheDocument()
    expect(savePlannerDay).not.toHaveBeenCalled()
  })

  it('shows what is already stored for the day, and sends the stored revision', async () => {
    provider.plannerDays = { [KEY]: { logs: [storedLog()], unplanned: [] } }
    provider.plannerRevision = 4
    setup()
    expect(statusSelect('08:30–10:00')).toHaveValue('completed')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    await userEvent.selectOptions(statusSelect('10:00–10:30'), 'completed')
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(savePlannerDay.mock.calls[0][1]).toBe(4)
    expect(savePlannerDay.mock.calls[0][0].blocks).toHaveLength(2)
  })
})

describe('TimeMotionSection — unplanned work', () => {
  it('adds an entry locally (needs a reason and minutes) and saves it with Save day', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /log unplanned work/i }))
    const add = screen.getByRole('button', { name: 'Add entry' })
    expect(add).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Escalation from T3')
    await userEvent.click(add)
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(savePlannerDay.mock.calls[0][0].unplanned).toEqual([
      { category: 'operations', minutes: 30, reason: 'Escalation from T3', displaced_block_id: null },
    ])
  })

  it('gives every added entry its own id, so removing one never removes another with the same minutes', async () => {
    setup()
    const add = async (reason: string) => {
      await userEvent.click(screen.getByRole('button', { name: /log unplanned work/i }))
      await userEvent.type(screen.getByLabelText('Reason (required)'), reason)
      await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    }
    await add('Entry A')
    await add('Entry B')
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]) // removes A
    await add('Entry C')
    expect(screen.queryByText('Entry A')).not.toBeInTheDocument()
    expect(screen.getByText('Entry B')).toBeInTheDocument()
    expect(screen.getByText('Entry C')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]) // removes only C
    expect(screen.getByText('Entry B')).toBeInTheDocument()
    expect(screen.queryByText('Entry C')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /log unplanned work/i }))
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Entry D')
    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(savePlannerDay.mock.calls[0][0].unplanned.map((u: { reason: string }) => u.reason)).toEqual(['Entry B', 'Entry D'])
  }, 20000)

  it('removes an entry locally', async () => {
    provider.plannerDays = { [KEY]: { logs: [], unplanned: [{ id: 'u1', tl_id: 'tl1', date: '2026-10-08', category: 'qa', minutes: 15, reason: 'Audit', displaced_block_id: null, created_at: '' }] } }
    provider.plannerRevision = 1
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(savePlannerDay.mock.calls[0][0].unplanned).toEqual([])
  })
})

describe('TimeMotionSection — Saved and failures', () => {
  it('shows Saved only after the server confirms, and the hint goes away', async () => {
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.click(saveDay())
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('does not claim Saved when the save failed, and keeps the unsaved hint', async () => {
    savePlannerDay.mockResolvedValue({ ok: false, conflict: false, error: 'x' })
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('locks the fields while a save is in flight (so an edit cannot be lost when it confirms)', async () => {
    let finish: (r: unknown) => void = () => {}
    savePlannerDay.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    fireEvent.click(saveDay())
    await waitFor(() => expect(statusSelect('08:30–10:00')).toBeDisabled())
    finish({ ok: true, revision: 1 })
    await waitFor(() => expect(statusSelect('08:30–10:00')).not.toBeDisabled())
  })
})

describe('TimeMotionSection — when the day cannot be edited', () => {
  it('a viewer who cannot edit sees the day read-only, with no Save day and no unplanned button', () => {
    provider.plannerDays = { [KEY]: { logs: [storedLog()], unplanned: [] } }
    setup(false)
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log unplanned work/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
  })

  it('a day past its window is read-only with the reason', () => {
    provider.plannerWindowFor.mockReturnValue({ editable: false, reason: 'closed' })
    setup()
    expect(screen.getByText(/Locked — a planner day can be changed on the day, or until 12:00 the next day\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
  })

  it('a future day says it has not started', () => {
    provider.plannerWindowFor.mockReturnValue({ editable: false, reason: 'future' })
    setup()
    expect(screen.getByText(M.notStarted)).toBeInTheDocument()
  })

  it.each([['off', { kind: 'off' }], ['unknown', { kind: 'unknown' }]])('with the roster %s there are no blocks, only unplanned work', async (_n, shift) => {
    provider.resolvedShift = shift
    setup()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
    expect(screen.getByText(M.noShift)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log unplanned work/i })).toBeInTheDocument()
  })

  it('after a roster change the saved blocks are shown read-only with their original labels, and nothing can be saved', () => {
    provider.plannerRosterMismatch = true
    provider.resolvedShift = { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' }
    provider.plannerDays = { [KEY]: { logs: [storedLog({ template_block_id: 'tpl-early-b2' })], unplanned: [] } }
    setup()
    expect(screen.getByText(/The roster for this day changed after entries were saved\./)).toBeInTheDocument()
    expect(screen.getByText('Queue monitoring & operational support')).toBeInTheDocument() // the early block it was recorded against
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
  })
})

describe('TimeMotionSection device drafts', () => {
  const DRAFT_KEY = draftKey('planner', 'tl1', '2026-10-08')
  const completedDay = { blocks: [{ template_block_id: 'tpl-early-b2', status: 'completed', actual_minutes: 90, actual_category: 'operations', actual_activity: null, reason: null }], unplanned: [] }
  const seed = (values: unknown, key = DRAFT_KEY) => localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), values }))

  it('autosaves every edit as a draft on the device', async () => {
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    expect(loadDraft(DRAFT_KEY)).toEqual(completedDay)
  })

  it('restores an unsent draft when no day is stored, and says so', () => {
    seed(completedDay)
    setup()
    expect(statusSelect('08:30–10:00')).toHaveValue('completed')
    expect(screen.getByText('Restored your unsent entry from this device — check it, then Save.')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('clears the draft only after the server has confirmed the save', async () => {
    seed(completedDay)
    setup()
    await userEvent.click(saveDay())
    await waitFor(() => expect(loadDraft(DRAFT_KEY)).toBeNull())
  })

  it('keeps the draft when a save fails, offers Retry, and Retry sends it again (once)', async () => {
    savePlannerDay.mockResolvedValueOnce({ ok: false, conflict: false, error: 'x' })
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.click(saveDay())
    expect(await screen.findByText('Not saved yet — kept on this device. It is sent again when the connection returns.')).toBeInTheDocument()
    expect(loadDraft(DRAFT_KEY)).toEqual(completedDay)

    savePlannerDay.mockImplementationOnce(() => new Promise(() => {})) // a retry that never answers
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(savePlannerDay).toHaveBeenCalledTimes(2) // the first save + ONE retry, not three
  })

  it('sends the unsent day again when the connection returns', async () => {
    savePlannerDay.mockResolvedValueOnce({ ok: false, conflict: false, error: 'x' })
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.click(saveDay())
    await screen.findByText(/Not saved yet/)
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(loadDraft(DRAFT_KEY)).toBeNull())
  })

  it('offers a draft that differs from the stored day as a choice: the fields are locked until Use them / Discard', async () => {
    provider.plannerDays = { [KEY]: { logs: [storedLog({ template_block_id: 'tpl-early-b3', actual_minutes: 30, actual_category: 'qa' })], unplanned: [] } }
    provider.plannerRevision = 3
    seed(completedDay)
    setup()
    expect(screen.getByText('Unsent changes from this device differ from what is saved.')).toBeInTheDocument()
    expect(statusSelect('08:30–10:00')).toBeDisabled()
    expect(loadDraft(DRAFT_KEY)).toEqual(completedDay) // not touched by the offer
    await userEvent.click(screen.getByRole('button', { name: 'Use them' }))
    expect(statusSelect('08:30–10:00')).toHaveValue('completed')
    expect(statusSelect('08:30–10:00')).not.toBeDisabled()
  })

  it('Discard drops the draft and keeps the stored day', async () => {
    provider.plannerDays = { [KEY]: { logs: [storedLog({ template_block_id: 'tpl-early-b3', actual_minutes: 30, actual_category: 'qa' })], unplanned: [] } }
    provider.plannerRevision = 3
    seed(completedDay)
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(loadDraft(DRAFT_KEY)).toBeNull()
    expect(statusSelect('10:00–10:30')).toHaveValue('completed') // the stored day (b3)
  })

  describe('a day past its window', () => {
    beforeEach(() => provider.plannerWindowFor.mockReturnValue({ editable: false, reason: 'closed' }))

    it('shows the unsent figures read-only with a Discard, and never sends them — not even when the connection returns', async () => {
      seed(completedDay)
      setup()
      expect(screen.getByText(/This day can no longer be saved\. Unsent entries from this device/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /save day|retry|use them/i })).not.toBeInTheDocument()
      act(() => { window.dispatchEvent(new Event('online')) })
      expect(savePlannerDay).not.toHaveBeenCalled()
      expect(loadDraft(DRAFT_KEY)).not.toBeNull() // kept, not silently deleted
      await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
      expect(loadDraft(DRAFT_KEY)).toBeNull()
    })
  })

  it('a save fails, then the window closes in the same session: the unsent day is shown as unsendable, never sent (even on online), and can be discarded', async () => {
    savePlannerDay.mockResolvedValueOnce({ ok: false, conflict: false, error: 'x' })
    const { rerender } = setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.click(saveDay())
    await screen.findByText(/Not saved yet/)
    expect(savePlannerDay).toHaveBeenCalledTimes(1)

    provider.plannerWindowFor.mockReturnValue({ editable: false, reason: 'closed' })
    rerender(<TimeMotionSection tlId="tl1" tlName="Tess" canEdit />)
    expect(screen.getByText('This day can no longer be saved. Unsent entries from this device — copy them if a correction is needed:')).toBeInTheDocument()
    expect(screen.getByText(/08:30–10:00 Queue monitoring & operational support: completed · 90 min · operations/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save day|retry|use them/i })).not.toBeInTheDocument()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(savePlannerDay).toHaveBeenCalledTimes(1) // nothing sent late
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(loadDraft(DRAFT_KEY)).toBeNull()
    expect(screen.queryByText(/Unsent entries from this device/)).not.toBeInTheDocument()
    expect(screen.queryByText(/completed · 90 min/)).not.toBeInTheDocument()
  })

  it('a roster change inside the window still shows an existing draft read-only with a Discard, and never sends it', async () => {
    provider.plannerRosterMismatch = true
    provider.resolvedShift = { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' }
    provider.plannerDays = { [KEY]: { logs: [storedLog()], unplanned: [] } }
    provider.plannerRevision = 2
    seed({ blocks: [{ ...completedDay.blocks[0], template_block_id: 'tpl-early-b3', actual_minutes: 30, actual_category: 'qa' }], unplanned: [] })
    setup()
    expect(screen.getByText('The roster for this day changed, so this day can no longer be saved here. Unsent entries from this device — copy them if a correction is needed:')).toBeInTheDocument()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(savePlannerDay).not.toHaveBeenCalled()
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(loadDraft(DRAFT_KEY)).toBeNull()
  })

  it('a viewer who cannot edit never reads or writes drafts', () => {
    seed(completedDay)
    setup(false)
    expect(screen.queryByText(/Restored your unsent entry/)).not.toBeInTheDocument()
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })

  it('still works when localStorage is blocked', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalled())
    jest.restoreAllMocks()
  })
})

describe('TimeMotionSection — a stale save (revision conflict)', () => {
  const DRAFT_KEY = draftKey('planner', 'tl1', '2026-10-08')
  const conflict = { ok: false, conflict: true, error: M.conflict }

  async function causeConflict() {
    savePlannerDay.mockResolvedValueOnce(conflict)
    setup()
    await userEvent.selectOptions(statusSelect('08:30–10:00'), 'completed')
    await userEvent.click(saveDay())
    await screen.findByText(/newer changes were saved elsewhere/i)
  }

  it('says newer changes exist and offers exactly two choices, keeping the draft', async () => {
    await causeConflict()
    expect(screen.getByRole('button', { name: 'Reload latest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Replace the saved day with my version/ })).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })

  it('Reload latest reloads the stored day and keeps the draft', async () => {
    await causeConflict()
    await userEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
    expect(provider.reloadPlannerDay).toHaveBeenCalledTimes(1)
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })

  it('Replace asks for confirmation with the overwrite warning, and Cancel does nothing', async () => {
    await causeConflict()
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved day with my version/ }))
    expect(screen.getByText(/Replacing the day will overwrite the changes that were saved since you opened it\. This cannot be undone from the app\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(provider.peekPlannerRevision).not.toHaveBeenCalled()
    expect(savePlannerDay).toHaveBeenCalledTimes(1) // only the original, refused save
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })

  it('Replace day saves the whole-day draft against the freshly fetched revision, and clears the draft once it is confirmed', async () => {
    await causeConflict()
    provider.peekPlannerRevision.mockResolvedValue(8)
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved day with my version/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Replace day' }))
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(2))
    expect(savePlannerDay.mock.calls[1][1]).toBe(8)
    await waitFor(() => expect(loadDraft(DRAFT_KEY)).toBeNull())
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('if the day changed yet again, the conflict is shown again, nothing is overwritten and the draft stays', async () => {
    await causeConflict()
    provider.peekPlannerRevision.mockResolvedValue(8)
    savePlannerDay.mockResolvedValueOnce(conflict)
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved day with my version/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Replace day' }))
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Reload latest' })).toBeInTheDocument()
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })

  it('locks the fields from the moment Replace is confirmed, so what is saved and what the draft holds cannot diverge', async () => {
    await causeConflict()
    let resolvePeek: (n: number) => void = () => {}
    provider.peekPlannerRevision.mockImplementation(() => new Promise<number>((r) => { resolvePeek = r }))
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved day with my version/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Replace day' }))
    await waitFor(() => expect(provider.peekPlannerRevision).toHaveBeenCalled())
    expect(statusSelect('08:30–10:00')).toBeDisabled()
    expect(statusSelect('10:00–10:30')).toBeDisabled()
    await userEvent.selectOptions(statusSelect('10:00–10:30'), 'completed') // refused: the field is locked
    expect(statusSelect('10:00–10:30')).toHaveValue('planned')
    await act(async () => { resolvePeek(8) })
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(2))
    expect(savePlannerDay.mock.calls[1][0].blocks.map((b: { template_block_id: string }) => b.template_block_id)).toEqual(['tpl-early-b2'])
    expect(savePlannerDay.mock.calls[1][1]).toBe(8)
    await waitFor(() => expect(loadDraft(DRAFT_KEY)).toBeNull())
    await waitFor(() => expect(statusSelect('10:00–10:30')).not.toBeDisabled())
  })

  it('if the latest revision cannot be fetched, nothing is sent', async () => {
    await causeConflict()
    provider.peekPlannerRevision.mockResolvedValue(null)
    await userEvent.click(screen.getByRole('button', { name: /Replace the saved day with my version/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Replace day' }))
    await waitFor(() => expect(provider.peekPlannerRevision).toHaveBeenCalled())
    expect(savePlannerDay).toHaveBeenCalledTimes(1)
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })
})

describe('TimeMotionSection — the revision a save is checked against', () => {
  // The server mock: the stored day is at `rev`; a save expecting anything else is refused as a conflict.
  const serverAt = (rev: number) => savePlannerDay.mockImplementation(async (_day: unknown, expected: number) =>
    (expected === rev ? { ok: true, revision: rev + 1 } : { ok: false, conflict: true, error: M.conflict }))
  const rerenderSection = (rerender: (ui: React.ReactElement) => void) => rerender(<TimeMotionSection tlId="tl1" tlName="Tess" canEdit />)

  beforeEach(() => {
    provider.plannerDays = { [KEY]: { logs: [storedLog()], unplanned: [] } }
    provider.plannerRevision = 2
  })

  it('sends the revision its rows were loaded at, even after the provider learns a newer one without a remount — and the server refuses it as a conflict', async () => {
    serverAt(3) // another device saved the day: it is at revision 3 now
    const { rerender } = setup()
    provider.plannerRevision = 3 // a same-day refetch landed under the mounted section (no remount)
    rerenderSection(rerender)
    await userEvent.selectOptions(statusSelect('10:00–10:30'), 'completed')
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(1))
    expect(savePlannerDay.mock.calls[0][1]).toBe(2)
    expect(await screen.findByText(/newer changes were saved elsewhere/i)).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('after a confirmed save, the next save is checked against the revision that save returned', async () => {
    savePlannerDay.mockResolvedValueOnce({ ok: true, revision: 3 })
    setup()
    await userEvent.selectOptions(statusSelect('10:00–10:30'), 'completed')
    await userEvent.click(saveDay())
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await userEvent.selectOptions(statusSelect('16:00–16:30'), 'completed')
    await userEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(2))
    expect(savePlannerDay.mock.calls[0][1]).toBe(2)
    expect(savePlannerDay.mock.calls[1][1]).toBe(3)
  })

  it('Retry and the online resend also use the loaded revision, not a newer one the provider reports', async () => {
    savePlannerDay.mockResolvedValueOnce({ ok: false, conflict: false, error: 'x' })
    savePlannerDay.mockResolvedValueOnce({ ok: false, conflict: false, error: 'x' })
    const { rerender } = setup()
    await userEvent.selectOptions(statusSelect('10:00–10:30'), 'completed')
    await userEvent.click(saveDay())
    await screen.findByText(/Not saved yet/)
    provider.plannerRevision = 5
    rerenderSection(rerender)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled())
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(3))
    expect(savePlannerDay.mock.calls.map((c) => c[1])).toEqual([2, 2, 2])
  })
})

describe('TimeMotionSection — a device draft typed against a different shift', () => {
  const DRAFT_KEY = draftKey('planner', 'tl1', '2026-10-08')
  const LATE = { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' }
  const earlyDraft = { blocks: [{ template_block_id: 'tpl-early-b2', status: 'completed', actual_minutes: 90, actual_category: 'operations', actual_activity: null, reason: null }], unplanned: [] }
  const seed = (values: unknown) => localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), values }))
  const OTHER_SHIFT = /The roster shift for this day changed since these entries were typed on this device/

  it.each([['Late', LATE], ['off', { kind: 'off' }]])('a never-saved day whose draft was typed for Early (roster now %s): shown read-only with Discard, never applied or sent', async (_n, shift) => {
    provider.resolvedShift = shift
    seed(earlyDraft)
    setup()
    expect(screen.getByText(OTHER_SHIFT)).toBeInTheDocument()
    expect(screen.getByText(/08:30–10:00 Queue monitoring & operational support: completed · 90 min · operations/)).toBeInTheDocument()
    expect(screen.queryByText(/Restored your unsent entry/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument() // nothing editable until the draft is dealt with
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(savePlannerDay).not.toHaveBeenCalled()
    expect(loadDraft(DRAFT_KEY)).toEqual(earlyDraft) // kept until the user discards it

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(loadDraft(DRAFT_KEY)).toBeNull()
    expect(screen.queryByText(OTHER_SHIFT)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save day' })).toBeInTheDocument() // the day is editable again, on the current shift
  })

  it('a draft for another shift that differs from a saved day is not offered as Use them: it is shown read-only with Discard', () => {
    provider.resolvedShift = LATE
    provider.plannerRevision = 2
    provider.plannerDays = { [KEY]: { logs: [], unplanned: [{ id: 'u1', tl_id: 'tl1', date: '2026-10-08', category: 'qa', minutes: 15, reason: 'Audit', displaced_block_id: null, created_at: '' }] } }
    seed(earlyDraft)
    setup()
    expect(screen.queryByRole('button', { name: 'Use them' })).not.toBeInTheDocument()
    expect(screen.getByText(OTHER_SHIFT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })

  it('a draft whose unplanned entry displaced a block of another shift is treated the same way', () => {
    provider.resolvedShift = LATE
    seed({ blocks: [], unplanned: [{ category: 'qa', minutes: 15, reason: 'Audit', displaced_block_id: 'tpl-early-b3' }] })
    setup()
    expect(screen.getByText(OTHER_SHIFT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
  })

  it('if the roster cannot be read, a draft with blocks is kept read-only — never applied, never deleted', () => {
    provider.resolvedShift = null
    provider.resolvedShiftError = 'Could not resolve this team leader’s shift.'
    seed(earlyDraft)
    setup()
    expect(screen.getByText(/The roster for this day could not be read/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(loadDraft(DRAFT_KEY)).toEqual(earlyDraft)
  })

  it('while the roster shift is still being read, no template\'s blocks are shown or editable (not even the previous date\'s)', () => {
    provider.resolvedShiftLoading = true // resolvedShift still holds the previous date's Early shift
    setup()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
    expect(screen.queryByText('Queue monitoring & operational support')).not.toBeInTheDocument()
  })

  it('after a roster change, an unplanned entry still shows the block it displaced from the old shift', () => {
    provider.plannerRosterMismatch = true
    provider.resolvedShift = LATE
    provider.plannerRevision = 1
    provider.plannerDays = { [KEY]: { logs: [], unplanned: [{ id: 'u1', tl_id: 'tl1', date: '2026-10-08', category: 'escalations', minutes: 15, reason: 'Escalation', displaced_block_id: 'tpl-early-b5', created_at: '' }] } }
    setup()
    expect(screen.getByText('Displaced: Escalations & follow-ups')).toBeInTheDocument()
  })
})

describe('TimeMotionSection — the editing window is checked again at the moment of sending', () => {
  const DRAFT_KEY = draftKey('planner', 'tl1', '2026-10-08')
  const CLOSED = /This day can no longer be saved\. Unsent entries from this device/
  afterEach(() => jest.useRealTimers())

  /** 11:55 SA on 9 Oct (8 Oct still open), the provider answering from the real clock; the first save fails. */
  async function failAt1155(first: unknown = { ok: false, conflict: false, error: 'x' }) {
    jest.useFakeTimers({ now: new Date('2026-10-09T09:55:00Z'), advanceTimers: true })
    provider.plannerWindowNow.mockImplementation((date: string) => plannerDayWindow(date, new Date()))
    savePlannerDay.mockResolvedValueOnce(first)
    setup()
    fireEvent.change(statusSelect('08:30–10:00'), { target: { value: 'completed' } })
    fireEvent.click(saveDay())
    await waitFor(() => expect(savePlannerDay).toHaveBeenCalledTimes(1))
  }
  const passNoon = () => jest.setSystemTime(new Date('2026-10-09T10:10:00Z')) // 12:10 SA: 8 Oct's window has closed

  it('the online resend after 12:00 the next day sends nothing; the day shows as unsendable and the draft is kept', async () => {
    await failAt1155()
    await screen.findByText(/Not saved yet/)
    passNoon()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(savePlannerDay).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(CLOSED)).toBeInTheDocument()
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })

  it('Retry after 12:00 the next day sends nothing', async () => {
    await failAt1155()
    passNoon()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(CLOSED)).toBeInTheDocument()
    expect(savePlannerDay).toHaveBeenCalledTimes(1)
  })

  it('Replace day after 12:00 the next day sends nothing and does not even ask for the latest revision', async () => {
    await failAt1155({ ok: false, conflict: true, error: M.conflict })
    fireEvent.click(await screen.findByRole('button', { name: /Replace the saved day with my version/ }))
    passNoon()
    fireEvent.click(screen.getByRole('button', { name: 'Replace day' }))
    expect(await screen.findByText(CLOSED)).toBeInTheDocument()
    expect(provider.peekPlannerRevision).not.toHaveBeenCalled()
    expect(savePlannerDay).toHaveBeenCalledTimes(1)
    expect(loadDraft(DRAFT_KEY)).not.toBeNull()
  })
})

describe('TimeMotionSection — the unplanned-entry cap', () => {
  it('refuses a 51st unplanned entry with the cap message', async () => {
    provider.plannerRevision = 1
    provider.plannerDays = { [KEY]: { logs: [], unplanned: Array.from({ length: 50 }, (_, i) => ({
      id: `u${i}`, tl_id: 'tl1', date: '2026-10-08', category: 'qa', minutes: 5, reason: `Entry ${i}`, displaced_block_id: null, created_at: '',
    })) } }
    setup()
    await userEvent.click(screen.getByRole('button', { name: /log unplanned work/i }))
    expect(screen.getByText(M.tooManyUnplanned)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add entry' })).not.toBeInTheDocument()
  })
})
