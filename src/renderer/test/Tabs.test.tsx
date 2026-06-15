import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToolsView } from '../components/tabs/ToolsView'
import { SkillsView } from '../components/tabs/SkillsView'
import { WorkspaceView } from '../components/tabs/WorkspaceView'
import { RightPanel } from '../components/RightPanel'

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

  it('allows searching, adding, deleting, and selecting skills', async () => {
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

    // Add a skill
    fireEvent.click(screen.getByText(/ADD_SKILL/i))
    fireEvent.change(screen.getByPlaceholderText(/Skill Name/i), { target: { value: 'new_savant_skill' } })
    fireEvent.change(screen.getByPlaceholderText(/Description/i), { target: { value: 'Cool skill' } })
    
    const form = screen.getByPlaceholderText(/Skill Name/i).closest('form')
    if (form) {
      fireEvent.submit(form)
    } else {
      fireEvent.click(screen.getByText(/CREATE_SKILL/i))
    }

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
  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/auth/operators')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([
            { username: "ahmed", name: "Ahmed Shabbir", email: "ahmed@savant.ai", role: "admin", api_keys: ["sk-ahmed-savant-001"] }
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

  it('allows clicking an operator and editing name, key, email, and role', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    // Wait for operators list to load
    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
    })

    // Click edit button
    const editBtn = screen.getByTitle('Edit operator information')
    fireEvent.click(editBtn)

    // Edit fields
    const nameInput = screen.getByLabelText(/Full Name/i)
    const emailInput = screen.getByLabelText(/Email/i)
    const roleSelect = screen.getByLabelText(/Role/i)
    const keyInput = screen.getByLabelText(/API Key/i)

    fireEvent.change(nameInput, { target: { value: 'Ahmed Modified' } })
    fireEvent.change(emailInput, { target: { value: 'ahmed.mod@savant.ai' } })
    fireEvent.change(roleSelect, { target: { value: 'operator' } })
    fireEvent.change(keyInput, { target: { value: 'sk-new-key-123' } })

    // Click save
    fireEvent.click(screen.getByText(/SAVE/i))

    // Verify values updated in display
    await waitFor(() => {
      expect(screen.getByText('Ahmed Modified')).toBeInTheDocument()
      expect(screen.getByText('ahmed.mod@savant.ai')).toBeInTheDocument()
      expect(screen.getByText('OPERATOR')).toBeInTheDocument()
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
})
