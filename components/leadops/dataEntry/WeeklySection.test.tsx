import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WeeklySection from './WeeklySection'
import { draftKey, loadDraft } from '@/lib/leadops/activityDrafts'

const upsertWeeklyLog = jest.fn().mockResolvedValue(true)
const upsertManagerLog = jest.fn().mockResolvedValue(true)
const provider = {
  dailyLogs: [] as unknown[],
  weeklyLogs: [] as unknown[],
  managerLogs: [] as unknown[],
  selectedWeekStart: '2026-10-05',
  setSelectedWeekStart: jest.fn(),
  weekStarts: ['2026-10-05'],
  upsertWeeklyLog,
  upsertManagerLog,
  people: { managerId: 'mgr-1', managerName: 'Alex', reviewerId: 'hod-1', reviewerName: 'Sam' } as unknown,
  peopleError: null as string | null,
}
jest.mock('../LeadOpsDataProvider', () => ({ useLeadOpsData: () => provider }))

const el = (id: string) => document.getElementById(id) as HTMLElement
const saveButtons = () => screen.getAllByRole('button', { name: 'Save' })
const MESSAGE = (label: string) => `${label} must be a whole number from 0 to 10,000.`

function setup(props: Partial<{ canEditTlFields: boolean; canEditManagerFields: boolean }> = {}) {
  render(<WeeklySection tlId="tl1" tlName="Tess" canEditTlFields canEditManagerFields={false} {...props} />)
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear() // device drafts live in localStorage — never leak between tests
  upsertWeeklyLog.mockReset().mockResolvedValue(true)
  upsertManagerLog.mockReset().mockResolvedValue(true)
  provider.weeklyLogs = []
  provider.managerLogs = []
  provider.people = { managerId: 'mgr-1', managerName: 'Alex', reviewerId: 'hod-1', reviewerName: 'Sam' }
})

describe('WeeklySection — team leader fields', () => {
  it.each(['-1', '1.5', '10001', '1e5'])('says what is wrong with re-audits "%s" instead of silently doing nothing', (bad) => {
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: bad } })
    fireEvent.click(saveButtons()[0])
    expect(el('weekly-reaudits')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(MESSAGE('Re-audits completed'))).toBeInTheDocument()
    expect(upsertWeeklyLog).not.toHaveBeenCalled()
  })

  it('clears the message once the value is edited', () => {
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: '-1' } })
    fireEvent.click(saveButtons()[0])
    fireEvent.change(el('weekly-reaudits'), { target: { value: '3' } })
    expect(screen.queryByText(MESSAGE('Re-audits completed'))).not.toBeInTheDocument()
  })

  it('saves a valid value and shows Saved only after the server confirms', async () => {
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: '4' } })
    fireEvent.click(saveButtons()[0])
    await waitFor(() => expect(upsertWeeklyLog).toHaveBeenCalledWith(expect.objectContaining({ tl_id: 'tl1', week_of: '2026-10-05', re_audits: 4 })))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('an empty re-audits field saves as 0', async () => {
    setup()
    fireEvent.click(saveButtons()[0])
    await waitFor(() => expect(upsertWeeklyLog).toHaveBeenCalledWith(expect.objectContaining({ re_audits: 0 })))
  })
})

describe('WeeklySection — manager weekly log', () => {
  const setupManager = () => setup({ canEditTlFields: false, canEditManagerFields: true })

  it.each([
    ['mgr-sampled', 'Interactions sampled'],
    ['mgr-onetoones', 'TL 1:1s held'],
  ])('says what is wrong with a bad %s instead of silently doing nothing', (id, label) => {
    setupManager()
    fireEvent.change(el(id), { target: { value: '1.5' } })
    fireEvent.click(saveButtons()[0])
    expect(el(id)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(MESSAGE(label))).toBeInTheDocument()
    expect(upsertManagerLog).not.toHaveBeenCalled()
  })

  it('saves valid counts against the configured manager', async () => {
    setupManager()
    fireEvent.change(el('mgr-sampled'), { target: { value: '12' } })
    fireEvent.change(el('mgr-onetoones'), { target: { value: '4' } })
    fireEvent.click(saveButtons()[0])
    await waitFor(() => expect(upsertManagerLog).toHaveBeenCalledWith(expect.objectContaining({ manager_id: 'mgr-1', interactions_sampled: 12, tl_one_on_ones: 4 })))
  })
})

