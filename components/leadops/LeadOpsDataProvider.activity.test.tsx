import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeadOpsDataProvider, useLeadOpsData } from './LeadOpsDataProvider'
import type { LeadOpsViewerContext } from '@/lib/leadops/permissions'
import type { DailyActivityLog } from '@/lib/leadops/types'

jest.mock('@/lib/leadops/realDataActions', () => ({
  fetchLeadOpsRealDataAction: jest.fn(),
  upsertEfficiencyScoreAction: jest.fn(),
  upsertManagerKpaRatingAction: jest.fn(),
  upsertManagerMonthlyReviewAction: jest.fn(),
  upsertTlTeamSizeAction: jest.fn(),
}))
jest.mock('@/lib/leadops/activityActions', () => ({
  fetchLeadOpsActivityAction: jest.fn(),
  upsertDailyLogAction: jest.fn(),
  upsertWeeklyLogAction: jest.fn(),
  upsertManagerWeeklyLogAction: jest.fn(),
}))
jest.mock('@/lib/leadops/rosterShiftAction', () => ({ resolveTeamLeaderShiftAction: jest.fn().mockResolvedValue({ error: 'not resolved in tests' }) }))
jest.mock('@/lib/leadops/plannerActions', () => ({
  fetchLeadOpsPlannerAction: jest.fn().mockResolvedValue({ data: { revision: 0, logs: [], unplanned: [], rosterMismatch: false } }),
  savePlannerDayAction: jest.fn(),
}))

import { fetchLeadOpsRealDataAction } from '@/lib/leadops/realDataActions'
import { fetchLeadOpsActivityAction, upsertDailyLogAction } from '@/lib/leadops/activityActions'

const fetchRealMock = fetchLeadOpsRealDataAction as jest.Mock
const fetchActivityMock = fetchLeadOpsActivityAction as jest.Mock
const saveDailyMock = upsertDailyLogAction as jest.Mock

const TODAY = '2026-10-08'
const tlViewer: LeadOpsViewerContext = { role: 'admin', hasTeamRow: true, profileId: 'tl-1' }

const LOG: DailyActivityLog = {
  id: 'client', tl_id: 'tl-1', date: TODAY, calls_listened: 5, tickets_reviewed: 0, audits_completed: 0,
  critical_fails: 0, coaching_sessions: 1, agent_in_seat: true, notes: null, created_at: '', updated_at: '',
}

function Probe() {
  const d = useLeadOpsData()
  return (
    <div>
      <span data-testid="loading">{String(d.activityLoading)}</span>
      <span data-testid="activity-error">{d.activityError ?? ''}</span>
      <span data-testid="daily-count">{d.dailyLogs.length}</span>
      <span data-testid="date">{d.selectedDate}</span>
      <span data-testid="today">{d.todayDate}</span>
      <span data-testid="week">{d.selectedWeekStart}</span>
      <span data-testid="weeks">{d.weekStarts.join(',')}</span>
      <span data-testid="persist-error">{d.persistError ?? ''}</span>
      <span data-testid="real-loading">{String(d.realDataLoading)}</span>
      <span data-testid="real-error">{d.realDataError ?? ''}</span>
      <button onClick={() => d.upsertDailyLog(LOG)}>save daily</button>
    </div>
  )
}

const renderProvider = () => render(<LeadOpsDataProvider viewer={tlViewer} scope="prod" today={TODAY}><Probe /></LeadOpsDataProvider>)
const text = (id: string) => screen.getByTestId(id).textContent

beforeEach(() => {
  fetchRealMock.mockReset()
  fetchActivityMock.mockReset()
  saveDailyMock.mockReset()
  fetchRealMock.mockResolvedValue({ data: { scores: [], managerKpaRatings: [], managerReviews: [], tlTeamSizes: [], teamLeaders: [], people: null, peopleError: null } })
  fetchActivityMock.mockResolvedValue({ data: { dailyLogs: [], weeklyLogs: [], managerLogs: [] } })
})

