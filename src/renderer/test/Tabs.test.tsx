import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToolsView } from '../components/tabs/ToolsView'
import { SkillsView } from '../components/tabs/SkillsView'
import { WorkspaceView } from '../components/tabs/WorkspaceView'
import { KnowledgeView } from '../components/tabs/KnowledgeView'
import { RightPanel } from '../components/RightPanel'
import { RemindersView } from '../components/tabs/RemindersView'

describe('ToolsView Component', () => {
  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/abilities/skills')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: "1", name: "automated_tests_auditor", description: "Audit codebase modifications with integration suites", status: "audited", rules_count: 5 },
            { id: "2", name: "d3_force_generator", description: "Construct D3.js knowledge network nodes", status: "unlocked", rules_count: 2 },
          ])
        } as Response)
      }
      if (u.includes('/api/abilities/tools') || u.includes('/api/mcp/tools')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            tools: [
              { name: "get_current_workspace", description: "Fetch the active workspace metadata and state" },
              { name: "list_workspaces", description: "Retrieve all available workspaces in the registry" },
            ]
          })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true })
      } as Response)
    })
  })

  it('allows searching, adding, and deleting tools', async () => {
    render(<ToolsView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)
    
    // Check initial tools render (fallback tools)
    await waitFor(() => {
      expect(screen.getByText(/get_current_workspace/i)).toBeInTheDocument()
    })

    // Search for a tool
    const searchInput = screen.getByPlaceholderText(/search tools.../i)
    fireEvent.change(searchInput, { target: { value: 'list_workspaces' } })
    expect(screen.getByText(/list_workspaces/i)).toBeInTheDocument()
    expect(screen.queryByText(/get_current_workspace/i)).not.toBeInTheDocument()

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })

    // Add a tool
    const addBtn = screen.getByText(/ADD_TOOL/i)
    fireEvent.click(addBtn)
    
    const nameInput = screen.getByPlaceholderText(/tool name/i)
    const descInput = screen.getByPlaceholderText(/description/i)
    fireEvent.change(nameInput, { target: { value: 'custom_mcp_tool' } })
    fireEvent.change(descInput, { target: { value: 'Custom desc' } })
    
    fireEvent.click(screen.getByText(/CREATE_TOOL/i))
    
    await waitFor(() => {
      expect(screen.getAllByText(/custom_mcp_tool/i).length).toBeGreaterThan(0)
    })

    // Delete a tool
    const customToolDiv = screen.getAllByText(/custom_mcp_tool/i)[0].closest('.group')
    expect(customToolDiv).toBeInTheDocument()
    const deleteBtn = customToolDiv?.querySelector('button[title="Delete tool"]')
    expect(deleteBtn).toBeInTheDocument()
    if (deleteBtn) {
      fireEvent.click(deleteBtn)
    }

    await waitFor(() => {
      expect(screen.queryAllByText(/custom_mcp_tool/i).length).toBe(0)
    })
  })
})

describe('SkillsView Component', () => {
  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/abilities/skills')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: "1", name: "automated_tests_auditor", description: "Audit codebase modifications with integration suites", status: "audited", rules_count: 5 },
            { id: "2", name: "d3_force_generator", description: "Construct D3.js knowledge network nodes", status: "unlocked", rules_count: 2 },
          ])
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true })
      } as Response)
    })
  })

  it('allows searching, uploading zip, selecting, and deleting skills', async () => {
    render(<SkillsView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    // Check initial skills render (fallback skills)
    await waitFor(() => {
      expect(screen.getByText(/automated_tests_auditor/i)).toBeInTheDocument()
    })

    // Search for skill
    const searchInput = screen.getByPlaceholderText(/search skills.../i)
    fireEvent.change(searchInput, { target: { value: 'tests_auditor' } })
    expect(screen.getByText(/automated_tests_auditor/i)).toBeInTheDocument()
    expect(screen.queryByText(/d3_force_generator/i)).not.toBeInTheDocument()

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })

    // Mock JSZip
    const JSZip = require('jszip')
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({
      files: {
        'metadata.json': {
          async: vi.fn().mockResolvedValue(JSON.stringify({
            name: 'new_savant_skill',
            description: 'Cool skill',
            status: 'unlocked'
          }))
        },
        'prompt.txt': {
          async: vi.fn().mockResolvedValue('System prompt content')
        },
        'schema.json': {
          async: vi.fn().mockResolvedValue('{}')
        },
        'index.js': {
          async: vi.fn().mockResolvedValue('// code')
        }
      }
    } as any)

    // Upload ZIP skill
    const file = new File(['mock zip binary'], 'new_savant_skill.zip', { type: 'application/zip' })
    const uploadInput = screen.getByTestId('upload-file-input')
    fireEvent.change(uploadInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getAllByText('new_savant_skill').length).toBeGreaterThan(0)
    })

    // Select skill to view details
    const skillListItems = screen.getAllByText('new_savant_skill')
    fireEvent.click(skillListItems[0])
    await waitFor(() => {
      expect(screen.getAllByText('new_savant_skill').length).toBeGreaterThan(1) // in list and details
    })

    // Delete skill
    const customSkillDiv = screen.getAllByText('new_savant_skill')[0].closest('.group')
    const deleteBtn = customSkillDiv?.querySelector('button[title="Delete skill"]')
    if (deleteBtn) {
      fireEvent.click(deleteBtn)
    }

    await waitFor(() => {
      expect(screen.queryAllByText('new_savant_skill').length).toBe(0)
    })
  })
})

