import { render, screen } from '@testing-library/react'
import FieldError from './FieldError'
import FormErrorBanner from './FormErrorBanner'

describe('FieldError', () => {
  it('renders nothing without a message', () => {
    const { container } = render(<FieldError id="x" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders a red alert with the id the input points at', () => {
    render(<FieldError id="x" message="Required" />)
    const el = screen.getByRole('alert')
    expect(el).toHaveTextContent('Required')
    expect(el).toHaveAttribute('id', 'x-error')
    expect(el.className).toContain('text-red-600')
    expect(el.className).toContain('dark:text-red-400')
  })
})

describe('tone="dark"', () => {
  it('FieldError uses the lighter red for dark-only panels', () => {
    render(<FieldError id="x" message="Required" tone="dark" />)
    const cls = screen.getByRole('alert').className
    expect(cls).toContain('text-red-400')
    expect(cls).not.toContain('text-red-600')
  })
  it('FormErrorBanner uses the dark-panel colours', () => {
    render(<FormErrorBanner message="Could not save" tone="dark" />)
    expect(screen.getByRole('alert').className).toContain('bg-red-950/20')
  })
})

describe('FormErrorBanner', () => {
  it('renders nothing without a message', () => {
    const { container } = render(<FormErrorBanner />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders the message as an alert', () => {
    render(<FormErrorBanner message="Could not save" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })
})
