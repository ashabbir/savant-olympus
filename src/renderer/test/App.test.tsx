import { render, screen, fireEvent, waitFor, waitForElementToBeRemoved } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../App'

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(SVGSVGElement.prototype, 'width', {
      configurable: true,
      value: { baseVal: { value: 800 } },
    })
    Object.defineProperty(SVGSVGElement.prototype, 'height', {
      configurable: true,
      value: { baseVal: { value: 500 } },
    })
  })

  const waitForAppReady = async () => {
    render(<App />)
    // Wait for startup screen to disappear
    await waitForElementToBeRemoved(() => screen.queryByText(/SYSTEM_BOOT/i), { timeout: 5000 })
  }

  it('renders correctly and shows the header', async () => {
    await waitForAppReady()
    expect(screen.getAllByText(/olympus/i)[0]).toBeInTheDocument()
    expect(screen.queryByTitle('Tools')).not.toBeInTheDocument()
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

  it('installs missing Savant defaults for every detected local provider on startup', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input)
      if (url.includes('/api/skills?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ skills: [
            { id: 'savant-session-workspace' },
            { id: 'savant-knowledge-commit' },
            { id: 'savant-code-analysis' },
          ] }),
        } as Response)
      }
      if (url.includes('/api/skills/') && url.endsWith('/files')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(['SKILL.md']) } as Response)
      }
      if (url.includes('/api/skills/') && url.includes('/file?path=SKILL.md')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: '# Savant default' }) } as Response)
      }
      return originalFetch(input, init)
    })

    await waitForAppReady()
    await waitFor(() => {
      expect(window.system.installDefaultSkills).toHaveBeenCalled()
    })
    expect(vi.mocked(window.system.installDefaultSkills).mock.calls[0][0].skills).toHaveLength(3)
  })

  it('navigates to the Reminders view when the Reminders sidebar tab is clicked', async () => {
    await waitForAppReady()
    const remindersTabBtn = screen.getByTitle('Reminders')
    expect(remindersTabBtn).toBeInTheDocument()
    fireEvent.click(remindersTabBtn)
    await waitFor(() => {
      expect(screen.getByText(/SYSTEM REMINDERS/i)).toBeInTheDocument()
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
      expect(screen.getByText(/knowledge network/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Agent Setup'))
    await waitFor(() => {
      expect(screen.getByText(/AGENT SETUP/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('Workspace'))
    await waitFor(() => {
      expect(screen.getByText(/SAVANT-WORKSPACE/i)).toBeInTheDocument()
    })
  })

  it('uses the login-time server role instead of a stale persisted role', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    let serverRole = 'operator'
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).includes('/api/auth/validate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true, user_id: 'test-user', name: 'test-user', role: serverRole }),
        } as Response)
      }
      return originalFetch(input, init)
    })
    vi.mocked(window.system.getSettings).mockResolvedValue({
      'user:apiKey': 'sk-test-key',
      'user:name': 'test-user',
      'user:role': 'admin',
    })

    await waitForAppReady()
    fireEvent.click(screen.getByTitle('Knowledge'))
    expect(screen.queryByTitle('Add Node')).not.toBeInTheDocument()

    fireEvent.focus(window)
    expect(screen.queryByTitle('Add Node')).not.toBeInTheDocument()
  })

  it('shows the Users sidebar tab icon for an admin role returned at login', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    const serverRole = 'admin'
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).includes('/api/auth/validate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true, user_id: 'test-user', name: 'test-user', role: serverRole }),
        } as Response)
      }
      return originalFetch(input, init)
    })

    await waitForAppReady()
    expect(screen.getByTitle('Users')).toBeInTheDocument()
  })

  it('restricts guest users strictly to Knowledge tab with other tabs hidden', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).includes('/api/auth/validate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ valid: true, user_id: 'guest-user', name: 'guest-user', role: 'guest' }),
        } as Response)
      }
      return originalFetch(input, init)
    })

    await waitForAppReady()
    expect(screen.getByTitle('Knowledge')).toBeInTheDocument()
    expect(screen.queryByTitle('Workspace')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Abilities')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Context')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Reminders')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Users')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Tools')).not.toBeInTheDocument()
  })
})