describe('UsersView Component', () => {
  let mockUsers: any[] = []

  beforeEach(() => {
    mockUsers = [
      {
        id: "usr-1",
        username: "ahmed",
        name: "Ahmed Shabbir",
        email: "ahmed@savant.ai",
        role: "admin",
        active: true,
        api_keys: ["sk-ahmed-savant-001"]
      },
      {
        id: "usr-2",
        username: "lex",
        name: "Lex Friedman",
        email: "lex@savant.ai",
        role: "operator",
        active: true,
        api_keys: ["sk-lex-savant-001"]
      },
      {
        id: "usr-3",
        username: "inactive_admin",
        name: "Inactive Admin",
        email: "inactive_admin@savant.ai",
        role: "admin",
        active: false,
        api_keys: ["sk-inactive-admin-001"]
      },
      {
        id: "usr-4",
        username: "inactive_user",
        name: "Inactive User",
        email: "inactive_user@savant.ai",
        role: "operator",
        active: false,
        api_keys: ["sk-inactive-user-001"]
      }
    ]

    vi.spyOn(window, 'fetch').mockImplementation((url, options) => {
      const u = url.toString()
      const method = (options?.method || 'GET').toUpperCase()

      if (u.includes('/api/users')) {
        if (method === 'DELETE') {
          const userId = u.split('/').pop()
          mockUsers = mockUsers.map(user => 
            (user.id === userId || user.username === userId) ? { ...user, active: false } : user
          )
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, message: "User deactivated" })
          } as Response)
        }

        if (method === 'POST' && (u.endsWith('/api-key') || u.includes('/api-key?_') || u.includes('/api-key/'))) {
          const parts = u.split('/')
          const userId = parts[parts.length - 2]
          const newKey = "sk-regenerated-new-key-123"
          mockUsers = mockUsers.map(user => 
            (user.id === userId || user.username === userId) ? { ...user, api_key: newKey, api_keys: [newKey] } : user
          )
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ api_key: newKey })
          } as Response)
        }

        if (method === 'POST') {
          const body = options?.body ? JSON.parse(options.body.toString()) : {}
          const newUser = {
            id: `usr-${Date.now()}`,
            username: body.username,
            name: body.name,
            email: body.email,
            role: body.role,
            active: true,
            api_keys: ["sk-generated-key"]
          }
          mockUsers.push(newUser)
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(newUser)
          } as Response)
        }

        if (method === 'PUT') {
          const userId = u.split('/').pop()
          const body = options?.body ? JSON.parse(options.body.toString()) : {}
          let updatedUser: any = null
          mockUsers = mockUsers.map(user => {
            if (user.id === userId || user.username === userId) {
              updatedUser = {
                ...user,
                name: body.name,
                email: body.email,
                role: body.role
              }
              return updatedUser
            }
            return user
          })
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(updatedUser)
          } as Response)
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockUsers)
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true })
      } as Response)
    })
  })

  it('lists all users in the sidebar index', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
      expect(screen.getByText('Inactive Admin')).toBeInTheDocument()
      expect(screen.getByText('Inactive User')).toBeInTheDocument()
    })
  })

  it('allows creating a new user via the Create form', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
    })

    const addBtn = screen.getByRole('button', { name: /ADD_USER/i })
    fireEvent.click(addBtn)

    const usernameInput = screen.getByLabelText(/Username/i)
    const nameInput = screen.getByLabelText(/Full Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const roleSelect = screen.getByLabelText(/Role/i)

    fireEvent.change(usernameInput, { target: { value: 'steve' } })
    fireEvent.change(nameInput, { target: { value: 'Steve Jobs' } })
    fireEvent.change(emailInput, { target: { value: 'steve@apple.com' } })
    fireEvent.change(roleSelect, { target: { value: 'operator' } })

    const createBtn = screen.getByRole('button', { name: /CREATE_USER/i })
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(screen.getByText('Steve Jobs')).toBeInTheDocument()
      expect(screen.getByText('(steve)')).toBeInTheDocument()
    })
  })

  it('allows clicking a user and editing name, email, and role', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
    })

    const editBtn = screen.getAllByTitle('Edit user information')[0]
    fireEvent.click(editBtn)

    const nameInput = screen.getByLabelText(/Full Name/i) as HTMLInputElement
    const emailInput = screen.getByLabelText(/Email/i) as HTMLInputElement
    const roleSelect = screen.getByLabelText(/Role/i) as HTMLSelectElement

    fireEvent.change(nameInput, { target: { value: 'Ahmed Modified' } })
    fireEvent.change(emailInput, { target: { value: 'ahmed.mod@savant.ai' } })
    fireEvent.change(roleSelect, { target: { value: 'operator' } })

    const form = nameInput.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Modified')).toBeInTheDocument()
      expect(screen.getByText('ahmed.mod@savant.ai')).toBeInTheDocument()
      expect(screen.getAllByText('OPERATOR').length).toBeGreaterThan(0)
    })
  })

  it('allows deactivating/deleting a user', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
    })

    const deactivateBtns = screen.getAllByTitle('Deactivate user')
    fireEvent.click(deactivateBtns[0])

    await waitFor(() => {
      expect(screen.getAllByText('INACTIVE')[0]).toBeInTheDocument()
    })
  })

  it('allows regenerating API Key for a user', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
    })

    const regenBtns = screen.getAllByTitle('Regenerate API Key')
    fireEvent.click(regenBtns[0])

    await waitFor(() => {
      expect(screen.getByText('sk-regenerated-new-key-123')).toBeInTheDocument()
    })
  })
})

