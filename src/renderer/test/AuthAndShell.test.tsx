import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoginScreen } from '../components/LoginScreen'
import { ProfileModal } from '../components/ProfileModal'
import { SettingsModal } from '../components/SettingsModal'
import { BottomBar } from '../components/BottomBar'
import { clearStoredApiKey, getStoredApiKey, SAVANT_API_KEY_STORAGE_KEY, setStoredApiKey } from '../services/auth'

describe('auth storage helpers', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('trims and stores non-empty Savant API keys', () => {
    setStoredApiKey('  sk-live-key  ')
    expect(getStoredApiKey()).toBe('sk-live-key')
    expect(window.localStorage.getItem(SAVANT_API_KEY_STORAGE_KEY)).toBe('sk-live-key')
  })

  it('removes empty API keys and can clear existing keys', () => {
    setStoredApiKey('sk-live-key')
    setStoredApiKey('   ')
    expect(getStoredApiKey()).toBe('')

    setStoredApiKey('sk-other-key')
    clearStoredApiKey()
    expect(getStoredApiKey()).toBe('')
  })
})

describe('LoginScreen', () => {
  it('requires a non-empty API key before calling onLogin', async () => {
    const onLogin = vi.fn()
    render(<LoginScreen onLogin={onLogin} />)

    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(await screen.findByText('Savant API key is required.')).toBeInTheDocument()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('requires a non-empty Server URL before calling onLogin', async () => {
    const onLogin = vi.fn()
    render(<LoginScreen onLogin={onLogin} />)

    const serverUrlInput = screen.getByPlaceholderText('http://127.0.0.1:8090')
    fireEvent.change(serverUrlInput, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(await screen.findByText('Server URL is required.')).toBeInTheDocument()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('submits a trimmed API key and shows pending state', async () => {
    let resolveLogin!: () => void
    const onLogin = vi.fn(() => new Promise<void>((resolve) => { resolveLogin = resolve }))
    render(<LoginScreen onLogin={onLogin} />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: '  sk-valid  ' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(onLogin).toHaveBeenCalledWith('sk-valid', 'http://127.0.0.1:8090')
    expect(screen.getByRole('button', { name: /authenticating/i })).toBeDisabled()
    resolveLogin()
  })

  it('surfaces login errors and re-enables the button', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Invalid Savant API key.'))
    render(<LoginScreen onLogin={onLogin} />)

    fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: 'sk-bad' } })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    expect(await screen.findByText('Invalid Savant API key.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login/i })).not.toBeDisabled()
  })
})

describe('ProfileModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('loads profile settings and persists edited values on blur', async () => {
    const onProfileChanged = vi.fn()
    render(<ProfileModal open onClose={vi.fn()} onProfileChanged={onProfileChanged} />)

    const nameInput = await screen.findByDisplayValue('test-user')
    const apiKeyInput = screen.getByDisplayValue('sk-test-key')

    fireEvent.change(nameInput, { target: { value: 'Ada Lovelace' } })
    fireEvent.blur(nameInput)

    await waitFor(() => {
      expect(window.system.saveSetting).toHaveBeenCalledWith('user:name', 'Ada Lovelace')
      expect(window.system.saveSetting).toHaveBeenCalledWith('user:apiKey', 'sk-test-key')
    })
    expect(onProfileChanged).toHaveBeenCalled()

    fireEvent.change(apiKeyInput, { target: { value: '  sk-profile  ' } })
    fireEvent.blur(apiKeyInput)
    await waitFor(() => expect(window.localStorage.getItem(SAVANT_API_KEY_STORAGE_KEY)).toBe('sk-profile'))
  })

  it('restores backed-up settings when escape cancellation is requested', async () => {
    const onClose = vi.fn()
    render(<ProfileModal open onClose={onClose} onProfileChanged={vi.fn()} />)

    await screen.findByDisplayValue('test-user')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    await waitFor(() => {
      expect(window.system.saveSetting).toHaveBeenCalledWith('user:name', 'test-user')
      expect(window.system.saveSetting).toHaveBeenCalledWith('user:apiKey', 'sk-test-key')
      expect(onClose).toHaveBeenCalled()
    })
  })
})

describe('SettingsModal and BottomBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setStoredApiKey('sk-test-key')
  })

  it('loads settings, checks service health, toggles service status, and saves normalized URLs', async () => {
    const onClose = vi.fn()
    const onSettingsChanged = vi.fn()
    vi.mocked(window.system.getSettings).mockResolvedValueOnce({
      'user:apiKey': 'sk-test-key',
      'system:defaultDirectory': '/Users/home/code',
      'gateway:config': { url: 'http://gateway.local///', enabled: true },
      'server:config': { url: 'http://server.local///', enabled: true },
    })
    vi.mocked(window.system.listProviders).mockResolvedValueOnce({
      source: 'gateway',
      providers: [{ id: 'codex', label: 'Codex', defaultModel: 'gpt-5', models: ['gpt-5'], source: 'gateway', installed: true }],
    })
    vi.mocked(window.fetch).mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ persona: [{ type: 'persona', name: 'engineer' }] }) } as unknown as Response)

    render(<SettingsModal open onClose={onClose} onSettingsChanged={onSettingsChanged} />)

    expect(await screen.findByText('/Users/home/code')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'gateway' }))
    await screen.findByText('http://gateway.local/health')

    fireEvent.click(screen.getByRole('button', { name: /check connection/i }))
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'ENABLED' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })

    await waitFor(() => {
      expect(window.system.saveSetting).toHaveBeenCalledWith('gateway:config', expect.objectContaining({
        url: 'http://gateway.local',
        enabled: false,
        status: 'idle',
      }))
      expect(onSettingsChanged).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('renders live bottom bar status from settings, health checks, and database status', async () => {
    vi.mocked(window.system.getSettings).mockResolvedValueOnce({
      'user:name': 'Control Operator',
      'system:defaultDirectory': '/ops',
      'gateway:config': { url: 'http://gateway.local', enabled: true },
      'server:config': { url: 'http://server.local', enabled: true },
    })
    vi.mocked(window.system.getUser).mockResolvedValueOnce('fallback-user')
    vi.mocked(window.system.getDbStatus).mockResolvedValueOnce('connected')
    vi.mocked(window.fetch).mockResolvedValue({ ok: true, status: 200, json: vi.fn() } as unknown as Response)

    render(<BottomBar />)

    expect(await screen.findByText('Control Operator')).toBeInTheDocument()
    expect(screen.getByText('/ops')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('online').length).toBeGreaterThanOrEqual(2))
    expect(screen.getByText('connected')).toBeInTheDocument()
  })
})
