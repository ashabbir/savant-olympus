import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KnowledgeView } from '../components/tabs/KnowledgeView'

const graphPayload = {
  nodes: [
    { node_id: 'n1', title: 'Auth Service', node_type: 'service', content: 'Handles auth', status: 'committed', metadata: { source: 'test' } },
    { node_id: 'n2', title: 'Postgres', node_type: 'technology', content: 'Database', status: 'staged', metadata: {} },
  ],
  edges: [
    { edge_id: 'e1', source_id: 'n1', target_id: 'n2', edge_type: 'uses', weight: 1 },
  ],
}

describe('KnowledgeView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.stubGlobal('alert', vi.fn())
    Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(HTMLDivElement.prototype, 'clientHeight', { configurable: true, value: 500 })
    vi.mocked(window.fetch).mockImplementation((url, init) => {
      const u = url.toString()
      if (u.includes('/api/knowledge/graph')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(graphPayload) } as Response)
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
      if (u.includes('/api/knowledge/nodes') && (init as RequestInit | undefined)?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ node_id: 'n3' }) } as Response)
      }
      if (u.includes('/api/knowledge/prune') || u.includes('/api/knowledge/purge-workspace')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response)
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
    })
  })

  it('loads and renders graph nodes, filters search, and shows selected details', async () => {
    render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)

    expect(await screen.findByText('Knowledge Network')).toBeInTheDocument()
    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/knowledge/graph'), expect.objectContaining({ headers: { 'X-API-Key': 'sk-test' } })))

    expect(screen.queryByText('Node Details')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth' } })
    const searchHits = await screen.findAllByText('Auth Service')
    fireEvent.click(searchHits[0])

    await waitFor(() => expect(screen.getByText('Node Details')).toBeInTheDocument())
    const connectionsSection = screen.getByText('CONNECTIONS').parentElement as HTMLElement
    expect(connectionsSection).toBeTruthy()
    expect(connectionsSection).toHaveTextContent('uses')
    expect(connectionsSection).toHaveTextContent('Postgres')
    expect(screen.getByText('Handles auth')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /collapse/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /open node details/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /open node details/i }))
    await waitFor(() => expect(screen.getByText('Node Details')).toBeInTheDocument())
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

  it('supports layer changes and graph maintenance actions', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.click(screen.getByRole('button', { name: 'service' }))
    window.dispatchEvent(new CustomEvent('knowledge-reload'))
    window.dispatchEvent(new CustomEvent('knowledge-purge'))

    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith('http://savant.local/api/knowledge/purge-workspace', expect.objectContaining({ method: 'POST' })))
  })

  it('includes person in the node type selectors', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)

    await screen.findByText('Knowledge Network')
    window.dispatchEvent(new CustomEvent('knowledge-add-node'))
    await screen.findByText('ADD NODE')

    expect(screen.getAllByRole('option', { name: 'person' }).length).toBeGreaterThan(0)
  })

  it('allows editing a node title and type', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)
    await screen.findByText('Knowledge Network')

    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth' } })
    fireEvent.click((await screen.findAllByText('Auth Service'))[0])

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
})