describe('AbilitiesView Component', () => {
  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/abilities/assets/persona.engineer')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            id: "persona.engineer",
            type: "persona",
            name: "Engineer Persona",
            priority: 100,
            tags: ["backend"],
            includes: ["rule.coding_style"],
            body: "# Engineer\nFocuses on robust coding standards.\n"
          })
        } as Response)
      }
      if (u.includes('/api/abilities/assets')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            persona: [
              { id: "persona.engineer", type: "persona", name: "Engineer Persona", priority: 100, tags: ["backend"] }
            ],
            rule: [
              { id: "rule.coding_style", type: "rule", name: "Coding Style Guide", priority: 200, tags: ["style"] }
            ]
          })
        } as Response)
      }
      if (u.includes('/api/abilities/resolve')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            manifest: {
              applied: {
                persona: "persona.engineer",
                rules: ["rule.coding_style"],
                policies: []
              }
            },
            prompt: "Compiled system prompt here"
          })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true, ok: true })
      } as Response)
    })
  })

  it('renders and supports browsing, editing, resolving prompt, and creating assets', async () => {
    const { AbilitiesView } = await import('../components/tabs/AbilitiesView')
    render(<AbilitiesView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    // Verify template categories list
    await waitFor(() => {
      expect(screen.getByText(/PERSONAS/i)).toBeInTheDocument()
      expect(screen.getByText(/RULES/i)).toBeInTheDocument()
    })

    // Click on Engineer Persona
    fireEvent.click(screen.getByText('Engineer Persona'))
    await waitFor(() => {
      expect(screen.getByText('persona.engineer')).toBeInTheDocument()
    })

    // Verify fields populated
    const bodyTextarea = screen.getByLabelText(/Body Prompt Blueprint/i) as HTMLTextAreaElement
    expect(bodyTextarea.value).toContain('Focuses on robust coding standards')

    // Test prompt resolver mode toggle
    window.dispatchEvent(new CustomEvent("abilities-resolver-toggle"))
    await waitFor(() => {
      expect(screen.getByText('PROMPT RESOLVER BUILDER')).toBeInTheDocument()
    })

    // Select persona in builder dropdown and click resolve
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'engineer' } })
    fireEvent.click(screen.getByText('RESOLVE PROMPT'))

    await waitFor(() => {
      const resolvedArea = screen.getByLabelText(/\/\/ Rendered Engineering Prompt/i) as HTMLTextAreaElement
      expect(resolvedArea.value).toBe('Compiled system prompt here')
    })

    // Switch back from resolver
    window.dispatchEvent(new CustomEvent("abilities-resolver-toggle"))
    await waitFor(() => {
      expect(screen.queryByText('PROMPT RESOLVER BUILDER')).not.toBeInTheDocument()
    })

    // Test typeahead include link
    const includeInput = screen.getByPlaceholderText(/Search asset dependencies.../i)
    fireEvent.change(includeInput, { target: { value: 'rule.coding' } })

    // Verify typeahead result visible and select it
    await waitFor(() => {
      expect(screen.getByText('rule.coding_style')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('rule.coding_style'))

    // Verify it added to active list dependencies
    await waitFor(() => {
      expect(screen.getByText('rule.coding_style').closest('.min-h-\\[30px\\]')).toBeInTheDocument()
    })
  })
})


