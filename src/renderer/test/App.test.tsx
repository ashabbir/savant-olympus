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

  it('navigates to the Reminders view when the Reminders sidebar tab is clicked', async () => {
    await waitForAppReady()
    const remindersTabBtn = screen.getByTitle('Reminders')
    expect(remindersTabBtn).toBeInTheDocument()
    fireEvent.click(remindersTabBtn)
    await waitFor(() => {
      expect(screen.getByText(/\/\/ SYSTEM REMINDERS/i)).toBeInTheDocument()
    })
  })

  it('shows the login screen when no API key is present', async () => {
    window.localStorage.clear()
    vi.mocked(window.system.getSettings).mockResolvedValueOnce({})

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/authenticate with your savant api key/i)).toBeInTheDocument()
    })
  })

  it('switches between primary shell tabs', async () => {
    await waitForAppReady()

    fireEvent.click(screen.getByTitle('Knowledge'))
    await waitFor(() => {
      expect(screen.getByText(/\/\/ knowledge network/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Workspace'))
    await waitFor(() => {
      expect(screen.getByText(/SAVANT-WORKSPACE/i)).toBeInTheDocument()
    })
  })
})
