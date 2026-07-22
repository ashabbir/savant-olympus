import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextView } from '../components/tabs/ContextView'
import React from 'react'

describe('ContextView - Code Graph Integration', () => {
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
              { id: "1", name: "savant-olympus", path: "/Users/home/code/savant-olympus", source: "directory", file_count: 5, memory_bank_count: 9 }
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

  it('does not expose the legacy local graph workflow', async () => {
    render(
      <ContextView
        serverUrl="http://127.0.0.1:8090"
        apiKey="test-key"
        onSelectProject={() => {}}
        selectedProject="savant-olympus"
        isAdmin
      />
    )

    expect(await screen.findByText('GENERATE GRAPH')).toBeInTheDocument()
    expect(screen.queryByText('REFETCH')).not.toBeInTheDocument()
    expect(screen.queryByText(/Last Fetched:/)).not.toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.queryByText(/graphify/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/purge index/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/push local graph/i)).not.toBeInTheDocument()
    expect(vi.mocked(window.fetch).mock.calls.some(([url]) => url.toString().includes('/api/graphify/import'))).toBe(false)
  })

  it('uses explicit repo identity and native code graph sync for CodeGraph repositories', async () => {
    vi.mocked(window.fetch).mockImplementation((url, init) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) return Promise.resolve({ ok: true, json: async () => ({ repos: [{ id: 'repo-42', name: 'codegraph-repo', path: '/base-code/codegraph-repo', source: 'github', last_fetched_at: '2026-07-19T14:00:00Z', provider: 'codegraph', freshness: 'stale' }] }) } as Response)
      if (u.includes('/api/context/repos/indexing-status')) return Promise.resolve({ ok: true, json: async () => ({ status: {} }) } as Response)
      if (u.includes('/api/context/code-intelligence/repos/repo-42/sync')) return Promise.resolve({ ok: true, json: async () => ({ job_id: 'job-1', provider: 'codegraph' }) } as Response)
      if (u.includes('/api/context/code-intelligence/repos/repo-42/health')) return Promise.resolve({ ok: true, json: async () => ({ provider: 'codegraph', freshness: 'stale', graph_version: '1.4.1', nodes: 4217, edges: 6300, indexed_at: '2026-07-19T14:30:00Z' }) } as Response)
      if (u.includes('/api/context/ast/list')) return Promise.resolve({ ok: true, json: async () => ({ nodes: [] }) } as Response)
      if (u.includes('/symbols?limit=250')) return Promise.resolve({ ok: true, json: async () => ({ items: [
        { id: 'codegraph:1', kind: 'file', name: 'app.py', location: { file_path: 'app.py' } },
        { id: 'codegraph:2', kind: 'class', name: 'Application', location: { file_path: 'app.py' } },
        { id: 'codegraph:3', kind: 'function', name: 'main', location: { file_path: 'app.py' } },
      ] }) } as Response)
      if (u.includes('/subgraph')) return Promise.resolve({ ok: true, json: async () => ({ symbols: [
        { id: 'codegraph:1', kind: 'file', name: 'app.py', location: { file_path: 'app.py' } },
        { id: 'codegraph:2', kind: 'class', name: 'Application', location: { file_path: 'app.py' } },
        { id: 'codegraph:3', kind: 'function', name: 'main', location: { file_path: 'app.py' } },
      ], edges: [
        { source_id: 'codegraph:1', target_id: 'codegraph:2', kind: 'contains' },
        { source_id: 'codegraph:2', target_id: 'codegraph:3', kind: 'contains' },
      ] }) } as Response)
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject="codegraph-repo" isAdmin />)

    expect(await screen.findByText('GENERATE GRAPH')).toBeInTheDocument()
    expect(screen.queryByText(/graphify/i)).not.toBeInTheDocument()
    expect(await screen.findByText(/The code graph is stale/i)).toBeInTheDocument()
    expect(screen.getByText('4217')).toBeInTheDocument()
    expect(screen.getByText('SEMANTIC: DONE')).toBeInTheDocument()
    expect(screen.getByText('STRUCTURAL: STALE')).toBeInTheDocument()
    expect(screen.getByText('Last Graph Generated')).toBeInTheDocument()
    expect(screen.getByText('Last Fetched')).toBeInTheDocument()
    expect(screen.queryByText('SELECT GRAPHIFY DIR')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('GENERATE GRAPH'))
    await waitFor(() => expect(vi.mocked(window.fetch).mock.calls.some(([url]) => url.toString().includes('/api/context/code-intelligence/repos/repo-42/sync'))).toBe(true))
    expect(screen.getByTestId('graph-generation-progress')).toHaveTextContent('Graph Generation Queued')
    expect(screen.getByText('STRUCTURAL: QUEUED')).toBeInTheDocument()

    const healthCall = vi.mocked(window.fetch).mock.calls.find(([url]) => url.toString().includes('/api/context/code-intelligence/repos/repo-42/health'))
    expect(healthCall).toBeTruthy()
    const astCall = vi.mocked(window.fetch).mock.calls.find(([url]) => url.toString().includes('/api/context/ast/list'))
    expect(astCall?.[0].toString()).toContain('repo_id=repo-42')

    fireEvent.click(screen.getByText('Project Graph'))
    expect(await screen.findByText(/VISIBLE:/)).toHaveTextContent('3 NODES / 2 EDGES')
  })
})