describe('WorkspaceView Component', () => {
  it('renders and contains workspace identifiers', async () => {
    render(<WorkspaceView serverUrl="https://olympus-remote-server.com:443" apiKey="test-key" sessionId="sess-1" />)
    expect(screen.getByText(/SAVANT-WORKSPACE/i)).toBeInTheDocument()
  })
})

describe('RightPanel & KnowledgeView Events', () => {
  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/knowledge/graph')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ nodes: [], edges: [] })
        } as Response)
      }
      if (u.includes('/api/knowledge/export')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ nodes: [], edges: [] })
        } as Response)
      }
      if (u.includes('/api/knowledge/purge-workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true })
        } as Response)
      }
      if (u.includes('/api/knowledge/purge-workspace-preview')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            workspace_id: 'olympus',
            to_delete: 2,
            to_unlink: 1,
            delete_node_ids: ['node-1', 'node-2'],
            unlink_node_ids: ['node-3'],
          })
        } as Response)
      }
      if (u.includes('/api/knowledge/export')) {
        return Promise.resolve({
          ok: false,
          status: 422,
        } as Response)
      }
      if (u.includes('/api/knowledge/graph?slim=false')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            nodes: [{ node_id: 'n1', title: 'Node 1', node_type: 'concept', description: 'Full description' }],
            edges: [],
          })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true })
      } as Response)
    })
  })

  it('dispatches knowledge custom events from RightPanel', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    dispatchSpy.mockClear()
    
    render(
      <RightPanel 
        thinking={[]} 
        statusText="IDLE" 
        activeTab="Knowledge" 
        serverUrl="http://127.0.0.1:8090" 
        apiKey="test-key" 
        selectedProject={null} 
      />
    )

    // Verify Knowledge buttons exist
    const reloadBtn = screen.getByTitle("Reload Graph")
    fireEvent.click(reloadBtn)
    expect(dispatchSpy).toHaveBeenCalled()

    fireEvent.click(screen.getByTitle("Previous Chats"))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "knowledge-chat-history" }))
  })

  it('opens the knowledge add modal when the right rail add icon is clicked', async () => {
    render(<KnowledgeView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await waitFor(() => {
      expect(screen.queryByText(/CREATE_NODE/i)).not.toBeInTheDocument()
    })

    window.dispatchEvent(new CustomEvent("knowledge-add-node"))

    await waitFor(() => {
      expect(screen.getByText(/CREATE_NODE/i)).toBeInTheDocument()
    })
  })

  it('dispatches abilities custom events from RightPanel', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    dispatchSpy.mockClear()

    render(
      <RightPanel 
        thinking={[]} 
        statusText="IDLE" 
        activeTab="Abilities" 
        serverUrl="http://127.0.0.1:8090" 
        apiKey="test-key" 
        selectedProject={null} 
      />
    )

    // Verify Prompt Resolver toggle button exists
    const resolverBtn = screen.getByTitle("Prompt Resolver")
    fireEvent.click(resolverBtn)
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    expect(dispatchSpy.mock.calls[0][0].type).toBe("abilities-resolver-toggle")

    // Verify Validate button exists
    const validateBtn = screen.getByTitle("Validate Assets")
    fireEvent.click(validateBtn)
    expect(dispatchSpy.mock.calls[1][0].type).toBe("abilities-validate")

    // Verify Bootstrap button exists
    const bootstrapBtn = screen.getByTitle("Bootstrap Assets")
    fireEvent.click(bootstrapBtn)
    expect(dispatchSpy.mock.calls[2][0].type).toBe("abilities-bootstrap")
  })

  it('downloads the loaded knowledge graph', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch')
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL')
    fetchSpy.mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/knowledge/graph')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            nodes: [{ node_id: 'n1', title: 'Node 1', node_type: 'concept' }],
            edges: [],
          })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ nodes: [], edges: [] })
      } as Response)
    })

    render(<KnowledgeView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /concepts/i })).toBeInTheDocument()
    })
    window.dispatchEvent(new CustomEvent("knowledge-download"))

    await waitFor(() => {
      expect(createObjectURLSpy).toHaveBeenCalled()
    })
  })

  it('previews purge before deleting workspace knowledge', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch')
    fetchSpy.mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/knowledge/purge-workspace-preview')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            workspace_id: 'olympus',
            to_delete: 2,
            to_unlink: 1,
            delete_node_ids: ['node-1', 'node-2'],
            unlink_node_ids: ['node-3'],
          })
        } as Response)
      }
      if (u.includes('/api/knowledge/graph')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            nodes: [],
            edges: [
              { edge_id: 'edge-1', source_id: 'node-1', target_id: 'node-x', edge_type: 'relates_to' },
              { edge_id: 'edge-2', source_id: 'node-2', target_id: 'node-y', edge_type: 'uses' },
            ]
          })
        } as Response)
      }
      if (u.includes('/api/knowledge/purge-workspace')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ purged: true })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ nodes: [], edges: [] })
      } as Response)
    })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<KnowledgeView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    window.dispatchEvent(new CustomEvent("knowledge-purge"))

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('purge 2 nodes and 2 edges'))
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/knowledge/purge-workspace-preview'),
        expect.any(Object)
      )
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/knowledge/purge-workspace'),
        expect.any(Object)
      )
    })
  })
})

