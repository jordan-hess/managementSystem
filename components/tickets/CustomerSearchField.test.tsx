import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerSearchField from './CustomerSearchField'

jest.mock('@/lib/customers/search', () => ({ searchCustomersAction: jest.fn().mockResolvedValue({ data: [] }) }))
import { searchCustomersAction } from '@/lib/customers/search'

const customers = [{ id: 'c1', name: 'Ann', phone: '0821234567' }]

describe('CustomerSearchField error display', () => {
  it('outlines the search input and shows the message when there is an error', () => {
    render(<CustomerSearchField customers={customers} value="" onChange={jest.fn()} id="cust" error="Please select a customer." />)
    const search = screen.getByPlaceholderText(/search by name/i)
    expect(search).toHaveAttribute('aria-invalid', 'true')
    expect(search).toHaveAttribute('id', 'cust')
    expect(search.className).toContain('border-red-500')
    expect(screen.getByText('Please select a customer.')).toHaveAttribute('id', 'cust-error')
  })

  it('looks unchanged without an error', () => {
    render(<CustomerSearchField customers={customers} value="" onChange={jest.fn()} id="cust" />)
    const search = screen.getByPlaceholderText(/search by name/i)
    expect(search).not.toHaveAttribute('aria-invalid')
    expect(search.className).not.toContain('border-red-500')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('CustomerSearchField has no full-list dropdown', () => {
  it('renders no select / combobox and no "pick from the full list" text', () => {
    render(<CustomerSearchField customers={customers} value="" onChange={jest.fn()} id="cust" />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/pick from the full list/i)).not.toBeInTheDocument()
  })

  it('picks a customer found by search', async () => {
    ;(searchCustomersAction as jest.Mock).mockResolvedValueOnce({ data: [{ id: 'c1', name: 'Ann', phone: '0821234567', email: null }] })
    const onChange = jest.fn()
    render(<CustomerSearchField customers={customers} value="" onChange={onChange} id="cust" />)
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'Ann')
    await userEvent.click(await screen.findByRole('button', { name: /Ann — 0821234567/ }))
    expect(onChange).toHaveBeenCalledWith('c1')
  })

  it('says "No matches." (not "try the full list") when a search finds nothing', async () => {
    render(<CustomerSearchField customers={customers} value="" onChange={jest.fn()} id="cust" />)
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'zzz')
    expect(await screen.findByText('No matches.')).toBeInTheDocument()
  })

  it('renders extraOption as a button that selects its value', async () => {
    const onChange = jest.fn()
    render(<CustomerSearchField customers={customers} value="" onChange={onChange} id="cust" extraOption={{ value: '__new__', label: '+ New Customer' }} />)
    await userEvent.click(screen.getByRole('button', { name: '+ New Customer' }))
    expect(onChange).toHaveBeenCalledWith('__new__')
  })

  it('shows no extraOption button when none is provided', () => {
    render(<CustomerSearchField customers={customers} value="" onChange={jest.fn()} id="cust" />)
    expect(screen.queryByRole('button', { name: /new customer/i })).not.toBeInTheDocument()
  })
})

describe('CustomerSearchField chip for a customer not in the preloaded list', () => {
  function Harness() {
    const [value, setValue] = useState('')
    return <CustomerSearchField customers={customers} value={value} onChange={setValue} id="cust" />
  }
  const fresh = { id: 'c9', name: 'Zed', phone: '0839999999', email: null }

  it('shows the "Name — phone" chip after picking a search result missing from `customers`', async () => {
    ;(searchCustomersAction as jest.Mock).mockResolvedValueOnce({ data: [fresh] })
    render(<Harness />)
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'Zed')
    await userEvent.click(await screen.findByRole('button', { name: /Zed — 0839999999/ }))
    expect(screen.getByText('Zed — 0839999999')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/search by name/i)).not.toBeInTheDocument()
  })

  it('brings the search box back when "Change" is clicked', async () => {
    ;(searchCustomersAction as jest.Mock).mockResolvedValueOnce({ data: [fresh] })
    render(<Harness />)
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'Zed')
    await userEvent.click(await screen.findByRole('button', { name: /Zed — 0839999999/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByPlaceholderText(/search by name/i)).toBeInTheDocument()
    expect(screen.queryByText('Zed — 0839999999')).not.toBeInTheDocument()
  })
})
