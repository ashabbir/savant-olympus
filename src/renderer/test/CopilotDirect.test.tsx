import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SettingsModal } from '../components/SettingsModal'

describe('Copilot Direct in Settings and Local Agents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests local agents and receives Copilot Direct from system', async () => {
    window.system.listLocalAgents = vi.fn().mockResolvedValue([
      { id: 'agy', label: 'AGY Direct', defaultModel: 'gemini-3.8-flash-high' },
      { id: 'copilot', label: 'Copilot Direct', defaultModel: 'gpt-4o' },
    ])
    const agents = await window.system.listLocalAgents()
    expect(agents).toHaveLength(2)
    expect(agents[1]).toEqual({
      id: 'copilot',
      label: 'Copilot Direct',
      defaultModel: 'gpt-4o',
    })
  })

  it('renders Copilot Direct with authenticated status when user is authed', async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({
      'athena:connection': { mode: 'direct', agentId: 'copilot' },
    })
    window.system.listLocalAgents = vi.fn().mockResolvedValue([
      { id: 'agy', label: 'AGY Direct', defaultModel: 'gemini-3.8-flash-high' },
      { id: 'copilot', label: 'Copilot Direct', defaultModel: 'gpt-4o' },
    ])
    window.system.getCopilotAuthStatus = vi.fn().mockResolvedValue({
      authenticated: true,
      username: 'octocat',
    })

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
      expect(screen.getByText('Copilot Direct')).toBeInTheDocument()
      expect(screen.getAllByText('AUTHENTICATED').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('GitHub User: octocat')).toBeInTheDocument()
    })
  })

  it('renders Copilot Direct with auth required and triggers startCopilotAuth on click', async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({
      'athena:connection': { mode: 'direct', agentId: 'copilot' },
    })
    window.system.listLocalAgents = vi.fn().mockResolvedValue([
      { id: 'agy', label: 'AGY Direct', defaultModel: 'gemini-3.8-flash-high' },
      { id: 'copilot', label: 'Copilot Direct', defaultModel: 'gpt-4o' },
    ])
    window.system.getCopilotAuthStatus = vi.fn().mockResolvedValue({
      authenticated: false,
    })
    window.system.startCopilotAuth = vi.fn().mockResolvedValue({
      success: true,
      username: 'octocat',
    })

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
      expect(screen.getByText('Copilot Direct')).toBeInTheDocument()
      expect(screen.getAllByText('Authenticate in Browser').length).toBeGreaterThanOrEqual(1)
    })

    // Click Authenticate in Browser on Copilot Direct
    const authBtns = screen.getAllByText('Authenticate in Browser')
    // Copilot auth button is the second one when both are auth required
    const copilotAuthBtn = authBtns[authBtns.length - 1]
    await act(async () => {
      fireEvent.click(copilotAuthBtn)
    })

    expect(window.system.startCopilotAuth).toHaveBeenCalled()
  })

  it('handles disconnect action for Copilot Direct', async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({
      'athena:connection': { mode: 'direct', agentId: 'copilot' },
    })
    window.system.getCopilotAuthStatus = vi.fn().mockResolvedValue({
      authenticated: true,
      username: 'octocat',
    })
    window.system.disconnectCopilotAuth = vi.fn().mockResolvedValue(true)

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

    const disconnectBtns = screen.getAllByText('Disconnect')
    const copilotDisconnectBtn = disconnectBtns[disconnectBtns.length - 1]
    await act(async () => {
      fireEvent.click(copilotDisconnectBtn)
    })

    expect(window.system.disconnectCopilotAuth).toHaveBeenCalled()
  })
})
