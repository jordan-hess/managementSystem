import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import LeadOpsWorkspace from './LeadOpsWorkspace'
import type { LeadOpsViewerContext } from '@/lib/leadops/permissions'
import type { LeadOpsRealData } from '@/lib/leadops/realDataActions'

jest.mock('@/lib/leadops/realDataActions', () => ({
  fetchLeadOpsRealDataAction: jest.fn(),
  upsertEfficiencyScoreAction: jest.fn(),
  upsertManagerKpaRatingAction: jest.fn(),
  upsertManagerMonthlyReviewAction: jest.fn(),
  upsertTlTeamSizeAction: jest.fn(),
}))
jest.mock('@/lib/leadops/rosterShiftAction', () => ({
  resolveTeamLeaderShiftAction: jest.fn().mockResolvedValue({ error: 'not resolved in tests' }),
}))
jest.mock('@/lib/leadops/plannerActions', () => ({
  fetchLeadOpsPlannerAction: jest.fn().mockResolvedValue({ data: { revision: 0, logs: [], unplanned: [], rosterMismatch: false } }),
  savePlannerDayAction: jest.fn(),
}))
jest.mock('@/lib/leadops/activityActions', () => ({
  fetchLeadOpsActivityAction: jest.fn().mockResolvedValue({ data: { dailyLogs: [], weeklyLogs: [], managerLogs: [] } }),
  upsertDailyLogAction: jest.fn(),
  upsertWeeklyLogAction: jest.fn(),
  upsertManagerWeeklyLogAction: jest.fn(),
}))
jest.mock('@/lib/leadops/reviewActions', () => ({
  fetchLeadOpsReviewAction: jest.fn().mockResolvedValue({ data: { kind: 'team_leader', state: 'none', reviewId: null, shared: null } }),
  fetchReviewRosterAction: jest.fn().mockResolvedValue({ data: [] }),
  saveReviewDraftAction: jest.fn(),
  shareReviewAction: jest.fn(),
  acknowledgeReviewAction: jest.fn(),
  markReviewViewedAction: jest.fn(),
  reopenReviewAction: jest.fn(),
}))

import {
  fetchLeadOpsRealDataAction, upsertEfficiencyScoreAction, upsertManagerMonthlyReviewAction,
} from '@/lib/leadops/realDataActions'
import { resolveTeamLeaderShiftAction } from '@/lib/leadops/rosterShiftAction'
import { fetchLeadOpsPlannerAction, savePlannerDayAction } from '@/lib/leadops/plannerActions'
import { fetchLeadOpsActivityAction, upsertDailyLogAction, upsertManagerWeeklyLogAction } from '@/lib/leadops/activityActions'
import { fetchLeadOpsReviewAction } from '@/lib/leadops/reviewActions'
import { EFFICIENCY_METRIC_DEFS } from '@/lib/leadops/constants'

const fetchMock = fetchLeadOpsRealDataAction as jest.Mock
const saveScoreMock = upsertEfficiencyScoreAction as jest.Mock
const saveReviewMock = upsertManagerMonthlyReviewAction as jest.Mock
const resolveShiftMock = resolveTeamLeaderShiftAction as jest.Mock
const fetchPlannerMock = fetchLeadOpsPlannerAction as jest.Mock
const savePlannerMock = savePlannerDayAction as jest.Mock

const TODAY = '2026-10-08'
const managementViewer: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: 'mgmt-1' }
const hodViewer: LeadOpsViewerContext = { role: 'hod', hasTeamRow: false, profileId: 'hod-1' }
const tlViewer: LeadOpsViewerContext = { role: 'admin', hasTeamRow: true, profileId: 'tl-1' }

const teamLeaders = [
  { id: 'tl-1', full_name: 'TL One', team: 'Social' },
  { id: 'tl-2', full_name: 'TL Two', team: 'T2' },
]
const people = { managerId: 'mgr-1', managerName: 'Alex Morgan', reviewerId: 'hod-1', reviewerName: 'Sam Rivera' }

function respondWith(over: Partial<LeadOpsRealData> = {}) {
  fetchMock.mockResolvedValue({
    data: {
      scores: [], managerKpaRatings: [], managerReviews: [], tlTeamSizes: [],
      teamLeaders, people, peopleError: null, ...over,
    },
  })
}

