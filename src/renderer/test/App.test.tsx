import { render, screen, fireEvent, waitFor, waitForElementToBeRemoved } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../App'

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  const waitForAppReady = async () => {
    render(<App />)
    // Wait for startup screen to disappear
    await waitForElementToBeRemoved(() => screen.queryByText(/SYSTEM_BOOT/i), { timeout: 5000 })
  }

  it('renders correctly and shows the header', async () => {
    await waitForAppReady()
    expect(screen.getAllByText(/olympus/i)[0]).toBeInTheDocument()
  })

  it('renders the Workspace view by default', async () => {
    await waitForAppReady()
    await waitFor(() => {
      expect(screen.getByText(/SAVANT-WORKSPACE/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows the user name in the bottom bar', async () => {
    await waitForAppReady()
    await waitFor(() => {
      expect(screen.getByText(/user:/i)).toBeInTheDocument()
      expect(screen.getByText('test-user')).toBeInTheDocument()
    })
  })
})
