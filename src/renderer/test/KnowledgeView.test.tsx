import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildFilteredKnowledgeContext, buildKnowledgeChatContextSnapshot, buildKnowledgeExportPayload, buildKnowledgeImportDiff, deriveKnowledgeVisibility, fetchKnowledgeExportData, getKnowledgeNodeRadius, importKnowledgePayload, inferNodeDomains, KnowledgeView, restoreKnowledgeFocals, validateKnowledgeImportPayload } from '../components/tabs/KnowledgeView'

const graphPayload = {
  nodes: [
    { node_id: 'n1', title: 'Auth Service', node_type: 'service', content: 'Handles auth', status: 'committed', metadata: { source: 'test' } },
    { node_id: 'n2', title: 'Postgres', node_type: 'technology', content: 'Database', status: 'staged', metadata: {} },
    { node_id: 'd1', title: 'Auth Domain', node_type: 'domain', content: 'Authentication boundary', status: 'committed', metadata: {} },
  ],
  edges: [
    { edge_id: 'e1', source_id: 'n1', target_id: 'n2', edge_type: 'uses', weight: 1 },
    { edge_id: 'e2', source_id: 'd1', target_id: 'n1', edge_type: 'contains', weight: 1 },
  ],
}
let currentGraphPayload = graphPayload

