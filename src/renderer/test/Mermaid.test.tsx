import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Mermaid from '../components/Mermaid'
import mermaid from 'mermaid'

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
})
