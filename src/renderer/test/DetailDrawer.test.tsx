import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DetailDrawer } from '../components/tabs/ContextVisualizations'

describe('DetailDrawer Component ATHENA Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock getSettings to return a configured provider chain
    window.system.getSettings = vi.fn().mockResolvedValue({
      'provider:chain': [
        { id: 'p1', provider: 'gemini', model: '3.5' }
      ]
    })

    window.system.loadAthenaThreads = vi.fn().mockResolvedValue([])
    window.system.saveAthenaThread = vi.fn().mockResolvedValue(true)
    window.system.runAgentViaGateway = vi.fn().mockResolvedValue('This is a simulated ATHENA refactoring advice response.')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    }))
  })

  const mockNode = {
    data: {
      id: 'src/main.ts#testFunc#function#10',
      name: 'testFunc',
      type: 'function',
      path: 'src/main.ts',
      line: 10,
      endLine: 25,
      complexity: 12,
    }
  }

  it('renders Details tab with node metrics', () => {
    render(
      <DetailDrawer
        selectedNode={mockNode}
        isOpen={true}
        onClose={vi.fn()}
        onToggleCollapse={vi.fn()}
        findings={[]}
        repoName="test-repo"
      />
    )

    expect(screen.getAllByText('testFunc')[0]).toBeInTheDocument()
    expect(screen.getByText('FUNCTION')).toBeInTheDocument()
    expect(screen.getAllByText('12')[0]).toBeInTheDocument() // complexity score
  })

  it('allows switching to Ask ATHENA tab', async () => {
    render(
      <DetailDrawer
        selectedNode={mockNode}
        isOpen={true}
        onClose={vi.fn()}
        onToggleCollapse={vi.fn()}
        findings={[]}
        repoName="test-repo"
      />
    )

    const chatTabBtn = screen.getByText('Ask ATHENA')
    fireEvent.click(chatTabBtn)

    await waitFor(() => {
      expect(screen.getByText('ATHENA')).toBeInTheDocument()
    })
  })

  it('allows sending a chat message and displays the ATHENA response', async () => {
    render(
      <DetailDrawer
        selectedNode={mockNode}
        isOpen={true}
        onClose={vi.fn()}
        onToggleCollapse={vi.fn()}
        findings={[]}
        repoName="test-repo"
      />
    )

    // Switch to Chat tab
    const chatTabBtn = screen.getByText('Ask ATHENA')
    fireEvent.click(chatTabBtn)

    // Type and send message
    const input = screen.getByPlaceholderText('Ask ATHENA about this code...')
    fireEvent.change(input, { target: { value: 'How can I fix this?' } })

    const sendBtn = screen.getByText('ASK')
    expect(sendBtn).toBeInTheDocument()
    fireEvent.click(sendBtn)

    // Wait for the message bubble to be displayed
    await waitFor(() => {
      expect(screen.getByText('How can I fix this?')).toBeInTheDocument()
    })

    // Wait for response to load
    await waitFor(() => {
      expect(screen.getByText('This is a simulated ATHENA refactoring advice response.')).toBeInTheDocument()
    })

    // Verify IPC call
    expect(window.system.runAgentViaGateway).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'gemini',
      model: '3.5',
      prompt: expect.stringContaining('How can I fix this?')
    }))
  })
})