describe('WeeklySection device drafts — team leader fields', () => {
  const KEY = draftKey('weekly', 'tl1', '2026-10-05')
  const seed = (values: unknown) => localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), values }))

  it('autosaves calibration and re-audits as a draft', () => {
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: '4' } })
    expect(loadDraft(KEY)).toEqual({ calibration: false, reAudits: '4' })
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(loadDraft(KEY)).toEqual({ calibration: true, reAudits: '4' })
  })

  it('restores an unsent draft when nothing is saved for the week', () => {
    seed({ calibration: true, reAudits: '6' })
    setup()
    expect((el('weekly-reaudits') as HTMLInputElement).value).toBe('6')
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
    expect(screen.getByText('Restored your unsent entry from this device — check it, then Save.')).toBeInTheDocument()
  })

  it('clears the draft only after the server confirms, and keeps it (with Retry) when the save fails', async () => {
    upsertWeeklyLog.mockResolvedValueOnce(false)
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: '4' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(await screen.findByText('Not saved yet — kept on this device. It is sent again when the connection returns.')).toBeInTheDocument()
    expect(loadDraft(KEY)).toEqual({ calibration: false, reAudits: '4' })

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(upsertWeeklyLog).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(loadDraft(KEY)).toBeNull())
  })

  it('sends the unsent entry again when the connection returns', async () => {
    upsertWeeklyLog.mockResolvedValueOnce(false)
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: '4' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    await screen.findByText(/Not saved yet/)
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(upsertWeeklyLog).toHaveBeenCalledTimes(2))
  })

  it('offers a draft that differs from the saved week as a choice and never applies it silently', () => {
    provider.weeklyLogs = [{ tl_id: 'tl1', week_of: '2026-10-05', calibration: false, re_audits: 2 }]
    seed({ calibration: true, reAudits: '9' })
    setup()
    expect((el('weekly-reaudits') as HTMLInputElement).value).toBe('2')
    expect(screen.getByText('Unsent changes from this device differ from what is saved.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use them' }))
    expect((el('weekly-reaudits') as HTMLInputElement).value).toBe('9')
  })

  it('a viewer who cannot edit never reads or writes the draft', () => {
    seed({ calibration: true, reAudits: '6' })
    setup({ canEditTlFields: false })
    expect(screen.queryByText(/Restored your unsent entry/)).not.toBeInTheDocument()
    expect(loadDraft(KEY)).not.toBeNull()
  })

  it('still works when localStorage is blocked', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: '4' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    await waitFor(() => expect(upsertWeeklyLog).toHaveBeenCalledWith(expect.objectContaining({ re_audits: 4 })))
    jest.restoreAllMocks()
  })
})

describe('WeeklySection device drafts — manager weekly log', () => {
  const KEY = draftKey('manager', 'mgr-1', '2026-10-05')
  const setupManager = () => setup({ canEditTlFields: false, canEditManagerFields: true })
  const seed = (values: unknown) => localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), values }))

  it('autosaves, restores, keeps on failure and clears on a confirmed save', async () => {
    seed({ sampled: '12', spotCheck: true, oneOnOnes: '4' })
    setupManager()
    expect((el('mgr-sampled') as HTMLInputElement).value).toBe('12')
    expect(screen.getByText('Restored your unsent entry from this device — check it, then Save.')).toBeInTheDocument()

    fireEvent.change(el('mgr-onetoones'), { target: { value: '5' } })
    expect(loadDraft(KEY)).toEqual({ sampled: '12', spotCheck: true, oneOnOnes: '5' })

    upsertManagerLog.mockResolvedValueOnce(false)
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(await screen.findByText(/Not saved yet/)).toBeInTheDocument()
    expect(loadDraft(KEY)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(loadDraft(KEY)).toBeNull())
  })

  it('has no draft when the manager is not configured (nothing to key it to)', () => {
    provider.people = null
    setupManager()
    expect(screen.getByText('Manager not configured')).toBeInTheDocument()
    expect(screen.queryByText(/Restored your unsent entry/)).not.toBeInTheDocument()
  })
})

describe('WeeklySection: edits cannot clobber a draft (review fixes)', () => {
  const KEY = draftKey('weekly', 'tl1', '2026-10-05')

  it('locks the re-audits field while a save is in flight', async () => {
    let finish: (ok: boolean) => void = () => {}
    upsertWeeklyLog.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
    setup()
    fireEvent.change(el('weekly-reaudits'), { target: { value: '4' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    expect(el('weekly-reaudits')).toBeDisabled()
    await act(async () => { finish(true) })
    expect(el('weekly-reaudits')).not.toBeDisabled()
  })

  it('locks the fields while the Use them / Discard offer is open, and Use them stores what it applies', () => {
    provider.weeklyLogs = [{ tl_id: 'tl1', week_of: '2026-10-05', calibration: false, re_audits: 2 }]
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), values: { calibration: true, reAudits: '9' } }))
    setup()
    expect(el('weekly-reaudits')).toBeDisabled()
    expect(loadDraft(KEY)).toEqual({ calibration: true, reAudits: '9' })
    fireEvent.click(screen.getByRole('button', { name: 'Use them' }))
    expect(el('weekly-reaudits')).not.toBeDisabled()
    expect(loadDraft(KEY)).toEqual({ calibration: true, reAudits: '9' })
  })
})
