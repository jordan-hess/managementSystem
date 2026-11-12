import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RosterGridView from './RosterGridView'
import type { ResolvedDaySlot } from '@/types'

function slot(date: string, overrideNotes: string | null): ResolvedDaySlot {
  return {
    profileId: 'p1', date, isWorkDay: false, shiftTemplate: null, overrideType: overrideNotes ? 'off' : null,
    attendanceStatus: null, effectiveStatus: 'off', overrideNotes,
  }
}

function setup(slots: ResolvedDaySlot[], onMarkAttendance?: jest.Mock) {
  render(
    <RosterGridView
      currentDate={new Date(2026, 10, 1)}
      onNavigate={jest.fn()} onToday={jest.fn()} onJumpToMonth={jest.fn()}
      allProfiles={[{ id: 'p1', full_name: 'Pat Agent', is_active: true }]}
      slotMap={new Map(slots.map(s => [`p1:${s.date}`, s]))}
      onMarkAttendance={onMarkAttendance}
      onOverride={jest.fn()}
      presenceMap={new Map()}
    />,
  )
}

const cells = () => screen.getAllByRole('button', { name: 'Off' })

describe('RosterGridView override note hover', () => {
  it('shows the override note while hovering that day', async () => {
    setup([slot('2026-11-01', null), slot('2026-11-02', 'Swapped with Sam for the dentist')], jest.fn())
    await userEvent.hover(cells()[1])
    expect(screen.getByRole('tooltip')).toHaveTextContent('Swapped with Sam for the dentist')
    await userEvent.unhover(cells()[1])
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows nothing when hovering a day without a note', async () => {
    setup([slot('2026-11-01', null)], jest.fn())
    await userEvent.hover(cells()[0])
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the note on keyboard focus too', async () => {
    setup([slot('2026-11-01', 'Training day')], jest.fn())
    cells()[0].focus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Training day')
  })

  it('still opens Mark Attendance when the noted day is clicked', async () => {
    const onMark = jest.fn()
    setup([slot('2026-11-01', 'Training day')], onMark)
    await userEvent.click(cells()[0])
    expect(onMark).toHaveBeenCalledWith('p1', '2026-11-01')
  })
})
