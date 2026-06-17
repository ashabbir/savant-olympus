import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextView } from '../components/tabs/ContextView'
import React from 'react'

describe('ContextView - Graphify Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock window.system.readGraphifyJson
    window.system.readGraphifyJson = vi.fn().mockResolvedValue({
      nodes: [
        { id: "n1", label: "fn_one", type: "function", source_file: "a.py" }
      ],
      links: [
        { source: "n1", target: "n2", type: "calls" }
      ]
    })

    let serverHasStats = false

    vi.spyOn(window, 'fetch').mockImplementation((url, init) => {
      const u = url.toString()
      if (u.includes('/api/context/repos/sources')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ sources: {} })
        } as Response)
      }
      if (u.includes('/api/context/repos/indexing-status')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: {} })
        } as Response)
      }
      if (u.includes('/api/context/repos')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            repos: [
              { id: "1", name: "savant-olympus", path: "/Users/home/code/savant-olympus", file_count: 5 }
            ]
          })
        } as Response)
      }
      if (u.includes('/api/graphify/stats')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            stats: serverHasStats ? { function: 1 } : {},
            total: serverHasStats ? 1 : 0
          })
        } as Response)
      }
      if (u.includes('/api/graphify/import')) {
        serverHasStats = true
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            nodes_imported: 1,
            edges_imported: 1
          })
        } as Response)
      }
      if (u.includes('/api/context/ast/list')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ nodes: [] })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      } as Response)
    })
  })

  it('detects Graphify JSON and renders upload banner', async () => {
    render(
      <ContextView
        serverUrl="http://127.0.0.1:8090"
        apiKey="test-key"
        onSelectProject={() => {}}
        selectedProject="savant-olympus"
      />
    )

    // Wait for the repo list to load and select "savant-olympus" (it's auto-selected because of the prop)
    await waitFor(() => {
      expect(screen.getByText(/Graphify Data Detected/i)).toBeInTheDocument()
      expect(screen.getByText(/Found graphify-out\/graph.json with 1 nodes and 1 edges/i)).toBeInTheDocument()
    })

    // Click "Upload Graphify JSON"
    const uploadBtn = screen.getByRole('button', { name: /Upload Graphify JSON/i })
    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect(screen.getByText(/Successfully uploaded Graphify KG!/i)).toBeInTheDocument()
    })

    // Verify stats got updated and displayed
    await waitFor(() => {
      expect(screen.getByText(/Graphify Stats/i)).toBeInTheDocument()
      expect(screen.getByText(/function Nodes/i)).toBeInTheDocument()
    })
  })
})
