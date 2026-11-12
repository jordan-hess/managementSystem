jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/app/(app)/qa-reviews/actions', () => ({ deleteReviewAction: jest.fn() }))

import { render, screen } from '@testing-library/react'
import ReviewTable from './ReviewTable'

const base = {
  id: 'r1', agent_id: 'a1', agent_full_name: 'Ann Agent', department: 'Social', legs: 'both',
  interaction_date: '2026-10-01', final_score: 85, rating_label: 'Excellent', critical_fail: false,
}

describe('ReviewTable', () => {
  it('renders 85% Excellent', () => {
    render(<ReviewTable rows={[base] as never} />)
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Excellent')).toBeInTheDocument()
    expect(screen.getByText('Social Media')).toBeInTheDocument()
    expect(screen.getByText('Both')).toBeInTheDocument()
    expect(screen.getByText('Department')).toBeInTheDocument()
    expect(screen.getByText('Legs')).toBeInTheDocument()
  })

  it('renders "—" and Fail (Critical) badge when final_score is null', () => {
    render(<ReviewTable rows={[{ ...base, final_score: null, rating_label: 'Fail (Critical)', critical_fail: true }] as never} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    const badge = screen.getByText('Fail (Critical)')
    expect(badge.className).toContain('text-red-700')
  })

  it('shows a delete button only on rows in deletableIds', () => {
    render(<ReviewTable rows={[base, { ...base, id: 'r2', agent_full_name: 'Bob Agent' }] as never} deletableIds={['r2']} />)
    expect(screen.getByRole('button', { name: 'Delete QA review for Bob Agent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete QA review for Ann Agent' })).not.toBeInTheDocument()
  })
})