describe('activity slice of the provider', () => {
  it('defaults to today (South African date) and this week\'s Monday, with twelve Mondays to pick from', async () => {
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('date')).toBe('2026-10-08')
    expect(text('week')).toBe('2026-10-05')
    expect(text('weeks')!.split(',')).toHaveLength(12)
    expect(text('weeks')!.split(',')[0]).toBe('2026-10-05')
  })

  it('loads the last twelve weeks, starting from the oldest Monday, up to today', async () => {
    renderProvider()
    await waitFor(() => expect(fetchActivityMock).toHaveBeenCalledWith('2026-07-20', '2026-10-08'))
  })

  it('shows loaded rows', async () => {
    fetchActivityMock.mockResolvedValue({ data: { dailyLogs: [{ ...LOG, id: 'd1' }], weeklyLogs: [], managerLogs: [] } })
    renderProvider()
    await waitFor(() => expect(text('daily-count')).toBe('1'))
  })

  it('an activity load failure is reported on its own and does not affect the KPI/scorecard data', async () => {
    fetchActivityMock.mockResolvedValue({ error: 'Could not load activity data.' })
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('activity-error')).toBe('Could not load activity data.')
    expect(text('real-loading')).toBe('false')
    expect(text('real-error')).toBe('')
  })

  it('a saved daily entry is replaced by the server\'s row and raises no error', async () => {
    saveDailyMock.mockImplementation(async (log: DailyActivityLog) => ({ data: { ...log, id: 'stored-1' } }))
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'save daily' }))
    await waitFor(() => expect(saveDailyMock).toHaveBeenCalledWith(expect.objectContaining({ tl_id: 'tl-1', date: TODAY })))
    expect(text('daily-count')).toBe('1')
    expect(text('persist-error')).toBe('')
    expect(fetchActivityMock).toHaveBeenCalledTimes(1)
  })

  it('a rejected save shows the reason and reloads the activity window so the screen matches the database', async () => {
    saveDailyMock.mockResolvedValue({ error: 'Daily entries can only be changed on the day.' })
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'save daily' }))
    await waitFor(() => expect(text('persist-error')).toBe('Your change was not saved: Daily entries can only be changed on the day.'))
    await waitFor(() => expect(fetchActivityMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(text('daily-count')).toBe('0'))
  })
})

describe('activity slice: failures that throw, and a clock that moves past midnight', () => {
  afterEach(() => jest.useRealTimers())

  it('a save that throws (server unreachable, deploy skew) shows an error and reloads instead of failing silently', async () => {
    saveDailyMock.mockRejectedValue(new Error('Failed to fetch'))
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'save daily' }))
    await waitFor(() => expect(text('persist-error')).toBe('Your change was not saved: the server could not be reached — reload the page and try again.'))
    await waitFor(() => expect(fetchActivityMock).toHaveBeenCalledTimes(2))
  })

  it('a first load that throws is an error state, not an empty editable form', async () => {
    fetchActivityMock.mockRejectedValue(new Error('Failed to fetch'))
    renderProvider()
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('activity-error')).toBe('Could not load activity data.')
  })

  it('a save refused after midnight moves "today" forward, selects it, and reloads the window up to it', async () => {
    saveDailyMock.mockResolvedValue({ error: 'Daily entries can only be changed on the day.' })
    renderProvider() // the page was rendered on 8 Oct
    await waitFor(() => expect(text('loading')).toBe('false'))
    expect(text('today')).toBe('2026-10-08')

    jest.useFakeTimers({ now: new Date('2026-10-08T22:30:00Z') }) // 00:30 on 9 Oct in South Africa
    fireEvent.click(screen.getByRole('button', { name: 'save daily' }))
    await waitFor(() => expect(text('today')).toBe('2026-10-09'))
    expect(text('date')).toBe('2026-10-09')
    await waitFor(() => expect(fetchActivityMock).toHaveBeenLastCalledWith('2026-07-20', '2026-10-09'))
  })

  it('the save mutator resolves true on success and false on a refusal or a throw', async () => {
    let result: boolean | undefined
    function Capture() {
      const d = useLeadOpsData()
      return <button onClick={async () => { result = await d.upsertDailyLog(LOG) }}>go</button>
    }
    const mount = () => render(<LeadOpsDataProvider viewer={tlViewer} scope="prod" today={TODAY}><Capture /></LeadOpsDataProvider>)

    saveDailyMock.mockImplementation(async (log: DailyActivityLog) => ({ data: log }))
    const first = mount()
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    await waitFor(() => expect(result).toBe(true))
    first.unmount()

    result = undefined
    saveDailyMock.mockResolvedValue({ error: 'nope' })
    const second = mount()
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    await waitFor(() => expect(result).toBe(false))
    second.unmount()

    result = undefined
    saveDailyMock.mockRejectedValue(new Error('down'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    await waitFor(() => expect(result).toBe(false))
  })
})
