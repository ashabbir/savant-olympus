import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentSetupView } from '../components/tabs/AgentSetupView'

const mockReport = {
  timestamp: '2026-09-20T12:00:00Z',
  serverUrl: 'http://127.0.0.1:8090',
  summary: {
    total: 4,
    configured: 1,
    partial: 2,
    notConfigured: 1,
  },
  agents: {
    copilot: {
      provider: 'copilot',
      label: 'GitHub Copilot',
      description: 'GitHub Copilot Chat, CLI, and Agent Mode integration',
      presencePath: '~/.copilot',
      present: true,
      status: 'partial',
      parts: [
        {
          id: 'mcp',
          label: 'MCP Knowledge Bridge',
          configured: true,
          path: '~/.copilot/mcp.json',
          details: 'SSE connection to Savant Knowledge (port 8094) & Context (port 8093)',
        },
        {
          id: 'instructions',
          label: 'Learning Protocol Instructions',
          configured: false,
          path: '~/.copilot/copilot-instructions.md',
          details: 'Mandates posting durable insights & bug root causes to Savant Knowledge',
        },
        {
          id: 'skills',
          label: 'Savant Default Skills',
          configured: true,
          path: '~/.copilot/skills/',
          details: 'savant-knowledge-commit, savant-code-analysis, savant-session-workspace',
        },
        {
          id: 'hook',
          label: 'Fallback Learning Hook',
          configured: false,
          path: '~/.copilot/record-learning.sh',
          details: 'CLI curl wrapper for posting learnings directly to Savant Knowledge API',
        },
      ],
      lastChecked: '2026-09-20T12:00:00Z',
    },
    claude: {
      provider: 'claude',
      label: 'Claude Code / Desktop',
      description: 'Anthropic Claude Code CLI & Desktop Agent integration',
      presencePath: '~/.claude',
      present: true,
      status: 'configured',
      parts: [
        {
          id: 'mcp',
          label: 'MCP Knowledge Bridge',
          configured: true,
          path: '~/.claude/claude_desktop_config.json',
          details: 'SSE connection to Savant Knowledge (port 8094) & Context (port 8093)',
        },
        {
          id: 'instructions',
          label: 'Learning Protocol Instructions',
          configured: true,
          path: '~/.claude/CLAUDE.md',
          details: 'Mandates posting durable insights & bug root causes to Savant Knowledge',
        },
        {
          id: 'skills',
          label: 'Savant Default Skills',
          configured: true,
          path: '~/.claude/skills/',
          details: 'savant-knowledge-commit, savant-code-analysis, savant-session-workspace',
        },
        {
          id: 'hook',
          label: 'Fallback Learning Hook',
          configured: true,
          path: '~/.claude/record-learning.sh',
          details: 'CLI curl wrapper for posting learnings directly to Savant Knowledge API',
        },
      ],
      lastChecked: '2026-09-20T12:00:00Z',
    },
    hermes: {
      provider: 'hermes',
      label: 'Hermes Agent',
      description: 'Hermes autonomous agent execution runtime',
      presencePath: '~/.hermes',
      present: true,
      status: 'not_configured',
      parts: [
        {
          id: 'mcp',
          label: 'MCP Knowledge Bridge',
          configured: false,
          path: '~/.hermes/mcp.json',
          details: 'SSE connection to Savant Knowledge (port 8094) & Context (port 8093)',
        },
        {
          id: 'instructions',
          label: 'Learning Protocol Instructions',
          configured: false,
          path: '~/.hermes/instructions.md',
          details: 'Mandates posting durable insights & bug root causes to Savant Knowledge',
        },
        {
          id: 'skills',
          label: 'Savant Default Skills',
          configured: false,
          path: '~/.hermes/skills/custom/',
          details: 'savant-knowledge-commit, savant-code-analysis, savant-session-workspace',
        },
        {
          id: 'hook',
          label: 'Fallback Learning Hook',
          configured: false,
          path: '~/.hermes/record-learning.sh',
          details: 'CLI curl wrapper for posting learnings directly to Savant Knowledge API',
        },
      ],
      lastChecked: '2026-09-20T12:00:00Z',
    },
    codex: {
      provider: 'codex',
      label: 'Codex Agent',
      description: 'Codex CLI & OpenAI developer environment',
      presencePath: '~/.codex',
      present: false,
      status: 'not_configured',
      parts: [
        {
          id: 'mcp',
          label: 'MCP Knowledge Bridge',
          configured: false,
          path: '~/.codex/mcp.json',
          details: 'SSE connection to Savant Knowledge (port 8094) & Context (port 8093)',
        },
        {
          id: 'instructions',
          label: 'Learning Protocol Instructions',
          configured: false,
          path: '~/.codex/instructions.md',
          details: 'Mandates posting durable insights & bug root causes to Savant Knowledge',
        },
        {
          id: 'skills',
          label: 'Savant Default Skills',
          configured: false,
          path: '~/.codex/skills/',
          details: 'savant-knowledge-commit, savant-code-analysis, savant-session-workspace',
        },
        {
          id: 'hook',
          label: 'Fallback Learning Hook',
          configured: false,
          path: '~/.codex/record-learning.sh',
          details: 'CLI curl wrapper for posting learnings directly to Savant Knowledge API',
        },
      ],
      lastChecked: '2026-09-20T12:00:00Z',
    },
  },
}

