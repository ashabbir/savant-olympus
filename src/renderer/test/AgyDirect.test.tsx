import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SettingsModal } from '../components/SettingsModal'

describe('AGY Direct in Settings and Local Agents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests local agents and receives AGY Direct from system', async () => {
    window.system.listLocalAgents = vi.fn().mockResolvedValue([
      { id: 'agy', label: 'AGY Direct', defaultModel: 'gemini-3.8-flash-high' },
    ])
    const agents = await window.system.listLocalAgents()
    expect(agents).toHaveLength(1)
    expect(agents[0]).toEqual({
      id: 'agy',
      label: 'AGY Direct',
      defaultModel: 'gemini-3.8-flash-high',
    })
  })

  it('renders AGY Direct with authenticated green icon when user is authed', async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({
      'athena:connection': { mode: 'direct', agentId: 'agy' },
    })
    window.system.listLocalAgents = vi.fn().mockResolvedValue([
      { id: 'agy', label: 'AGY Direct', defaultModel: 'gemini-3.8-flash-high' },
    ])
    window.system.getAgyAuthStatus = vi.fn().mockResolvedValue({
      authenticated: true,
      email: 'ahmed@savant.ai',
    })

    render(<SettingsModal open={true} onClose={vi.fn()} />)

    // Switch to Gateway tab
    const gatewayTabBtn = screen.getByText('gateway')
    await act(async () => {
      fireEvent.click(gatewayTabBtn)
    })

    // Verify Direct Connect mode is selected or click Direct Connect
    const directConnectBtn = screen.getAllByText('Direct Connect')[0]
    await act(async () => {
      fireEvent.click(directConnectBtn)
    })

    // Assert AGY Direct title and AUTHENTICATED badge
    await waitFor(() => {
      expect(screen.getAllByText('Direct Connect').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('AUTHENTICATED').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('User: ahmed@savant.ai')).toBeInTheDocument()
      expect(screen.getAllByText('ENABLED').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders AGY Direct with red icon and Authenticate in Browser button when not authed', async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({
      'athena:connection': { mode: 'direct', agentId: 'agy' },
    })
    window.system.listLocalAgents = vi.fn().mockResolvedValue([
      { id: 'agy', label: 'AGY Direct', defaultModel: 'gemini-3.8-flash-high' },
    ])
    window.system.getAgyAuthStatus = vi.fn().mockResolvedValue({
      authenticated: false,
    })

    render(<SettingsModal open={true} onClose={vi.fn()} />)

    // Switch to Gateway tab
    const gatewayTabBtn = screen.getByText('gateway')
    await act(async () => {
      fireEvent.click(gatewayTabBtn)
    })

    const directConnectBtn = screen.getAllByText('Direct Connect')[0]
    await act(async () => {
      fireEvent.click(directConnectBtn)
    })

    // Assert AUTH REQUIRED and Authenticate in Browser button
    await waitFor(() => {
      expect(screen.getAllByText('AUTH REQUIRED').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Authenticate in Browser').length).toBeGreaterThanOrEqual(1)
    })

    // Clicking Authenticate in Browser triggers startAgyAuth
    const authBtn = screen.getAllByText('Authenticate in Browser')[0]
    await act(async () => {
      fireEvent.click(authBtn)
    })

    expect(window.system.startAgyAuth).toHaveBeenCalled()
  })

  it('handles disconnect action to revoke authentication', async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({
      'athena:connection': { mode: 'direct', agentId: 'agy' },
    })
    window.system.getAgyAuthStatus = vi.fn().mockResolvedValue({
      authenticated: true,
      email: 'test@example.com',
    })
    window.system.disconnectAgyAuth = vi.fn().mockResolvedValue(true)

    render(<SettingsModal open={true} onClose={vi.fn()} />)

    const gatewayTabBtn = screen.getByText('gateway')
    await act(async () => {
      fireEvent.click(gatewayTabBtn)
    })

    const directConnectBtn = screen.getAllByText('Direct Connect')[0]
    await act(async () => {
      fireEvent.click(directConnectBtn)
    })

    await waitFor(() => {
      expect(screen.getAllByText('Disconnect').length).toBeGreaterThanOrEqual(1)
    })

    const disconnectBtn = screen.getAllByText('Disconnect')[0]
    await act(async () => {
      fireEvent.click(disconnectBtn)
    })

    expect(window.system.disconnectAgyAuth).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getAllByText('AUTH REQUIRED').length).toBeGreaterThanOrEqual(1)
    })
  })
})
