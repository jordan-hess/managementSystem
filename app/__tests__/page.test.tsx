import { redirect } from 'next/navigation'
import Home from '../page'

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

describe('Home Page', () => {
  it('redirects to the home page', () => {
    Home()
    expect(redirect).toHaveBeenCalledWith('/home')
  })
})