describe('AgentSetupView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'fetch').mockImplementation((url, init) => {
      const u = url.toString()
      const method = init?.method || 'GET'

      if (u.includes('/api/agents/setup/status')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockReport),
        } as Response)
      }

      if (u.includes('/api/agents/setup/trigger') && method === 'POST') {
        const body = JSON.parse((init?.body as string) || '{}')
        const updatedReport = JSON.parse(JSON.stringify(mockReport))
        const p = body.provider || 'copilot'
        if (p === 'all') {
          Object.keys(updatedReport.agents).forEach(k => {
            updatedReport.agents[k].status = 'configured'
            updatedReport.agents[k].parts.forEach((pt: any) => { pt.configured = true })
          })
          updatedReport.summary.configured = 4
          updatedReport.summary.partial = 0
          updatedReport.summary.notConfigured = 0
        } else if (updatedReport.agents[p]) {
          updatedReport.agents[p].status = 'configured'
          updatedReport.agents[p].parts.forEach((pt: any) => { pt.configured = true })
          updatedReport.summary.configured++
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            provider: p,
            configuredParts: [`${p}:mcp`, `${p}:instructions`, `${p}:skills`, `${p}:hook`],
            report: updatedReport,
          }),
        } as Response)
      }

      if ((u.includes('/api/knowledge/nodes') || u.includes('/api/knowledge/experiences') || u.includes('/api/experiences')) && method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ id: 'exp_test_123', status: 'created' }),
        } as Response)
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)
    })
  })

  it('renders header, metrics banner, and all 4 supported agents', async () => {
    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    // Header checks
    expect(await screen.findByText(/AGENT SETUP/i)).toBeInTheDocument()
    expect(screen.getByText(/Configure Model Context Protocol/i)).toBeInTheDocument()

    // 4 Agents checks
    expect(await screen.findByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Claude Code / Desktop')).toBeInTheDocument()
    expect(screen.getByText('Hermes Agent')).toBeInTheDocument()
    expect(screen.getByText('Codex Agent')).toBeInTheDocument()
  })

  it('displays parts breakdown and statuses for Copilot', async () => {
    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await screen.findByText('GitHub Copilot')

    // Verify the parts labels are displayed
    const mcpLabels = screen.getAllByText('MCP Knowledge Bridge')
    expect(mcpLabels.length).toBeGreaterThanOrEqual(1)

    const instructionsLabels = screen.getAllByText('Learning Protocol Instructions')
    expect(instructionsLabels.length).toBeGreaterThanOrEqual(1)

    const skillsLabels = screen.getAllByText('Savant Default Skills')
    expect(skillsLabels.length).toBeGreaterThanOrEqual(1)

    const hookLabels = screen.getAllByText('Fallback Learning Hook')
    expect(hookLabels.length).toBeGreaterThanOrEqual(1)

    // Verify Copilot specific paths
    expect(screen.getByText('~/.copilot/copilot-instructions.md')).toBeInTheDocument()
    expect(screen.getByText('~/.copilot/record-learning.sh')).toBeInTheDocument()
  })

  it('triggers setup for Copilot and updates status', async () => {
    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await screen.findByText('GitHub Copilot')

    // Find the button for Copilot
    const triggerCopilotBtn = screen.getByRole('button', { name: /SETUP FOR COPILOT/i })
    expect(triggerCopilotBtn).toBeInTheDocument()

    fireEvent.click(triggerCopilotBtn)

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/agents/setup/trigger'),
        expect.objectContaining({
          method: 'POST',
          // Streamable HTTP is the default, while the selector below covers SSE compatibility.
          body: expect.stringMatching(/"provider":"copilot".*"transport":"streamable-http"/),
        })
      )
    })
  })

  it('lets the user choose SSE again before rewiring an agent', async () => {
    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await screen.findByText('GitHub Copilot')
    fireEvent.change(screen.getByLabelText(/MCP transport/i), { target: { value: 'sse' } })
    fireEvent.click(screen.getByRole('button', { name: /SETUP FOR COPILOT/i }))

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/agents/setup/trigger'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"transport":"sse"'),
        })
      )
    })
  })

  it('triggers setup for all agents via header button', async () => {
    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await screen.findByText('GitHub Copilot')

    const triggerAllBtn = screen.getByRole('button', { name: /TRIGGER ALL SETUPS/i })
    expect(triggerAllBtn).toBeInTheDocument()

    fireEvent.click(triggerAllBtn)

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/agents/setup/trigger'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"provider":"all"'),
        })
      )
    })
  })

  it('opens test ingestion modal and submits test learning', async () => {
    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    const testBtn = await screen.findByRole('button', { name: /TEST INGESTION/i })
    fireEvent.click(testBtn)

    expect(screen.getByText('Test Learning Ingestion')).toBeInTheDocument()

    const submitBtn = screen.getByRole('button', { name: /POST TO KNOWLEDGE/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/knowledge/'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Agent Setup Verification'),
        })
      )
    })
  })

  it('hides disabled agents and only shows enabled agents based on agents:enabledList', async () => {
    (window as any).system.getSettings = vi.fn().mockResolvedValue({
      'agents:enabledList': ['claude', 'codex'],
    })

    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await screen.findByText('Claude Code / Desktop')
    expect(screen.getByText('Codex Agent')).toBeInTheDocument()
    expect(screen.queryByText('GitHub Copilot')).not.toBeInTheDocument()
    expect(screen.queryByText('Hermes Agent')).not.toBeInTheDocument()
  })

  it('shows empty state when all external agent providers are disabled', async () => {
    (window as any).system.getSettings = vi.fn().mockResolvedValue({
      'agents:enabledList': [],
    })

    render(<AgentSetupView serverUrl="http://127.0.0.1:8090" apiKey="test-key" />)

    await screen.findByText('No Agents Enabled')
    expect(screen.queryByText('Claude Code / Desktop')).not.toBeInTheDocument()
    expect(screen.queryByText('GitHub Copilot')).not.toBeInTheDocument()
  })

  it('buildUserMcpConfig formats valid JSON, TOML, and YAML with correct transport types and role restrictions', async () => {
    const { buildUserMcpConfig } = await import('../services/agentSetupService')
    
    // 1. Claude (JSON format) with streamable-http -> uses client type "http", not "streamable-http"
    const jsonHttp = buildUserMcpConfig('claude', 'sk-test-123', 'http://127.0.0.1:8090', undefined, 'streamable-http', 'operator')
    const parsedHttp = JSON.parse(jsonHttp)
    expect(parsedHttp.mcpServers['savant-knowledge'].url).toBe('http://127.0.0.1:8194/mcp?api_key=sk-test-123&app_name=savant-mcp')
    expect(parsedHttp.mcpServers['savant-context'].url).toBe('http://127.0.0.1:8193/mcp?api_key=sk-test-123&app_name=savant-mcp')
    expect(parsedHttp.mcpServers['savant-abilities'].url).toBe('http://127.0.0.1:8192/mcp?api_key=sk-test-123&app_name=savant-mcp')
    expect(parsedHttp.mcpServers['savant-workspace'].url).toBe('http://127.0.0.1:8191/mcp?api_key=sk-test-123&app_name=savant-mcp')
    expect(parsedHttp.mcpServers['savant-knowledge'].type).toBe('http')

    // 2. Claude (JSON format) with SSE transport -> uses client type "sse"
    const jsonSse = buildUserMcpConfig('claude', 'sk-test-456', 'http://127.0.0.1:8090', undefined, 'sse', 'admin')
    const parsedSse = JSON.parse(jsonSse)
    expect(parsedSse.mcpServers['savant-knowledge'].url).toBe('http://127.0.0.1:8094/sse?api_key=sk-test-456&app_name=savant-mcp')
    expect(parsedSse.mcpServers['savant-abilities'].url).toBe('http://127.0.0.1:8092/sse?api_key=sk-test-456&app_name=savant-mcp')
    expect(parsedSse.mcpServers['savant-knowledge'].type).toBe('sse')

    // 3. Guest role restriction in JSON: ONLY savant-knowledge, no context, abilities, or workspace
    const jsonGuest = buildUserMcpConfig('claude', 'sk-guest-001', 'http://127.0.0.1:8090', undefined, 'streamable-http', 'guest')
    const parsedGuest = JSON.parse(jsonGuest)
    expect(parsedGuest.mcpServers['savant-knowledge']).toBeDefined()
    expect(parsedGuest.mcpServers['savant-context']).toBeUndefined()
    expect(parsedGuest.mcpServers['savant-abilities']).toBeUndefined()
    expect(parsedGuest.mcpServers['savant-workspace']).toBeUndefined()

    // 4. Codex (TOML format)
    const tomlConfig = buildUserMcpConfig('codex', 'sk-codex-123', 'http://127.0.0.1:8090', undefined, 'streamable-http', 'operator')
    expect(tomlConfig).toContain('[mcp_servers.savant-knowledge]')
    expect(tomlConfig).toContain('[mcp_servers.savant-abilities]')
    expect(tomlConfig).toContain('url = "http://127.0.0.1:8194/mcp?api_key=sk-codex-123&app_name=savant-mcp"')
    expect(tomlConfig).toContain('url = "http://127.0.0.1:8192/mcp?api_key=sk-codex-123&app_name=savant-mcp"')

    // Guest role restriction in TOML: only savant-knowledge
    const tomlGuest = buildUserMcpConfig('codex', 'sk-guest-001', 'http://127.0.0.1:8090', undefined, 'streamable-http', 'guest')
    expect(tomlGuest).toContain('[mcp_servers.savant-knowledge]')
    expect(tomlGuest).not.toContain('savant-abilities')
    expect(tomlGuest).not.toContain('savant-context')
    expect(tomlGuest).not.toContain('savant-workspace')

    // 5. Hermes (YAML format)
    const yamlConfig = buildUserMcpConfig('hermes', 'sk-hermes-123', 'http://127.0.0.1:8090', undefined, 'streamable-http', 'operator')
    expect(yamlConfig).toContain('mcp_servers:')
    expect(yamlConfig).toContain('  savant-knowledge:')
    expect(yamlConfig).toContain('  savant-abilities:')
    expect(yamlConfig).toContain('    url: "http://127.0.0.1:8192/mcp?api_key=sk-hermes-123&app_name=savant-mcp"')

    // Guest role restriction in YAML: only savant-knowledge
    const yamlGuest = buildUserMcpConfig('hermes', 'sk-guest-001', 'http://127.0.0.1:8090', undefined, 'streamable-http', 'guest')
    expect(yamlGuest).toContain('  savant-knowledge:')
    expect(yamlGuest).not.toContain('savant-abilities')
    expect(yamlGuest).not.toContain('savant-context')

    // 6. Custom endpoints override
    const customEndpoints = {
      knowledge: 'https://remote.savant.ai/mcp',
      context: 'https://remote.savant.ai/context/mcp',
      workspace: 'https://remote.savant.ai/ws/mcp',
    }
    const jsonCustom = buildUserMcpConfig('claude', 'sk-test-789', 'http://127.0.0.1:8090', customEndpoints)
    const parsedCustom = JSON.parse(jsonCustom)
    expect(parsedCustom.mcpServers['savant-knowledge'].url).toContain('https://remote.savant.ai/mcp?api_key=sk-test-789')
  })
})
