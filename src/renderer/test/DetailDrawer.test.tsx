import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DetailDrawer } from '../components/tabs/ContextVisualizations'

describe('DetailDrawer Component AI Chat Integration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    
    // Mock getSettings to return a configured provider chain
    window.system.getSettings = vi.fn().mockResolvedValue({
      'provider:chain': [
        { id: 'p1', provider: 'gemini', model: '3.5' }
      ]
    })

    // Mock run-agent invoke
    window.ipcRenderer.invoke = vi.fn().mockImplementation((channel) => {
      if (channel === 'run-agent') {
        return Promise.resolve('This is a simulated AI refactoring advice response.')
      }
      return Promise.resolve()
    })
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

  it('switches to AI Chat tab when CHAT WITH AI button is clicked', async () => {
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

    const chatBtn = screen.getByText('CHAT WITH AI')
    fireEvent.click(chatBtn)

    await waitFor(() => {
      expect(screen.getByText('Gateway AI Chat')).toBeInTheDocument()
    })
  })

  it('allows sending a chat message and displays the AI response', async () => {
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
    const chatTabBtn = screen.getByText('AI Chat')
    fireEvent.click(chatTabBtn)

    // Type and send message
    const input = screen.getByPlaceholderText('Ask a question about this code...')
    fireEvent.change(input, { target: { value: 'How can I fix this?' } })

    const sendBtn = input.nextElementSibling;
    expect(sendBtn).toBeInTheDocument();
    if (sendBtn) {
      fireEvent.click(sendBtn);
    }

    // Wait for the message bubble to be displayed
    await waitFor(() => {
      expect(screen.getByText('How can I fix this?')).toBeInTheDocument()
    })

    // Wait for AI response to load
    await waitFor(() => {
      expect(screen.getByText('This is a simulated AI refactoring advice response.')).toBeInTheDocument()
    })

    // Verify IPC call
    expect(window.ipcRenderer.invoke).toHaveBeenCalledWith('run-agent', expect.objectContaining({
      provider: 'gemini',
      model: '3.5',
      prompt: expect.stringContaining('How can I fix this?')
    }))
  })
})
