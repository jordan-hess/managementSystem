import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryManager from './CategoryManager'

jest.mock('./actions', () => ({ createCaseCategory: jest.fn(), updateCaseCategory: jest.fn(), toggleCaseCategoryActive: jest.fn() }))
import { createCaseCategory, toggleCaseCategoryActive } from './actions'

const el = (id: string) => document.getElementById(id) as HTMLElement
const categories = [{ id: 'k1', name: 'Billing', is_active: true }] as never

function setup() {
  render(<CategoryManager open onClose={jest.fn()} onSuccess={jest.fn()} categories={categories} />)
}
const openForm = () => userEvent.click(screen.getByRole('button', { name: /new category/i }))
const create = () => screen.getByRole('button', { name: /create category/i })

describe('CategoryManager errors', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a red error under the name input when it is empty', async () => {
    setup()
    await openForm()
    await userEvent.click(create())
    expect(el('category-name')).toHaveAttribute('aria-invalid', 'true')
    expect(el('category-name').className).toContain('border-red-500')
    expect(screen.getByText('Name is required.')).toHaveAttribute('id', 'category-name-error')
    expect(createCaseCategory).not.toHaveBeenCalled()
  })

  it('puts a duplicate-name server error under the name input and clears it on edit', async () => {
    ;(createCaseCategory as jest.Mock).mockResolvedValue({ error: 'A category with this name already exists.', field: 'name' })
    setup()
    await openForm()
    await userEvent.type(el('category-name'), 'Billing')
    await userEvent.click(create())
    expect(await screen.findByText('A category with this name already exists.')).toHaveAttribute('id', 'category-name-error')
    await userEvent.type(el('category-name'), '2')
    expect(screen.queryByText('A category with this name already exists.')).not.toBeInTheDocument()
  })

  it('shows a failed activate/deactivate toggle in the list banner', async () => {
    ;(toggleCaseCategoryActive as jest.Mock).mockResolvedValue({ error: 'Failed to update category.' })
    setup()
    await userEvent.click(screen.getByTitle('Deactivate'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Failed to update category.')
    expect(alert).not.toHaveAttribute('id')
  })
})