const tabButton = (name: string) => screen.queryByRole('button', { name })
// 'Weekly Activity Log' and the 'Time & Motion Planner' are real now, so they are not in this list.
const MOCK_TAB_NAMES = ['TL Efficiency Scorecard']
// A team leader opens on Daily & Weekly Activity; KPI Actuals is one click away.
const openKpiActuals = async () => fireEvent.click(await screen.findByRole('button', { name: 'KPI Actuals' }))

beforeEach(() => {
  localStorage.clear() // device drafts are kept in localStorage — never leak between tests
  fetchMock.mockReset()
  resolveShiftMock.mockClear()
  fetchPlannerMock.mockReset()
  savePlannerMock.mockReset()
  fetchPlannerMock.mockResolvedValue({ data: { revision: 0, logs: [], unplanned: [], rosterMismatch: false } })
  resolveShiftMock.mockResolvedValue({ data: { kind: 'early', startTime: '08:00:00', endTime: '17:00:00' } })
  respondWith()
})

describe('LeadOps workspace in the PROD scope (real-data tabs only)', () => {
  it('management sees only Manager Scorecard and Data Entry, with the Manager Scorecard first', async () => {
    render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
    expect(tabButton('Manager Scorecard')).toBeInTheDocument()
    expect(tabButton('Data Entry')).toBeInTheDocument()
    for (const name of MOCK_TAB_NAMES) expect(tabButton(name)).not.toBeInTheDocument()
  })

  it('an HOD sees the Manager Scorecard, the Time & Motion Planner, the Weekly Activity Log and Data Entry — and none of the mock tabs', async () => {
    render(<LeadOpsWorkspace viewer={hodViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
    expect(tabButton('Time & Motion Planner')).toBeInTheDocument()
    expect(tabButton('Weekly Activity Log')).toBeInTheDocument()
    for (const name of MOCK_TAB_NAMES) expect(tabButton(name)).not.toBeInTheDocument()
  })

  it('a team leader sees only Data Entry, on their own record, with Daily & Weekly Activity and Time & Motion', async () => {
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await openKpiActuals()
    expect(await screen.findByText(/KPI actuals — TL One/)).toBeInTheDocument()
    expect(tabButton('Manager Scorecard')).not.toBeInTheDocument()
    expect(tabButton('Daily & Weekly Activity')).toBeInTheDocument()
    expect(tabButton('Time & Motion')).toBeInTheDocument()
  })

  it('resolves the roster shift (Time & Motion needs it) but still shows the planner-derived KPIs as not tracked yet', async () => {
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await openKpiActuals()
    await screen.findByText(/KPI actuals — TL One/)
    expect(resolveShiftMock).toHaveBeenCalledWith('tl-1', TODAY)
    expect(screen.getAllByText('Not tracked yet')).toHaveLength(2)
  })

  it('offers the last twelve months, ending at the current one, for both KPI Actuals and the Manager Scorecard', async () => {
    render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} />)
    await screen.findByRole('heading', { name: 'Alex Morgan' })
    const scorecardMonth = screen.getByLabelText('Month') as HTMLSelectElement
    expect(scorecardMonth.value).toBe('2026-10-01')
    expect(Array.from(scorecardMonth.options).map((o) => o.value)).toHaveLength(12)

    fireEvent.click(tabButton('Data Entry')!)
    const entryMonth = (await screen.findByLabelText('Month')) as HTMLSelectElement
    expect(entryMonth.value).toBe('2026-10-01')
  })

  it('renders against a completely empty database without crashing', async () => {
    render(<LeadOpsWorkspace viewer={hodViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
    expect(screen.queryByText(/Couldn.t load the scorecard/)).not.toBeInTheDocument()
  })

  it('shows the configuration problem on the Manager Scorecard when the manager account cannot be found, but keeps Data Entry working', async () => {
    respondWith({ people: null, peopleError: 'leadOps manager or reviewer account was not found.' })
    render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByText('leadOps manager or reviewer account was not found.')).toBeInTheDocument()
    fireEvent.click(tabButton('Data Entry')!)
    expect(await screen.findByText(/KPI actuals —/)).toBeInTheDocument()
  })

  it('offers the performance reviews tab by role — and nothing to a plain admin', async () => {
    const adminViewer: LeadOpsViewerContext = { role: 'admin', hasTeamRow: false, profileId: 'adm-1' }
    const first = render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByRole('button', { name: 'TL Performance Review' })).toBeInTheDocument()
    first.unmount()
    const second = render(<LeadOpsWorkspace viewer={hodViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByRole('button', { name: 'Performance Reviews' })).toBeInTheDocument()
    second.unmount()
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
    const third = render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByRole('button', { name: 'My Performance Review' })).toBeInTheDocument()
    third.unmount()
    render(<LeadOpsWorkspace viewer={adminViewer} scope="prod" today={TODAY} />)
    await screen.findByRole('button', { name: 'Data Entry' })
    expect(screen.queryByRole('button', { name: /Performance Review/ })).not.toBeInTheDocument()
  })

  it('a team leader who opens My Performance Review loads their own review', async () => {
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'My Performance Review' }))
    expect(await screen.findByText(/No review shared for/)).toBeInTheDocument()
    expect(fetchLeadOpsReviewAction).toHaveBeenCalledWith('tl-1', expect.stringMatching(/^2026-\d\d-01$/))
  })
})

