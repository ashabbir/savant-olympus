import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Mermaid from '../components/Mermaid'
import mermaid from 'mermaid'
import { AthenaMessage } from '../components/shared/AthenaMessage'
import { normalizeMermaidMarkdown } from '../utils/mermaidMarkdown'
import { buildAthenaExportDocument } from '../components/tabs/knowledge/utils/chatExport'

describe('Mermaid Component', () => {
  const mockChart = 'graph TD; A-->B;'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders mermaid diagram successfully', async () => {
    render(<Mermaid chart={mockChart} />)
    
    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalled()
      const svgContainer = screen.getByTestId('mermaid-svg')
      // React's dangerouslySetInnerHTML doesn't set an actual attribute named dangerouslySetInnerHTML on the DOM node
      expect(svgContainer.innerHTML).toContain('mock-mermaid')
    })
  })

  it('falls back to SyntaxHighlighter on error', async () => {
    // Mock render failure
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Syntax Error'))
    
    render(<Mermaid chart={mockChart} />)
    
    await waitFor(() => {
      expect(mermaid.render).toHaveBeenCalled()
      // Use findByText or a flexible matcher since SyntaxHighlighter breaks text into spans
      expect(screen.getByText(/graph/)).toBeInTheDocument()
      expect(screen.getByText(/TD/)).toBeInTheDocument()
    })
  })

  it('normalizes and visually renders a bare ATHENA flowchart followed by prose', async () => {
    const response = `graph TD
  K[knowledge]
  UI[Knowledge graph UI]
  UI -->|depends_on| K
This is the cleanest read of the node neighborhood.`

    expect(normalizeMermaidMarkdown(response)).toContain('```mermaid\ngraph TD')
    render(<AthenaMessage message={{ sender: 'assistant', text: response }} />)

    await waitFor(() => expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument())
    expect(screen.getByText('This is the cleanest read of the node neighborhood.')).toBeInTheDocument()
  })

  it('keeps rendered Mermaid SVG diagrams in standalone downloads', () => {
    const html = buildAthenaExportDocument('Knowledge chat', [{
      sender: 'assistant',
      timestamp: '2026-07-22T12:00:00.000Z',
      html: '<div class="mermaid"><svg aria-label="knowledge diagram"><path d="M0 0" /></svg></div>',
    }])

    expect(html).toContain('<svg aria-label="knowledge diagram">')
    expect(html).toContain('.mermaid svg')
    expect(html).toContain('SAVANT</div>')
    expect(html).toContain('Olympus · Athena export')
    expect(html).toContain('<footer class="savant-footer">')
    expect(html).toContain('.message.user { margin-left: auto; margin-right: 0;')
    expect(html).toContain('.message.assistant { margin-left: 0; margin-right: auto;')
  })
})