describe('RemindersView Component', () => {
  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/reminders')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { id: "rem-101", text: "Database clean up", description: "Clear temporary workspace databases", due_date: "2026-06-25T12:00:00Z", status: "pending", user_id: "ahmed" },
            { id: "rem-102", text: "Review user keys", description: "Audit active user API keys", due_date: "2026-06-28T15:00:00Z", status: "done", user_id: "lex" }
          ])
        } as Response)
      }
      if (u.includes('/api/users')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { user_id: "ahmed", name: "Ahmed Shabbir" },
            { user_id: "lex", name: "Lex Friedman" }
          ])
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true })
      } as Response)
    })
  })

  it('renders and supports filtering reminders by status', async () => {
    render(<RemindersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    // Wait for mock reminders to load
    await waitFor(() => {
      expect(screen.getByText('Database clean up')).toBeInTheDocument()
      expect(screen.getByText('Review user keys')).toBeInTheDocument()
    })

    // Click on PENDING status filter button
    const pendingFilterBtn = screen.getByRole('button', { name: /^PENDING$/i })
    fireEvent.click(pendingFilterBtn)

    // Verify list is filtered
    await waitFor(() => {
      expect(screen.getByText('Database clean up')).toBeInTheDocument()
      expect(screen.queryByText('Review user keys')).not.toBeInTheDocument()
    })

    // Click on ALL filter button to restore
    const allFilterBtn = screen.getByRole('button', { name: /^ALL$/i })
    fireEvent.click(allFilterBtn)

    // Verify all show up again
    await waitFor(() => {
      expect(screen.getByText('Database clean up')).toBeInTheDocument()
      expect(screen.getByText('Review user keys')).toBeInTheDocument()
    })
  })

  it('renders and supports filtering reminders by user', async () => {
    render(<RemindersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    // Wait for mock reminders to load
    await waitFor(() => {
      expect(screen.getByText('Database clean up')).toBeInTheDocument()
      expect(screen.getByText('Review user keys')).toBeInTheDocument()
    })

    // Verify user badges exist
    expect(screen.getByText('AHMED')).toBeInTheDocument()
    expect(screen.getByText('LEX')).toBeInTheDocument()

    // Find user filter select
    const userSelect = screen.getByLabelText(/Filter by user/i) as HTMLSelectElement
    expect(userSelect).toBeInTheDocument()

    // Filter by 'ahmed'
    fireEvent.change(userSelect, { target: { value: 'ahmed' } })

    await waitFor(() => {
      expect(screen.getByText('Database clean up')).toBeInTheDocument()
      expect(screen.queryByText('Review user keys')).not.toBeInTheDocument()
    })

    // Filter by 'lex'
    fireEvent.change(userSelect, { target: { value: 'lex' } })

    await waitFor(() => {
      expect(screen.queryByText('Database clean up')).not.toBeInTheDocument()
      expect(screen.getByText('Review user keys')).toBeInTheDocument()
    })

    // Reset filter
    fireEvent.change(userSelect, { target: { value: 'all' } })

    await waitFor(() => {
      expect(screen.getByText('Database clean up')).toBeInTheDocument()
      expect(screen.getByText('Review user keys')).toBeInTheDocument()
    })
  })
})