describe('save failures are shown, and the screen goes back to what is really stored', () => {
  const MANUAL_KPI = EFFICIENCY_METRIC_DEFS.find((d) => d.inputMode === 'manual')!
  const actualInput = () => screen.getByLabelText(`Actual for ${MANUAL_KPI.kpi}`) as HTMLInputElement
  const enterActual = (value: string) => fireEvent.change(actualInput(), { target: { value } })

  beforeEach(() => {
    saveScoreMock.mockReset()
    saveReviewMock.mockReset()
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
  })

  it('a rejected KPI save shows an error banner and the typed value is dropped', async () => {
    saveScoreMock.mockResolvedValue({ error: 'Forbidden' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await openKpiActuals()
    await screen.findByText(/KPI actuals — TL One/)

    enterActual('55')
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Your change was not saved: you do not have permission to make this change.')
    // the screen was reloaded from the server (which has no stored value)
    await waitFor(() => expect(actualInput().value).toBe(''))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a successful save shows no error and keeps the value', async () => {
    saveScoreMock.mockImplementation(async (s) => ({ data: { ...s, id: 'stored-1', updated_at: 'now' } }))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await openKpiActuals()
    await screen.findByText(/KPI actuals — TL One/)

    enterActual('55')
    await waitFor(() => expect(saveScoreMock).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(actualInput().value).toBe('55')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('the banner can be dismissed', async () => {
    saveScoreMock.mockResolvedValue({ error: 'Could not save this KPI actual.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await openKpiActuals()
    await screen.findByText(/KPI actuals — TL One/)
    enterActual('55')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this KPI actual.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a rejected review status change (e.g. a locked month) shows the reason and the status goes back', async () => {
    respondWith({}) // people present: this viewer IS the configured manager
    saveReviewMock.mockResolvedValue({ error: 'This month is locked.' })
    const managerViewer: LeadOpsViewerContext = { role: 'management', hasTeamRow: false, profileId: 'mgr-1' }
    render(<LeadOpsWorkspace viewer={managerViewer} scope="prod" today={TODAY} />)
    await screen.findByRole('heading', { name: 'Alex Morgan' })
    expect(screen.getByText('Status: Draft')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Submit self-assessment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your change was not saved: This month is locked.')
    await waitFor(() => expect(screen.getByText('Status: Draft')).toBeInTheDocument())
  })

  it('a failed load is shown to a team leader instead of an empty screen', async () => {
    fetchMock.mockResolvedValue({ error: 'Could not load leadOps data from the database.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByText('Could not load leadOps data from the database.')).toBeInTheDocument()
  })
})

const fetchActivityMock = fetchLeadOpsActivityAction as jest.Mock
const saveDailyMock = upsertDailyLogAction as jest.Mock
const saveManagerWeeklyMock = upsertManagerWeeklyLogAction as jest.Mock

describe('Daily & Weekly Activity (PROD scope)', () => {
  const today = '2026-10-08'
  const dailyRow = {
    id: 'd1', tl_id: 'tl-1', date: '2026-10-01', calls_listened: 7, tickets_reviewed: 0, audits_completed: 0,
    critical_fails: 0, coaching_sessions: 2, agent_in_seat: true, notes: null, created_at: '', updated_at: '',
  }
  const activity = (over = {}) => ({ data: { dailyLogs: [], weeklyLogs: [], managerLogs: [], ...over } })

  beforeEach(() => {
    saveDailyMock.mockReset()
    saveManagerWeeklyMock.mockReset()
    fetchActivityMock.mockReset()
    fetchActivityMock.mockResolvedValue(activity())
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
  })

  it('a team leader lands on Daily & Weekly Activity with today\'s entry editable', async () => {
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByText(/Daily activity — TL One/)).toBeInTheDocument()
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(today)
    expect(document.getElementById('daily-calls_listened')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /save entry/i })).toBeInTheDocument()
  })

  it('saves today\'s entry', async () => {
    saveDailyMock.mockImplementation(async (log) => ({ data: { ...log, id: 'stored' } }))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.change(document.getElementById('daily-calls_listened')!, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    await waitFor(() => expect(saveDailyMock).toHaveBeenCalledWith(expect.objectContaining({ tl_id: 'tl-1', date: today, calls_listened: 5 })))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('picking an earlier day shows it read-only with the reason', async () => {
    fetchActivityMock.mockResolvedValue(activity({ dailyLogs: [dailyRow] }))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-01' } })
    expect((document.getElementById('daily-calls_listened') as HTMLInputElement).value).toBe('7')
    expect(document.getElementById('daily-calls_listened')).toBeDisabled()
    expect(screen.getByText(/Locked — a day's entry can only be changed on that day\./)).toBeInTheDocument()
    // the daily Save is gone (the weekly card below keeps its own Save: weekly records stay editable)
    expect(screen.queryByRole('button', { name: /save entry|save changes/i })).not.toBeInTheDocument()
  })

  it('a save refused because the day has passed (stale tab) shows the reason and reloads', async () => {
    saveDailyMock.mockResolvedValue({ error: 'Daily entries can only be changed on the day.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your change was not saved: Daily entries can only be changed on the day.')
    await waitFor(() => expect(fetchActivityMock).toHaveBeenCalledTimes(2))
  })

  it('an activity load failure is shown inside the Daily section while KPI Actuals still works', async () => {
    fetchActivityMock.mockResolvedValue({ error: 'Could not load activity data.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByText('Could not load activity data.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'KPI Actuals' }))
    expect(await screen.findByText(/KPI actuals — TL One/)).toBeInTheDocument()
  })

  it('management sees the manager weekly card, and saves it against the real manager', async () => {
    saveManagerWeeklyMock.mockImplementation(async (log) => ({ data: log }))
    respondWith({ teamLeaders: [teamLeaders[0]] }) // the configured manager (people) is present
    render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} />)
    await screen.findByRole('heading', { name: 'Alex Morgan' })
    fireEvent.click(tabButton('Data Entry')!)
    fireEvent.click(await screen.findByRole('button', { name: 'Daily & Weekly Activity' }))
    fireEvent.change(await screen.findByLabelText('Interactions sampled'), { target: { value: '3' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).pop()!)
    await waitFor(() => expect(saveManagerWeeklyMock).toHaveBeenCalledWith(expect.objectContaining({ manager_id: 'mgr-1', interactions_sampled: 3 })))
  })

  it('shows why the manager weekly card is unavailable when the manager account is not configured', async () => {
    respondWith({ people: null, peopleError: 'leadOps manager or reviewer account was not found.' })
    render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} />)
    await screen.findByText('leadOps manager or reviewer account was not found.')
    fireEvent.click(tabButton('Data Entry')!)
    fireEvent.click(await screen.findByRole('button', { name: 'Daily & Weekly Activity' }))
    expect(await screen.findAllByText(/leadOps manager or reviewer account was not found\./)).not.toHaveLength(0)
    expect(await screen.findByText('Manager not configured')).toBeInTheDocument() // labelled as missing, not just absent
    expect(screen.queryByLabelText('Interactions sampled')).not.toBeInTheDocument()
  })

  it('the HOD Weekly Activity Log labels a missing manager configuration instead of saying "Not submitted"', async () => {
    respondWith({ teamLeaders, people: null, peopleError: 'leadOps manager or reviewer account was not found.' })
    render(<LeadOpsWorkspace viewer={hodViewer} scope="prod" today={TODAY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Weekly Activity Log' }))
    expect(await screen.findByText('Manager not configured')).toBeInTheDocument()
    expect(screen.getAllByText(/leadOps manager or reviewer account was not found\./).length).toBeGreaterThan(0)
    // only the two team-leader rows say "Not submitted" — the manager card must not
    expect(screen.getAllByText('Not submitted for this week.')).toHaveLength(2)
  })

  it('the HOD Weekly Activity Log lists each team leader, rolling the week up from the daily entries', async () => {
    const monday = '2026-10-05'
    fetchActivityMock.mockResolvedValue(activity({
      dailyLogs: [
        { ...dailyRow, id: 'a', date: '2026-10-05', coaching_sessions: 2, agent_in_seat: true },
        { ...dailyRow, id: 'b', date: '2026-10-06', coaching_sessions: 1, agent_in_seat: true },
      ],
      weeklyLogs: [{ tl_id: 'tl-1', week_of: monday, calibration: true, re_audits: 4 }],
    }))
    respondWith({ teamLeaders, people })
    render(<LeadOpsWorkspace viewer={hodViewer} scope="prod" today={TODAY} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Weekly Activity Log' }))
    const row = (await screen.findByText('TL One')).closest('tr')!
    expect(row).toHaveTextContent('Yes')
    expect(row).toHaveTextContent('3') // coaching sessions 2 + 1
    expect(row).toHaveTextContent('4') // re-audits
    expect(screen.getByText('TL Two').closest('tr')).toHaveTextContent('Not submitted for this week.')
  })
})

describe('Daily & Weekly Activity: refusals, failures and a tab left open past midnight (PROD scope)', () => {
  const empty = { data: { dailyLogs: [], weeklyLogs: [], managerLogs: [] } }

  beforeEach(() => {
    saveDailyMock.mockReset()
    saveManagerWeeklyMock.mockReset()
    fetchActivityMock.mockReset()
    fetchActivityMock.mockResolvedValue(empty)
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
  })
  afterEach(() => jest.useRealTimers())

  it('a refused save shows the error and no "Saved" tick', async () => {
    saveDailyMock.mockResolvedValue({ error: 'Daily entries can only be changed on the day.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('a successful save shows the "Saved" tick', async () => {
    saveDailyMock.mockImplementation(async (log) => ({ data: { ...log, id: 'stored' } }))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('a tab left open past midnight moves to the new day after a refused save: today is selectable and editable', async () => {
    saveDailyMock.mockResolvedValue({ error: 'Daily entries can only be changed on the day.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />) // rendered on 8 Oct
    await screen.findByText(/Daily activity — TL One/)

    jest.useFakeTimers({ now: new Date('2026-10-08T22:30:00Z') }) // now 00:30 on 9 Oct in South Africa
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))

    await waitFor(() => expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-09'))
    expect((screen.getByLabelText('Date') as HTMLInputElement).max).toBe('2026-10-09')
    expect(document.getElementById('daily-calls_listened')).not.toBeDisabled()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('a save that throws (server unreachable) is reported, not silent', async () => {
    saveDailyMock.mockRejectedValue(new Error('Failed to fetch'))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('the server could not be reached')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('a first activity load that throws shows an error, never an empty editable form that could overwrite the day', async () => {
    fetchActivityMock.mockRejectedValue(new Error('Failed to fetch'))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    expect(await screen.findByText('Could not load activity data.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save entry/i })).not.toBeInTheDocument()
  })

  it('the manager weekly card shows "Saved" only after the server saves it', async () => {
    respondWith({ teamLeaders: [teamLeaders[0]] })
    saveManagerWeeklyMock.mockResolvedValueOnce({ error: 'nope' })
    render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} />)
    await screen.findByRole('heading', { name: 'Alex Morgan' })
    fireEvent.click(tabButton('Data Entry')!)
    fireEvent.click(await screen.findByRole('button', { name: 'Daily & Weekly Activity' }))
    fireEvent.change(await screen.findByLabelText('Interactions sampled'), { target: { value: '3' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).pop()!)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    saveManagerWeeklyMock.mockImplementation(async (log) => ({ data: log }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).pop()!)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})

describe('LeadOps workspace in the full (SIT) scope', () => {
  it('still offers every tab to an HOD, with the Manager Scorecard coming from the configured manager', async () => {
    render(<LeadOpsWorkspace viewer={hodViewer} scope="full" today={TODAY} />)
    expect(await screen.findByRole('button', { name: 'Manager Scorecard' })).toBeInTheDocument()
    for (const name of ['Time & Motion Planner', 'Weekly Activity Log', 'TL Efficiency Scorecard', 'Performance Reviews', 'Data Entry']) {
      expect(tabButton(name)).toBeInTheDocument()
    }
    // the roster-shift lookup starts once the real team leader list has loaded and one is selected
    await waitFor(() => expect(resolveShiftMock).toHaveBeenCalledWith('tl-1', expect.any(String)))
  })
})

describe('Device drafts through the real provider and screens (PROD scope)', () => {
  const empty = { data: { dailyLogs: [], weeklyLogs: [], managerLogs: [] } }
  const callsField = () => document.getElementById('daily-calls_listened') as HTMLInputElement

  beforeEach(() => {
    saveDailyMock.mockReset()
    fetchActivityMock.mockReset()
    fetchActivityMock.mockResolvedValue(empty)
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
  })
  afterEach(() => jest.useRealTimers())

  it('what was typed survives a failed save and a full reload of the page', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T10:00:00Z'), advanceTimers: true }) // the real clock is past TODAY: keep this on the same South African day
    saveDailyMock.mockRejectedValue(new Error('Failed to fetch'))
    const first = render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.change(callsField(), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    // the provider shows the error and reloads stored data (remounting the form); the typed figures come back from the draft
    expect(await screen.findByRole('alert')).toHaveTextContent('the server could not be reached')
    await waitFor(() => expect(callsField().value).toBe('8'))
    first.unmount() // the page is closed / reloaded

    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    expect(callsField().value).toBe('8')
    expect(screen.getByText('Restored your unsent entry from this device — check it, then Save.')).toBeInTheDocument()
  })

  it('after midnight the unsent figures are not lost, not sent late, and can be viewed and discarded', async () => {
    saveDailyMock.mockResolvedValue({ error: 'Daily entries can only be changed on the day.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />) // rendered on 8 Oct
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.change(callsField(), { target: { value: '8' } })

    jest.useFakeTimers({ now: new Date('2026-10-08T22:30:00Z') }) // 00:30 on 9 Oct
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))

    // the screen moves to the new day and points at the figures still on the device
    expect(await screen.findByText('Unsent figures from 2026-10-08 are still on this device.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View 2026-10-08' }))
    expect(await screen.findByText(/This day has passed and can no longer be saved\. Unsent figures from this device/)).toBeInTheDocument()
    expect(screen.getByText(/Calls listened 8/)).toBeInTheDocument()
    expect(callsField()).toBeDisabled()
    expect(saveDailyMock).toHaveBeenCalledTimes(1) // only the original, refused save — never resent

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText(/This day has passed and can no longer be saved\./)).not.toBeInTheDocument()
  })

  it('a confirmed save leaves nothing behind to restore', async () => {
    saveDailyMock.mockImplementation(async (log) => ({ data: { ...log, id: 'stored' } }))
    const first = render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    fireEvent.change(callsField(), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /save entry/i }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    first.unmount()

    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} />)
    await screen.findByText(/Daily activity — TL One/)
    expect(screen.queryByText(/Restored your unsent entry/)).not.toBeInTheDocument()
  })
})

describe('Time & Motion in the PROD scope', () => {
  const NOW = '2026-10-08T10:00:00Z' // 12:00 in South Africa, on TODAY
  const openTimeMotion = async () => fireEvent.click(await screen.findByRole('button', { name: 'Time & Motion' }))
  const storedLog = (over = {}) => ({
    id: 'l1', tl_id: 'tl-1', date: TODAY, template_block_id: 'tpl-early-b2', status: 'completed', actual_minutes: 90,
    actual_category: 'operations', actual_activity: null, reason: null, updated_at: '', ...over,
  })

  beforeEach(() => {
    // jsdom has no matchMedia; DaySummary's bar animation asks for prefers-reduced-motion (as TimeMotionSection.test does).
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    respondWith({ teamLeaders: [teamLeaders[0]], people: null })
  })

  // A send re-checks the editing window against the REAL clock at that moment (not only nowIso), so a test that saves
  // pins the real clock to NOW as well — the machine's date is past TODAY.
  const pinClockToNow = () => jest.useFakeTimers({ now: new Date(NOW), advanceTimers: true })
  afterEach(() => jest.useRealTimers())

  it('a team leader marks a block and saves the day through the real provider, sending revision 0 then the stored revision', async () => {
    pinClockToNow()
    savePlannerMock.mockResolvedValue({ data: { revision: 1 } })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    await openTimeMotion()
    fireEvent.change(await screen.findByLabelText('Set status for the 08:30–10:00 block'), { target: { value: 'completed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save day' }))
    await waitFor(() => expect(savePlannerMock).toHaveBeenCalledWith(expect.objectContaining({
      tlId: 'tl-1', date: TODAY, expectedRevision: 0,
      blocks: [expect.objectContaining({ template_block_id: 'tpl-early-b2', status: 'completed', actual_minutes: 90 })],
    })))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows the stored day, read from the server', async () => {
    fetchPlannerMock.mockResolvedValue({ data: { revision: 3, rosterMismatch: false, unplanned: [], logs: [storedLog()] } })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    await openTimeMotion()
    expect(await screen.findByLabelText('Set status for the 08:30–10:00 block')).toHaveValue('completed')
  })

  it('a load failure shows a Time & Motion error, no editor, and leaves the rest of Data Entry working', async () => {
    fetchPlannerMock.mockResolvedValue({ error: 'Could not load planner data.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    await openTimeMotion()
    expect(await screen.findByText('Could not load planner data.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'KPI Actuals' }))
    expect(await screen.findByText(/KPI actuals — TL One/)).toBeInTheDocument()
  })

  it('never mounts the editor while the stored day is still loading (an empty editable day could overwrite real data)', async () => {
    let release: (v: unknown) => void = () => {}
    fetchPlannerMock.mockReturnValue(new Promise((resolve) => { release = resolve }))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    await openTimeMotion()
    expect(await screen.findByText('Loading Time & Motion…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()

    release({ data: { revision: 3, rosterMismatch: false, unplanned: [], logs: [storedLog()] } })
    expect(await screen.findByLabelText('Set status for the 08:30–10:00 block')).toHaveValue('completed')
    expect(screen.queryByText('Loading Time & Motion…')).not.toBeInTheDocument()
  })

  it('never mounts the editor while the roster shift for a newly chosen date is still being read (no other date\'s template)', async () => {
    let releaseShift: (v: unknown) => void = () => {}
    resolveShiftMock.mockImplementation((_tl: string, date: string) => (date === '2026-10-07'
      ? new Promise((resolve) => { releaseShift = resolve })
      : Promise.resolve({ data: { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' } })))
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} nowIso="2026-10-08T09:00:00Z" />) // 11:00 SA: yesterday is open
    await openTimeMotion()
    expect(await screen.findByLabelText('Set status for the 11:00–11:30 block')).toBeInTheDocument() // today: Late
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-07' } })
    await waitFor(() => expect(fetchPlannerMock).toHaveBeenCalledWith('tl-1', '2026-10-07'))
    await act(async () => {}) // the stored day for 7 Oct has loaded; its shift has not
    expect(screen.getByText('Loading Time & Motion…')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()

    await act(async () => { releaseShift({ data: { kind: 'early', startTime: '08:00:00', endTime: '17:00:00' } }) })
    expect(await screen.findByLabelText('Set status for the 08:00–08:30 block')).toBeInTheDocument()
    expect(screen.queryByLabelText('Set status for the 11:00–11:30 block')).not.toBeInTheDocument()
  })

  it('Reload latest after a revision conflict refetches the day, remounts the section on it, and offers the kept device draft', async () => {
    pinClockToNow()
    savePlannerMock.mockResolvedValue({ error: 'This planner day was changed elsewhere since you opened it. Reload to see the latest version.' })
    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    await openTimeMotion()
    fireEvent.change(await screen.findByLabelText('Set status for the 08:30–10:00 block'), { target: { value: 'completed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save day' }))
    expect(await screen.findByRole('button', { name: 'Reload latest' })).toBeInTheDocument()
    expect(fetchPlannerMock).toHaveBeenCalledTimes(1)

    // someone else saved 60 minutes in the meantime
    let release: (v: unknown) => void = () => {}
    fetchPlannerMock.mockReturnValue(new Promise((resolve) => { release = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
    expect(await screen.findByText('Loading Time & Motion…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(fetchPlannerMock).toHaveBeenCalledTimes(2)

    release({ data: { revision: 5, rosterMismatch: false, unplanned: [], logs: [storedLog({ actual_minutes: 60 })] } })
    // the section remounted on the fresh day: its stored figures show, and the unsent draft is offered, not applied
    expect(await screen.findByText('Unsent changes from this device differ from what is saved.')).toBeInTheDocument()
    expect(screen.getByLabelText('Minutes for the 08:30–10:00 block')).toHaveValue(60)
    expect(screen.getByRole('button', { name: 'Use them' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload latest' })).not.toBeInTheDocument()
  })

  it('yesterday is editable before 12:00 South African time and locked from 12:00', async () => {
    const { unmount } = render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today="2026-10-08" nowIso="2026-10-08T09:59:00Z" />)
    await openTimeMotion()
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2026-10-07' } })
    expect(await screen.findByLabelText('Set status for the 08:30–10:00 block')).toBeInTheDocument()
    unmount()

    render(<LeadOpsWorkspace viewer={tlViewer} scope="prod" today="2026-10-08" nowIso="2026-10-08T10:00:00Z" />)
    await openTimeMotion()
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2026-10-07' } })
    expect(await screen.findByText(/Locked — a planner day can be changed on the day, or until 12:00 the next day\./)).toBeInTheDocument()
    expect(screen.queryByLabelText('Set status for the 08:30–10:00 block')).not.toBeInTheDocument()
  })

  it('an HOD sees the Time & Motion Planner tab, read-only, on the stored day of the chosen team leader', async () => {
    fetchPlannerMock.mockResolvedValue({ data: {
      revision: 2, rosterMismatch: false, unplanned: [],
      logs: [storedLog({ status: 'moved', actual_minutes: 45, actual_category: 'qa', actual_activity: 'Audit', reason: 'Queue spike' })],
    } })
    render(<LeadOpsWorkspace viewer={hodViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Time & Motion Planner' }))
    expect(await screen.findByText('Queue spike')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Set status for/)).not.toBeInTheDocument()
    expect(fetchPlannerMock).toHaveBeenCalledWith('tl-1', TODAY)
  })

  it('the HOD\'s Planner tab still shows the block an unplanned entry displaced on the old shift after a roster change', async () => {
    resolveShiftMock.mockResolvedValue({ data: { kind: 'late', startTime: '11:00:00', endTime: '20:00:00' } })
    fetchPlannerMock.mockResolvedValue({ data: {
      revision: 1, rosterMismatch: true, logs: [],
      unplanned: [{ id: 'u1', tl_id: 'tl-1', date: TODAY, category: 'escalations', minutes: 15, reason: 'Escalation', displaced_block_id: 'tpl-early-b5', created_at: '' }],
    } })
    render(<LeadOpsWorkspace viewer={hodViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Time & Motion Planner' }))
    expect(await screen.findByText('Displaced: Escalations & follow-ups')).toBeInTheDocument()
  })

  it('management reads any team leader day in Data Entry but cannot save it', async () => {
    respondWith({ teamLeaders: [teamLeaders[0]] }) // the configured manager is present, so management also gets the Manager Scorecard tab
    render(<LeadOpsWorkspace viewer={managementViewer} scope="prod" today={TODAY} nowIso={NOW} />)
    await screen.findByRole('heading', { name: 'Alex Morgan' })
    fireEvent.click(tabButton('Data Entry')!)
    await openTimeMotion()
    await waitFor(() => expect(fetchPlannerMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Save day' })).not.toBeInTheDocument()
  })

  it('a plain admin gets no team leader data and the planner is never fetched', async () => {
    const plainAdmin: LeadOpsViewerContext = { role: 'admin', hasTeamRow: false, profileId: 'admin-1' }
    render(<LeadOpsWorkspace viewer={plainAdmin} scope="prod" today={TODAY} nowIso={NOW} />)
    expect(await screen.findByText('No team leader data to show')).toBeInTheDocument()
    expect(fetchPlannerMock).not.toHaveBeenCalled()
  })
})