describe('KnowledgeView', () => {
  it('increases node size as linked edge count grows', () => {
    const isolatedRadius = getKnowledgeNodeRadius(0)
    const connectedRadius = getKnowledgeNodeRadius(4)
    const hubRadius = getKnowledgeNodeRadius(16)

    expect(connectedRadius).toBeGreaterThan(isolatedRadius)
    expect(hubRadius).toBeGreaterThan(connectedRadius)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.localStorage.setItem('savant_api_key', 'sk-test-key')
    currentGraphPayload = graphPayload
    vi.mocked(window.system.loadAthenaThreads).mockResolvedValue([])
    vi.mocked(window.system.getChatHistory).mockResolvedValue([])
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('alert', vi.fn())
    Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, value: 500 })
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: vi.fn(() => ({ x: 100, y: 100, width: 400, height: 200 })),
    })
    Object.defineProperty(SVGSVGElement.prototype, 'width', {
      configurable: true,
      value: { baseVal: { value: 800 } },
    })
    Object.defineProperty(SVGSVGElement.prototype, 'height', {
      configurable: true,
      value: { baseVal: { value: 500 } },
    })
    vi.mocked(window.fetch).mockImplementation((url, init) => {
      const u = url.toString()
      if (u.includes('/api/knowledge/graph')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(currentGraphPayload) } as Response)
      }
      if (u.includes('/api/knowledge/nodes/n1') && (init as RequestInit | undefined)?.method === 'PUT') {
        const body = JSON.parse(String((init as RequestInit | undefined)?.body || '{}'))
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ...graphPayload.nodes[0], ...body }),
        } as Response)
      }
      if (u.includes('/api/knowledge/nodes/n1')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(graphPayload.nodes[0]) } as Response)
      }
      if (u.includes('/api/knowledge/nodes/d1')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(graphPayload.nodes[2]) } as Response)
      }
      if (u.includes('/api/knowledge/nodes/n2')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(graphPayload.nodes[1]) } as Response)
      }
      if (u.includes('/api/knowledge/nodes') && (init as RequestInit | undefined)?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ node_id: 'n3' }) } as Response)
      }
      if (u.includes('/api/knowledge/prune') || u.includes('/api/knowledge/purge-workspace')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response)
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
    })
  })

  it('serializes and restores knowledge chat graph state', () => {
      const snapshot = buildKnowledgeChatContextSnapshot({
        selectedNodeId: null,
        selectedNodeIds: [],
        focalsByType: { service: new Set(['n1', 'missing']), domain: new Set(['d1']) },
        exploreDepth: 3,
        isExploreActive: true,
        searchQuery: 'auth',
        searchTags: ['Auth Domain'],
        filterSearch: 'service',
        typeFilter: 'service',
        openType: 'service',
        is3DMode: false,
      })

      expect(snapshot.focalsByType).toEqual({ service: ['n1', 'missing'], domain: ['d1'] })
      expect(restoreKnowledgeFocals(snapshot, new Set(['n1', 'd1']))).toEqual({
        service: new Set(['n1']),
        domain: new Set(['d1']),
      })
  })

  it('opens a saved chat and restores its graph selection', async () => {
      const savedMessages = [
        { id: 'm1', sender: 'user' as const, text: 'How does auth work?', timestamp: '2026-07-10T12:00:00.000Z' },
        { id: 'm2', sender: 'assistant' as const, text: '**Auth** uses Postgres.\n\n| Domain | Role |\n|---|---|\n| Users | Identity |', timestamp: '2026-07-10T12:00:01.000Z' },
      ]
      vi.mocked(window.system.loadAthenaThreads).mockResolvedValueOnce([{
        target_id: 'n1',
        title: 'Auth Service',
        kind: 'knowledge',
        context: buildKnowledgeChatContextSnapshot({
          selectedNodeId: 'n1',
          selectedNodeIds: [],
          focalsByType: { service: ['n1'] },
          exploreDepth: 1,
          isExploreActive: true,
          searchQuery: '',
          searchTags: [],
          filterSearch: '',
          typeFilter: null,
          openType: 'service',
          is3DMode: false,
        }),
        messages: savedMessages,
        updated_at: '2026-07-10T12:00:01.000Z',
      }])
      vi.mocked(window.system.getChatHistory).mockResolvedValue(savedMessages)

      render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)
      await screen.findByText('Knowledge Network')

      window.dispatchEvent(new CustomEvent('knowledge-chat-history'))
      const threadPreview = await screen.findByText('How does auth work?')
      expect(threadPreview).toBeInTheDocument()
      fireEvent.click(threadPreview.closest('button')!)

      expect(await screen.findByRole('cell', { name: 'Identity' })).toBeInTheDocument()
      expect(screen.getByText('// Ask ATHENA')).toHaveClass('text-[var(--cp-cyan)]')
      const exportToolbar = screen.getByText('Export conversation').parentElement!
      fireEvent.click(within(exportToolbar).getByRole('button', { name: 'Download conversation as HTML' }))
      await waitFor(() => expect(window.system.exportDocument).toHaveBeenCalledWith(expect.objectContaining({
        format: 'html',
        html: expect.stringContaining('<table>'),
        defaultFilename: expect.stringMatching(/athena-conversation\.html$/),
      })))

      fireEvent.click(screen.getAllByTitle('Download message as PDF')[1])
      await waitFor(() => expect(window.system.exportDocument).toHaveBeenCalledWith(expect.objectContaining({
        format: 'pdf',
        html: expect.stringContaining('<table>'),
        defaultFilename: expect.stringMatching(/athena-message\.pdf$/),
      })))
      await waitFor(() => expect(window.system.saveChatHistory).toHaveBeenCalledWith(
        'n1',
        savedMessages,
        expect.objectContaining({
          title: 'Auth Service',
          kind: 'knowledge',
          context: expect.objectContaining({ selectedNodeId: 'n1', exploreDepth: 1 }),
        }),
      ))
      fireEvent.click(screen.getByRole('button', { name: /expand explore filters/i }))
      expect(screen.getByLabelText('Auth Service')).toBeChecked()
  })

  it('closes chat history without losing the selected node details', async () => {
    render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth' } })
    fireEvent.click((await screen.findAllByText('Auth Service'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /expand node details/i }))
    expect(await screen.findByText('Node Details')).toBeInTheDocument()

    window.dispatchEvent(new CustomEvent('knowledge-chat-history'))
    expect(await screen.findByText('Previous Knowledge Chats')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close previous chats/i }))

    expect(screen.getByText('Node Details')).toBeInTheDocument()
    expect(screen.getByText('Handles auth')).toBeInTheDocument()
  })

  it('restores node chats from local storage when the database thread index is unavailable', async () => {
    const messages = [
      { id: 'local-1', sender: 'user' as const, text: 'Locally saved auth question', timestamp: '2026-07-11T05:28:00.000Z' },
      { id: 'local-2', sender: 'assistant' as const, text: 'Locally saved auth answer', timestamp: '2026-07-11T05:28:01.000Z' },
    ]
    window.localStorage.setItem('savant_knowledge_chat_history_n1', JSON.stringify(messages))
    vi.mocked(window.system.loadAthenaThreads).mockResolvedValueOnce([])

    render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    window.dispatchEvent(new CustomEvent('knowledge-chat-history'))

    expect(await screen.findByText('Locally saved auth question')).toBeInTheDocument()
    expect(screen.getAllByText('Auth Service').length).toBeGreaterThan(0)
  })

  it('exports every node and edge when no nodes are selected', () => {
    const payload = {
      ...graphPayload,
      version: 1,
      nodes: graphPayload.nodes.map((node) => ({
        ...node,
        description: `${node.title} description`,
        workspace_id: 'workspace-1',
        metadata: { ...node.metadata, workspaces: ['workspace-1'], workspace_id: 'workspace-1' },
      })),
    }

    expect(buildKnowledgeExportPayload(payload, [])).toEqual({
      nodes: payload.nodes.map(({ workspace_id: _workspaceId, metadata, ...node }) => ({
        ...node,
        metadata: Object.fromEntries(
          Object.entries(metadata).filter(([key]) => key !== 'workspaces' && key !== 'workspace_id')
        ),
      })),
      edges: payload.edges,
    })
  })

  it('accepts downloaded graph payloads for upload', () => {
    const downloaded = buildKnowledgeExportPayload(graphPayload, [])
    expect(validateKnowledgeImportPayload(downloaded)).toEqual(downloaded)
    expect(() => validateKnowledgeImportPayload({ nodes: [] })).toThrow(/nodes and edges arrays/i)
    expect(() => validateKnowledgeImportPayload({
      nodes: [{ node_id: 'n3', node_type: 'concept' }],
      edges: [],
    })).toThrow(/Node 1 is missing required fields: title/i)
    expect(() => validateKnowledgeImportPayload({
      nodes: [],
      edges: [{ source_id: 'n1', target_id: 'n2' }],
    })).toThrow(/Edge 1 is missing required fields: edge_type/i)
  })

  it('keeps imported nodes in the canonical export format', () => {
    const importedNode = { node_id: 'n3', title: 'Imported Node', node_type: 'concept', description: 'Imported description' }
    const exported = buildKnowledgeExportPayload(
      { nodes: [...graphPayload.nodes, importedNode], edges: graphPayload.edges },
      ['n3']
    )

    expect(exported).toEqual({ nodes: [importedNode], edges: [] })
    expect(validateKnowledgeImportPayload(exported)).toEqual(exported)
  })

  it('uploads a downloaded graph payload to the import endpoint', async () => {
    const downloaded = buildKnowledgeExportPayload(graphPayload, [])
    await importKnowledgePayload('http://savant.local', 'sk-test', downloaded)

    expect(window.fetch).toHaveBeenCalledWith(
      'http://savant.local/api/knowledge/import',
      {
        method: 'POST',
        headers: { 'X-App-Name': 'savant-olympus', 'X-API-Key': 'sk-test', 'Content-Type': 'application/json' },
        body: JSON.stringify(downloaded),
      }
    )
  })

  it('falls back to the full graph when the export endpoint rejects an unscoped request', async () => {
    vi.mocked(window.fetch)
      .mockResolvedValueOnce({ ok: false, status: 422 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(graphPayload),
      } as Response)

    await expect(fetchKnowledgeExportData('http://savant.local', 'sk-test')).resolves.toEqual(graphPayload)
    expect(window.fetch).toHaveBeenNthCalledWith(
      2,
      'http://savant.local/api/knowledge/graph?slim=false&include_staged=true',
      { headers: { 'X-App-Name': 'savant-olympus', 'X-API-Key': 'sk-test' } }
    )
  })

  it('summarizes only new nodes and edges before import', () => {
    const diff = buildKnowledgeImportDiff(
      graphPayload.nodes,
      graphPayload.edges,
      {
        nodes: [
          graphPayload.nodes[0],
          { node_id: 'n3', title: 'New Node', node_type: 'concept' },
        ],
        edges: [
          graphPayload.edges[0],
          { edge_id: 'e3', source_id: 'n1', target_id: 'n3', edge_type: 'relates_to' },
        ],
      }
    )

    expect(diff.newNodes.map((node) => node.node_id)).toEqual(['n3'])
    expect(diff.newEdges.map((edge) => edge.edge_id)).toEqual(['e3'])
    expect(diff.existingNodeCount).toBe(1)
    expect(diff.existingEdgeCount).toBe(1)
  })

  it('infers domains through direct and one-intermediate relationships', () => {
    const domains = inferNodeDomains('n2', graphPayload.nodes, graphPayload.edges)
    expect(domains.map(({ node, distance }) => [node.node_id, distance])).toEqual([['d1', 2]])
  })

  it('builds chat context for multiple selections within the same filter type', () => {
    const nodes = [
      { node_id: 'p1', title: 'Person One', node_type: 'person' },
      { node_id: 'p2', title: 'Person Two', node_type: 'person' },
      { node_id: 'n1', title: 'Shared News', node_type: 'insight' },
    ]
    const edges = [
      { source_id: 'p1', target_id: 'n1', edge_type: 'relates_to' },
      { source_id: 'p2', target_id: 'n1', edge_type: 'relates_to' },
    ]

    const context = buildFilteredKnowledgeContext(
      { person: new Set(['p1', 'p2']) },
      nodes,
      edges,
      1
    )

    expect(context?.nodes.map((node) => node.node_id).sort()).toEqual(['n1', 'p1', 'p2'])
    expect(context?.edges).toHaveLength(2)
  })

  it('builds chat context for a single filter selection', () => {
    const context = buildFilteredKnowledgeContext(
      { person: new Set(['p1']) },
      [
        { node_id: 'p1', title: 'Person One', node_type: 'person' },
        { node_id: 'n1', title: 'Related News', node_type: 'insight' },
      ],
      [{ source_id: 'p1', target_id: 'n1', edge_type: 'relates_to' }],
      1
    )

    expect(context?.nodes.map((node) => node.node_id).sort()).toEqual(['n1', 'p1'])
    expect(context?.edges).toHaveLength(1)
  })

  it('keeps insights in the visible-node list but hides them from canvas and Athena until requested', () => {
    const context = {
      nodes: [
        { node_id: 'p1', title: 'Person One', node_type: 'person' },
        { node_id: 'i1', title: 'Private signal', node_type: 'insight' },
      ],
      edges: [{ source_id: 'p1', target_id: 'i1', edge_type: 'relates_to' }],
      scopeId: 'filtered-context-1',
    }

    const hidden = deriveKnowledgeVisibility(context, false)
    expect(hidden.listedNodes.map((node) => node.node_id)).toEqual(['p1', 'i1'])
    expect(hidden.visualNodes.map((node) => node.node_id)).toEqual(['p1'])
    expect(hidden.visualEdges).toEqual([])
    expect(hidden.hiddenInsightCount).toBe(1)

    const revealed = deriveKnowledgeVisibility(context, true)
    expect(revealed.visualNodes.map((node) => node.node_id)).toEqual(['p1', 'i1'])
    expect(revealed.visualEdges).toHaveLength(1)
    expect(revealed.hiddenInsightCount).toBe(0)
  })

  it('reveals listed insights on the canvas only after explicit request', async () => {
    currentGraphPayload = {
      nodes: [
        ...graphPayload.nodes,
        { node_id: 'i1', title: 'Private signal', node_type: 'insight', content: 'Sensitive insight', status: 'committed', metadata: {} },
      ],
      edges: [
        ...graphPayload.edges,
        { edge_id: 'e3', source_id: 'd1', target_id: 'i1', edge_type: 'contains', weight: 1 },
      ],
    }
    const { container } = render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth' } })
    fireEvent.click((await screen.findAllByText('Auth Service'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /expand node details/i }))

    expect(screen.getByText('Visible nodes (4)')).toBeInTheDocument()
    expect(screen.getAllByText('Private signal').length).toBeGreaterThan(0)
    expect(screen.getByText(/Insights listed, canvas hidden/i)).toBeInTheDocument()
    const insightNode = container.querySelector('g.node[data-node-id="i1"]')
    expect(insightNode).toHaveAttribute('opacity', '0')
    const depthControls = screen.getByText('DEPTH').parentElement!
    expect(within(depthControls).getByRole('button', { name: 'Show insights' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ask athena/i }))
    fireEvent.change(screen.getByPlaceholderText('Ask ATHENA about this node...'), {
      target: { value: 'Summarize what is visible.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ASK' }))
    await waitFor(() => expect(window.ipcRenderer.invoke).toHaveBeenCalledTimes(1))
    expect(vi.mocked(window.ipcRenderer.invoke).mock.calls[0][1].prompt).not.toContain('Private signal')

    fireEvent.click(screen.getByRole('button', { name: 'Show insights' }))

    await waitFor(() => expect(insightNode).toHaveAttribute('opacity', '1'))
    expect(screen.getByRole('button', { name: 'Hide insights' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByPlaceholderText('Ask ATHENA about this node...'), {
      target: { value: 'Now include visible insights.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ASK' }))
    await waitFor(() => expect(window.ipcRenderer.invoke).toHaveBeenCalledTimes(2))
    expect(vi.mocked(window.ipcRenderer.invoke).mock.calls[1][1].prompt).toContain('Private signal')
  })

  it('loads and renders graph nodes, filters search, and shows selected details', async () => {
    render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)

    expect(await screen.findByText('Knowledge Network')).toBeInTheDocument()
    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/knowledge/graph'), expect.objectContaining({ headers: { 'X-App-Name': 'savant-olympus', 'X-API-Key': 'sk-test' } })))
    const graphSvg = document.querySelector('#kb-graph-svg') as SVGSVGElement & { __zoom?: { k: number; x: number; y: number } }
    await waitFor(() => expect(graphSvg.__zoom).toMatchObject({ k: 1.7, x: -110, y: -90 }))

    expect(screen.queryByText('Node Details')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth' } })
    const searchHits = await screen.findAllByText('Auth Service')
    fireEvent.click(searchHits[0])

    await waitFor(() => expect(screen.getByRole('button', { name: /expand node details/i })).toBeInTheDocument())
    expect(screen.queryByText('Node Details')).not.toBeInTheDocument()
    expect(screen.getByText('DETAILS')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /expand node details/i }))
    expect(screen.getByRole('button', { name: /expand explore filters/i })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Node Details')).toBeInTheDocument())
    const connectionsSection = screen.getByText('CONNECTIONS').parentElement as HTMLElement
    expect(connectionsSection).toBeTruthy()
    expect(connectionsSection).toHaveTextContent('uses')
    expect(connectionsSection).toHaveTextContent('Postgres')
    expect(screen.getByText('Handles auth')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /go to postgres/i }))
    expect(await screen.findByText('Database')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /collapse node details/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /expand node details/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /expand explore filters/i }))
    expect(screen.getByRole('button', { name: /expand node details/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /collapse explore filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /expand node details/i }))
    await waitFor(() => expect(screen.getByText('Node Details')).toBeInTheDocument())
  })

  it('renders domains only as areas and searches them through their members', async () => {
    const { container } = render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)

    await screen.findByText('Knowledge Network')
    expect(screen.getByText('EXPLORE')).toBeInTheDocument()
    expect(screen.getByText('3 Nodes · 2 Edges')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view all/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /collapse explore filters/i }))
    expect(screen.getByRole('button', { name: /expand explore filters/i })).toBeInTheDocument()
    expect(screen.getByText('FILTER')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /expand explore filters/i }))
    fireEvent.change(screen.getByPlaceholderText('Filter all node types...'), { target: { value: 'Postgres' } })
    expect(screen.queryByRole('button', { name: /services/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /technologys/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear explore filter/i }))
    await waitFor(() => expect(container.querySelectorAll('g.node')).toHaveLength(1))
    expect(container.querySelector('[data-domain-id="d1"].domain-area')).toBeInTheDocument()
    expect(screen.getByText('AUTH DOMAIN')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth Domain' } })
    fireEvent.click(await screen.findByText('Auth Domain'))

    expect(await screen.findByRole('button', { name: /expand node details/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /expand node details/i }))
    expect(await screen.findByText('Node Details')).toBeInTheDocument()
    expect(screen.getAllByText('Auth Domain').length).toBeGreaterThan(0)
    expect(screen.getByText('Visible nodes (3)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ask athena/i }))
    fireEvent.change(screen.getByPlaceholderText('Ask ATHENA about this node...'), {
      target: { value: 'What belongs to this domain?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ASK' }))
    await waitFor(() => {
      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
        'run-agent',
        expect.objectContaining({
          prompt: expect.stringContaining('Authentication boundary'),
        })
      )
    })
    await waitFor(() => {
      expect(container.querySelector('[data-domain-id="d1"].domain-area')).toHaveAttribute('stroke-width', '3')
    })
  })

  it('chats with all nodes and edges visible from multiple filters', async () => {
    render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.click(screen.getByRole('button', { name: /services/i }))
    fireEvent.click(screen.getByLabelText('Auth Service'))
    fireEvent.click(screen.getByRole('button', { name: /technologys/i }))
    fireEvent.click(screen.getByLabelText('Postgres'))

    fireEvent.click(await screen.findByRole('button', { name: /expand node details/i }))
    expect(screen.getByText('Filtered Context')).toBeInTheDocument()
    expect(screen.getByText('3 nodes · 2 edges')).toBeInTheDocument()
    expect(screen.getAllByText('Auth Service').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Postgres').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /ask athena/i }))
    fireEvent.change(screen.getByPlaceholderText('Ask ATHENA about these filtered nodes...'), {
      target: { value: 'Summarize this filtered graph.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ASK' }))

    await waitFor(() => {
      expect(window.ipcRenderer.invoke).toHaveBeenCalledWith(
        'run-agent',
        expect.objectContaining({
          prompt: expect.stringMatching(/FILTERED GRAPH CONTEXT[\s\S]*Auth Service[\s\S]*Postgres[\s\S]*d1 --\[contains\]--> n1/),
        })
      )
    })
  })

  it('creates a new knowledge node and reloads the graph', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)

    await screen.findByText('Knowledge Network')
    await waitFor(() => window.dispatchEvent(new CustomEvent('knowledge-add-node')))
    await waitFor(() => expect(screen.getByText('Node Title')).toBeInTheDocument())
    const titleInput = screen.getByText('Node Title').parentElement?.querySelector('input') as HTMLInputElement
    const contentInput = screen.getByText('Content').parentElement?.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(titleInput, { target: { value: 'New Insight' } })
    fireEvent.change(contentInput, { target: { value: 'New content' } })
    fireEvent.click(screen.getByRole('button', { name: /create_node/i }))

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith('http://savant.local/api/knowledge/nodes', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'sk-test', 'Content-Type': 'application/json' }),
      }))
    })
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/knowledge/graph'), expect.anything())
  })

  it('supports type filters and graph maintenance actions', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.click(screen.getByRole('button', { name: /services/i }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Auth Service' }))
    await waitFor(() => {
      const serviceNode = Array.from(document.querySelectorAll<SVGGElement>('.node'))
        .find((node: any) => node.__data__?.node_type === 'service')
      expect(serviceNode).toHaveAttribute('opacity', '1')
    })

    window.dispatchEvent(new CustomEvent('knowledge-reload'))
    window.dispatchEvent(new CustomEvent('knowledge-purge'))

    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith('http://savant.local/api/knowledge/purge-workspace', expect.objectContaining({ method: 'POST' })))
  })

  it('allows selecting multiple domains from the left filter', async () => {
    const defaultFetch = vi.mocked(window.fetch).getMockImplementation()!
    vi.mocked(window.fetch).mockImplementation((url, init) => {
      if (url.toString().includes('/api/knowledge/graph')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            nodes: [
              ...graphPayload.nodes,
              { node_id: 'd2', title: 'Data Domain', node_type: 'domain', content: 'Data boundary', status: 'committed', metadata: {} },
            ],
            edges: [
              ...graphPayload.edges,
              { edge_id: 'e3', source_id: 'd2', target_id: 'n2', edge_type: 'contains', weight: 1 },
            ],
          }),
        } as Response)
      }
      return defaultFetch(url, init)
    })

    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.click(screen.getByRole('button', { name: /domains/i }))
    const authDomain = await screen.findByRole('checkbox', { name: 'Auth Domain' })
    const dataDomain = await screen.findByRole('checkbox', { name: 'Data Domain' })

    fireEvent.click(authDomain)
    fireEvent.click(dataDomain)

    expect(authDomain).toBeChecked()
    expect(dataDomain).toBeChecked()
  })

  it('includes person in the node type selectors', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)

    await screen.findByText('Knowledge Network')
    window.dispatchEvent(new CustomEvent('knowledge-add-node'))
    await screen.findByText('ADD NODE')

    expect(screen.getAllByRole('option', { name: 'person' }).length).toBeGreaterThan(0)
  })

  it('allows editing a node title and type', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" isAdmin={true} />)
    await screen.findByText('Knowledge Network')

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth' } })
    fireEvent.click((await screen.findAllByText('Auth Service'))[0])
    fireEvent.click(await screen.findByRole('button', { name: /expand node details/i }))

    const titleInput = screen.getByPlaceholderText('Node title') as HTMLInputElement
    const typeSelect = screen.getByDisplayValue('service') as HTMLSelectElement
    fireEvent.change(titleInput, { target: { value: 'Auth Gateway' } })
    fireEvent.change(typeSelect, { target: { value: 'domain' } })
    fireEvent.click(screen.getByRole('button', { name: /update/i }))

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        'http://savant.local/api/knowledge/nodes/n1',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ 'Content-Type': 'application/json', 'X-API-Key': 'sk-test' }),
          body: JSON.stringify({ title: 'Auth Gateway', node_type: 'domain' }),
        })
      )
    })
  })

  it('shows inferred domains next to the selected node type', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Postgres' } })
    fireEvent.click(await screen.findByText('Postgres'))
    fireEvent.click(await screen.findByRole('button', { name: /expand node details/i }))

    expect(await screen.findByText('DOMAIN: Auth Domain')).toBeInTheDocument()
    expect(screen.getByText('DOMAIN: Auth Domain')).toHaveAttribute('title', 'Inferred 2 hops away')
  })
})
