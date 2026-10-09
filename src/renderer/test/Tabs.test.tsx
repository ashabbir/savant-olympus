import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillsView } from '../components/tabs/SkillsView'
import { WorkspaceView } from '../components/tabs/WorkspaceView'
import { KnowledgeView } from '../components/tabs/KnowledgeView'
import { RightPanel } from '../components/RightPanel'
import { RemindersView } from '../components/tabs/RemindersView'

describe('SkillsView Component', () => {
  beforeEach(() => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/skills')) {
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
    render(<SkillsView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

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

  it('reviews Athena suggested files before creating them on the server', async () => {
    vi.mocked(window.system.runAgentViaGateway).mockResolvedValueOnce(JSON.stringify({
      status: 'ready',
      name: 'summarize-releases',
      description: 'Summarize release history',
      rationale: 'A deterministic parser belongs in scripts.',
      files: [
        { path: 'SKILL.md', content: '---\nname: summarize-releases\ndescription: Summarize releases\n---\n' },
        { path: 'scripts/summarize.py', content: "print('ok')\n" },
      ],
    }))

    render(<SkillsView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)
    await waitFor(() => expect(screen.getByText(/automated_tests_auditor/i)).toBeInTheDocument())

    fireEvent.click(screen.getByText('CREATE WITH ATHENA'))
    fireEvent.change(screen.getByPlaceholderText(/Describe the workflow/i), {
      target: { value: 'Build a release summarizer' },
    })
    fireEvent.click(screen.getByText('FINALIZE & GENERATE'))

    await waitFor(() => expect(screen.getByText('scripts/summarize.py')).toBeInTheDocument())
    fireEvent.click(screen.getByText('CREATE ON SERVER'))

    await waitFor(() => expect(window.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/api/skills',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('scripts/summarize.py'),
      }),
    ))
  })

  it('installs a skill into a selected Hermes profile', async () => {
    vi.mocked(window.system.getSkillExportProfiles).mockResolvedValueOnce({
      codex: { label: 'Codex', directory: '/tmp/.codex/skills', format: 'Agent Skills / SKILL.md' },
      hermes: {
        label: 'Hermes',
        directory: '/tmp/.hermes/skills/custom',
        format: 'Hermes Agent Skill',
        profiles: [
          { id: 'default', label: 'Default', directory: '/tmp/.hermes/skills/custom' },
          { id: 'research', label: 'research', directory: '/tmp/.hermes/profiles/research/skills/custom' },
        ],
      },
    })

    render(<SkillsView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)
    await waitFor(() => expect(screen.getByText(/automated_tests_auditor/i)).toBeInTheDocument())

    fireEvent.click(screen.getByText('automated_tests_auditor'))
    fireEvent.click(screen.getByTitle('Download folder-preserving SKILL.md package'))
    await waitFor(() => expect(screen.getByText('Install skill for an agent')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Hermes' }))
    const profileSelect = screen.getByLabelText('Hermes profile')
    fireEvent.change(profileSelect, { target: { value: 'research' } })

    expect(screen.getByText('/tmp/.hermes/profiles/research/skills/custom')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'INSTALL FOR HERMES' }))
    await waitFor(() => expect(window.system.exportSkillPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'hermes',
        destinationRoot: '/tmp/.hermes/profiles/research/skills/custom',
      }),
    ))
  })

  it('shows Athena recommendation while asking a necessary question', async () => {
    vi.mocked(window.system.runAgentViaGateway).mockResolvedValueOnce(JSON.stringify({
      status: 'clarifying',
      question: 'Should the skill publish releases or only draft them?',
      suggestion: 'Draft by default so publishing remains an explicit human action.',
      assumptions: ['Git tags are the release source'],
    }))

    render(<SkillsView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)
    await waitFor(() => expect(screen.getByText(/automated_tests_auditor/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText('CREATE WITH ATHENA'))
    fireEvent.change(screen.getByPlaceholderText(/Describe the workflow/i), {
      target: { value: 'Build a release skill' },
    })
    fireEvent.click(screen.getByText('SEND MESSAGE'))

    await waitFor(() => expect(screen.getByText(/Draft by default so publishing remains an explicit human action/)).toBeInTheDocument())
    expect(screen.getByText(/Git tags are the release source/)).toBeInTheDocument()
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
      },
      {
        id: "usr-guest",
        username: "guest_bob",
        name: "Guest Bob",
        email: "bob@savant.ai",
        role: "guest",
        active: true,
        api_keys: ["sk-guest-bob-001"]
      }
    ]

    vi.spyOn(window, 'fetch').mockImplementation((url, options) => {
      const u = url.toString()
      const method = (options?.method || 'GET').toUpperCase()

      if (u.includes('/api/knowledge/graph')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            nodes: [
              { node_id: 'domain-1', title: 'Research', node_type: 'domain' },
              { node_id: 'domain-2', title: 'Operations', node_type: 'domain' },
              { node_id: 'domain-3', title: 'Legal', node_type: 'domain' },
            ]
          })
        } as Response)
      }

      if (u.includes('/api/users')) {
        if (u.includes('/leaderboard')) {
          const days = u.includes('days=30') ? 30 : 7;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              days,
              leaderboard: [
                {
                  user_id: 'usr-1',
                  name: 'Ahmed Shabbir',
                  role: 'admin',
                  is_active: true,
                  last_login_at: '2026-10-01T10:00:00+00:00',
                  has_logged_in: true,
                  points: 55,
                  knowledge_additions: 3,
                  knowledge_lookups: 3,
                  research: 2,
                  search: 5,
                  other_tool_calls: 2,
                  total_activity_count: 13,
                  rank: 1,
                },
                {
                  user_id: 'usr-2',
                  name: 'Lex Friedman',
                  role: 'operator',
                  is_active: true,
                  last_login_at: '2026-09-30T21:15:00+00:00',
                  has_logged_in: true,
                  points: 24,
                  knowledge_additions: 1,
                  knowledge_lookups: 1,
                  research: 1,
                  search: 2,
                  other_tool_calls: 0,
                  total_activity_count: 5,
                  rank: 2,
                },
                {
                  user_id: 'usr-3',
                  name: 'Inactive User',
                  role: 'guest',
                  is_active: false,
                  last_login_at: null,
                  has_logged_in: false,
                  points: 0,
                  knowledge_additions: 0,
                  knowledge_lookups: 0,
                  research: 0,
                  search: 0,
                  other_tool_calls: 0,
                  total_activity_count: 0,
                  rank: 3,
                },
              ],
            }),
          } as Response);
        }
        if (u.includes('/contributions')) {

          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              user_id: 'usr-2',
              node_count: 7,
              committed_count: 5,
              staged_count: 2,
              latest_created_at: '2026-09-30T21:15:00+00:00',
              by_type: [
                { node_type: 'insight', node_count: 4 },
                { node_type: 'service', node_count: 3 },
              ],
            }),
          } as Response)
        }
        if (u.includes('/usage')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              user_id: 'usr-2',
              days: 30,
              last_login_at: '2026-09-30T21:15:00+00:00',
              total_calls: 18,
              tools: [
                { mcp_server: 'savant-context', tool_name: 'research', calls: 12, active_days: 2, avg_calls_per_active_day: 6, last_called_at: '2026-09-30T21:10:00+00:00' },
                { mcp_server: 'savant-knowledge', tool_name: 'search', calls: 6, active_days: 3, avg_calls_per_active_day: 2, last_called_at: '2026-09-29T10:00:00+00:00' },
              ],
              daily: [],
              logins_per_day: [
                { day: '2026-09-30', logins: 3 },
                { day: '2026-09-29', logins: 1 },
              ],
              projects: [
                { project_type: 'repo', project: 'icn', project_name: 'icn', calls: 9, active_days: 2, last_used_at: '2026-09-30T21:10:00+00:00' },
                { project_type: 'workspace', project: '17791265844502783839305', project_name: 'Data Sync', calls: 4, active_days: 1, last_used_at: '2026-09-30T20:00:00+00:00' },
              ],
              recent_queries: [
                { mcp_server: 'savant-context', tool_name: 'research', query: 'kafka consumer retries', repo: 'icn', created_at: '2026-09-30T21:10:00+00:00' },
              ]
            })
          } as Response)
        }

        if (u.includes('/domains')) {
          const domains = method === 'GET' && u.includes('/usr-2/')
            ? [{ domain_node_id: 'domain-1', domain_title: 'Research', can_write: 1 }]
            : []
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(domains)
          } as Response)
        }

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
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
      expect(screen.getByText('Inactive Admin')).toBeInTheDocument()
      expect(screen.getByText('Inactive User')).toBeInTheDocument()
    })
  })

  it('allows creating a new user via the Create form', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

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

  it('copies a user with a new username, same profile and domains, and shows the new key', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Lex Friedman'))
    fireEvent.click(await screen.findByRole('button', { name: /COPY_USER/i }))

    fireEvent.change(screen.getByLabelText(/New Username/i), { target: { value: 'lex2' } })
    fireEvent.click(screen.getByRole('button', { name: /CREATE_COPY/i }))

    await waitFor(() => {
      expect(screen.getByText('CREDENTIALS GENERATED')).toBeInTheDocument()
      expect(screen.getByText('sk-generated-key')).toBeInTheDocument()
    })

    const calls = (window.fetch as any).mock.calls as [string, RequestInit | undefined][]
    const createCall = calls.filter(([url, opts]) => url.toString().endsWith('/api/users') && opts?.method === 'POST').pop()
    expect(JSON.parse(createCall![1]!.body as string)).toEqual({
      user_id: 'lex2',
      username: 'lex2',
      name: 'Lex Friedman',
      email: 'lex@savant.ai',
      role: 'operator',
      is_active: true,
    })
    const domainCall = calls.filter(([url, opts]) => url.toString().includes('/domains') && opts?.method === 'POST').pop()
    expect(JSON.parse(domainCall![1]!.body as string)).toEqual({ domain_node_id: 'domain-1', can_write: true })
    expect(mockUsers.find(u => u.id === 'usr-2')!.api_keys).toEqual(['sk-lex-savant-001'])
  })

  it('rejects copying to an existing username', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Lex Friedman'))
    fireEvent.click(await screen.findByRole('button', { name: /COPY_USER/i }))
    fireEvent.change(screen.getByLabelText(/New Username/i), { target: { value: 'Ahmed' } })
    fireEvent.click(screen.getByRole('button', { name: /CREATE_COPY/i }))

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
  })

  it('allows clicking a user and editing name, email, and role', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

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
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

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
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
    })

    const regenBtns = screen.getAllByTitle('Regenerate API Key')
    fireEvent.click(regenBtns[0])

    await waitFor(() => {
      expect(screen.getByText('sk-regenerated-new-key-123')).toBeInTheDocument()
    })
  })

  it('shows last login and per-tool MCP usage to admins', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Lex Friedman'))

    expect(screen.queryByTestId('user-mcp-usage')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('tab', { name: /Usage/i }))
    const usage = await screen.findByTestId('user-mcp-usage')
    expect(usage).toHaveTextContent('Last login:')
    const tools = await screen.findByTestId('usage-tools')
    const researchRow = within(tools).getByText('research').closest('tr')!
    expect(researchRow).toHaveTextContent('savant-context')
    expect(researchRow).toHaveTextContent('12')
    expect(researchRow).toHaveTextContent('6')
    expect(within(tools).getByText('savant-knowledge')).toBeInTheDocument()
    expect(usage).toHaveTextContent('Tool calls (30d): 18')
    expect(usage).toHaveTextContent('Logins (30d): 4')

    const logins = screen.getByTestId('usage-logins')
    expect(within(logins).getByText('2026-09-30').parentElement).toHaveTextContent('3')

    const projects = screen.getByTestId('usage-projects')
    expect(within(projects).getByText('Data Sync').closest('tr')).toHaveTextContent('workspace')
    expect(within(projects).getByText('icn').closest('tr')).toHaveTextContent('9')

    const queries = screen.getByTestId('usage-queries')
    expect(within(queries).getByText('kafka consumer retries')).toBeInTheDocument()
    expect(within(queries).getByText('repo: icn')).toBeInTheDocument()
    expect(screen.getByTestId('user-last-login')).not.toHaveTextContent('Never')

    const calls = (window.fetch as any).mock.calls as [string, RequestInit | undefined][]
    expect(calls.some(([url]) => url.toString().includes('/api/users/usr-2/usage?days=30'))).toBe(true)
  })

  it('loads creator-attributed knowledge node counts only when contributions are opened', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => expect(screen.getByText('Lex Friedman')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Lex Friedman'))
    expect((window.fetch as any).mock.calls.some(([url]: [string]) => url.includes('/contributions'))).toBe(false)

    fireEvent.click(await screen.findByRole('tab', { name: /Contributions/i }))
    const contributions = await screen.findByTestId('contributions-summary')
    expect(contributions).toHaveTextContent('Nodes created: 7')
    expect(contributions).toHaveTextContent('Committed: 5')
    expect(contributions).toHaveTextContent('Staged: 2')
    expect(contributions).toHaveTextContent('insight: 4')
    expect(contributions).toHaveTextContent('service: 3')
    expect((window.fetch as any).mock.calls.some(([url]: [string]) => url.includes('/api/users/usr-2/contributions'))).toBe(true)
  })

  it('hides usage and last login from non-admins and never requests usage', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    ;(window.fetch as any).mockClear()
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={false} />)

    await waitFor(() => {
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Lex Friedman'))

    expect(await screen.findByText(/Read-only user record/i)).toBeInTheDocument()
    expect(screen.queryByTestId('user-mcp-usage')).not.toBeInTheDocument()
    expect(screen.queryByTestId('user-last-login')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Usage/i })).not.toBeInTheDocument()
    const calls = (window.fetch as any).mock.calls as [string, RequestInit | undefined][]
    expect(calls.some(([url]) => url.toString().includes('/usage'))).toBe(false)
  })

  it('adds every missing domain as read-only in one click', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Lex Friedman'))

    const accessTab = await screen.findByRole('tab', { name: /access/i })
    fireEvent.click(accessTab)

    const bulkBtn = await screen.findByRole('button', { name: /RW/i })
    fireEvent.click(bulkBtn)

    expect(await screen.findByText('Added 2 domains as read-only.')).toBeInTheDocument()
    const calls = (window.fetch as any).mock.calls as [string, RequestInit | undefined][]
    const assigned = calls
      .filter(([url, opts]) => url.toString().includes('/usr-2/domains') && opts?.method === 'POST')
      .map(([, opts]) => JSON.parse(opts!.body as string))
    expect(assigned).toEqual([
      { domain_node_id: 'domain-2', can_write: false },
      { domain_node_id: 'domain-3', can_write: false },
    ])
  })

  it('renders MCP copy buttons for system-enabled agents (e.g. claude and codex) and copies config to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    (window as any).system.getSettings = vi.fn().mockResolvedValue({
      'agents:enabledList': ['claude', 'codex'],
    })

    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Lex Friedman')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Lex Friedman'))

    await waitFor(() => {
      expect(screen.getByTestId('copy-mcp-claude')).toBeInTheDocument()
      expect(screen.getByTestId('copy-mcp-codex')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('copy-mcp-copilot')).not.toBeInTheDocument()
    expect(screen.queryByTestId('copy-mcp-hermes')).not.toBeInTheDocument()

    // Click Claude MCP copy button
    fireEvent.click(screen.getByTestId('copy-mcp-claude'))

    expect(writeTextMock).toHaveBeenCalled()
    const lastCopied = writeTextMock.mock.calls[writeTextMock.mock.calls.length - 1][0]
    const parsed = JSON.parse(lastCopied)
    expect(parsed.mcpServers).toBeDefined()
    expect(parsed.mcpServers['savant-knowledge'].type).toBe('http')
    expect(parsed.mcpServers['savant-knowledge'].url).toContain('sk-lex-savant-001')
    expect(parsed.mcpServers['savant-context'].url).toContain('sk-lex-savant-001')
    expect(parsed.mcpServers['savant-abilities'].url).toContain('sk-lex-savant-001')
    expect(parsed.mcpServers['savant-workspace'].url).toContain('sk-lex-savant-001')

    // Click Codex MCP copy button (TOML format)
    fireEvent.click(screen.getByTestId('copy-mcp-codex'))
    expect(writeTextMock).toHaveBeenCalledTimes(2)
    const codexCopied = writeTextMock.mock.calls[1][0]
    expect(codexCopied).toContain('[mcp_servers.savant-knowledge]')
    expect(codexCopied).toContain('[mcp_servers.savant-abilities]')
    expect(codexCopied).toContain('url = "http://127.0.0.1:8194/mcp?api_key=sk-lex-savant-001&app_name=savant-mcp"')
    expect(codexCopied).toContain('url = "http://127.0.0.1:8192/mcp?api_key=sk-lex-savant-001&app_name=savant-mcp"')

    // Select Guest Bob (guest role) and verify only savant-knowledge is generated
    fireEvent.click(screen.getByText('Guest Bob'))
    await waitFor(() => {
      expect(screen.getByTestId('copy-mcp-claude')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('copy-mcp-claude'))
    expect(writeTextMock).toHaveBeenCalledTimes(3)
    const guestCopied = JSON.parse(writeTextMock.mock.calls[2][0])
    expect(guestCopied.mcpServers['savant-knowledge']).toBeDefined()
    expect(guestCopied.mcpServers['savant-knowledge'].url).toContain('sk-guest-bob-001')
    expect(guestCopied.mcpServers['savant-context']).toBeUndefined()
    expect(guestCopied.mcpServers['savant-abilities']).toBeUndefined()
    expect(guestCopied.mcpServers['savant-workspace']).toBeUndefined()
  })

  it('shows empty notice when all coding agents are disabled in settings', async () => {
    (window as any).system.getSettings = vi.fn().mockResolvedValue({
      'agents:enabledList': [],
    })

    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText('Ahmed Shabbir')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Ahmed Shabbir'))

    await waitFor(() => {
      expect(screen.getByText(/No external coding agents are currently enabled in Settings > Agents/i)).toBeInTheDocument()
    })
  })

  it('renders the interactive fun leaderboard with weekly podium (1st, 2nd, 3rd), monthly view, points breakdown, and unactive users at bottom', async () => {
    const { UsersView } = await import('../components/tabs/UsersView')
    render(<UsersView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    // Verify LEADERBOARD button exists for admin
    const leaderboardBtn = await screen.findByTestId('toggle-leaderboard-btn')
    expect(leaderboardBtn).toHaveTextContent('LEADERBOARD')

    // Open leaderboard
    fireEvent.click(leaderboardBtn)

    // Check leaderboard is rendered
    const lbContainer = await screen.findByTestId('users-leaderboard')
    expect(lbContainer).toBeInTheDocument()
    expect(screen.getByText(/Activity Arena & Leaderboard/i)).toBeInTheDocument()

    // Verify Weekly Podium (1st, 2nd, 3rd)
    const p1 = screen.getByTestId('podium-1st')
    const p2 = screen.getByTestId('podium-2nd')
    const p3 = screen.getByTestId('podium-3rd')

    expect(p1).toHaveTextContent('1ST MVP')
    expect(p1).toHaveTextContent('Ahmed Shabbir')
    expect(p1).toHaveTextContent('55') // 55 pts

    expect(p2).toHaveTextContent('2ND PLACE')
    expect(p2).toHaveTextContent('Lex Friedman')
    expect(p2).toHaveTextContent('24') // 24 pts

    expect(p3).toHaveTextContent('3RD PLACE')

    // Check rankings table
    const ahmedRow = screen.getByTestId('leaderboard-row-usr-1')
    expect(ahmedRow).toHaveTextContent('1ST')
    expect(ahmedRow).toHaveTextContent('Ahmed Shabbir')
    expect(ahmedRow).toHaveTextContent('+3') // 3 additions
    expect(ahmedRow).toHaveTextContent('5') // 2 research + 3 lookup

    // Check inactive users placed at the bottom with fun label
    expect(screen.getByText(/Users that don't login :\( Hall of Silence/i)).toBeInTheDocument()
    const inactiveRow = screen.getByTestId('leaderboard-row-usr-3')
    expect(inactiveRow).toHaveTextContent('Inactive User')
    expect(inactiveRow).toHaveTextContent('NEVER LOGGED IN')
    expect(inactiveRow).toHaveTextContent('Never :(')

    // Switch to Monthly (30D)
    const monthBtn = screen.getByTestId('timeframe-month')
    fireEvent.click(monthBtn)

    await waitFor(() => {
      const calls = (window.fetch as any).mock.calls as [string, RequestInit | undefined][]
      expect(calls.some(([url]) => url.toString().includes('/api/users/leaderboard?days=30'))).toBe(true)
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
    render(<AbilitiesView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

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
      const resolvedArea = screen.getByLabelText(/Rendered Engineering Prompt/i) as HTMLTextAreaElement
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

  it('validates uniqueness and generates snake_case identifier when creating a new asset', async () => {
    const { AbilitiesView } = await import('../components/tabs/AbilitiesView')
    render(<AbilitiesView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    await waitFor(() => {
      expect(screen.getByText(/NEW_ASSET/i)).toBeInTheDocument()
    })

    // Open NEW_ASSET modal
    fireEvent.click(screen.getByText(/NEW_ASSET/i))
    expect(screen.getByText('NEW ABILITY ASSET')).toBeInTheDocument()

    // Find Name and Type fields
    const nameInput = screen.getByPlaceholderText(/e\.g\. JS Naming/i)
    const typeSelect = screen.getByDisplayValue('RULE')

    // Type a name: "some thing"
    fireEvent.change(nameInput, { target: { value: 'some thing' } })

    // Check machine generated identifier input value
    const generatedIdInput = screen.getByDisplayValue('rule.some_thing')
    expect(generatedIdInput).toBeInTheDocument()

    // Test duplicate identifier: "coding style" -> "rule.coding_style" which already exists
    fireEvent.change(nameInput, { target: { value: 'coding style' } })
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })

    // CREATE_ASSET button should be disabled for duplicate
    const createBtn = screen.getByRole('button', { name: 'CREATE_ASSET' })
    expect(createBtn).toBeDisabled()

    // Change to a unique name: "JS Naming Rule" -> "rule.js_naming_rule"
    fireEvent.change(nameInput, { target: { value: 'JS Naming Rule' } })
    await waitFor(() => {
      expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('rule.js_naming_rule')).toBeInTheDocument()
    expect(createBtn).not.toBeDisabled()

    // Submit asset creation
    fireEvent.click(createBtn)
    await waitFor(() => {
      expect(screen.queryByText('NEW ABILITY ASSET')).not.toBeInTheDocument()
    })
  })

  it('downloads ZIP or TAR migration packages and imports without overwriting existing files', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.mocked(window.fetch).mockImplementation((url, options) => {
      calls.push([url, options])
      const u = url.toString()
      if (u.includes('/api/abilities/export')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Disposition': 'attachment; filename="savant-abilities.zip"', 'X-Abilities-Count': '2' }),
          blob: () => Promise.resolve(new Blob(['archive'])),
        } as Response)
      }
      if (u.includes('/api/abilities/import')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ imported_count: 3, skipped_count: 2 }),
        } as Response)
      }
      if (u.includes('/api/abilities/assets')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ persona: [], rule: [] }) } as Response)
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)
    })
    const createObjectURL = vi.fn(() => 'blob:abilities')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

    const { AbilitiesView } = await import('../components/tabs/AbilitiesView')
    render(<AbilitiesView serverUrl="http://127.0.0.1:8090" apiKey="test-key" isAdmin={true} />)

    fireEvent.click(await screen.findByRole('button', { name: /download zip/i }))
    await waitFor(() => expect(calls.some(([url]) => url.toString().endsWith('/api/abilities/export?format=zip'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: /download tar/i }))
    await waitFor(() => expect(calls.some(([url]) => url.toString().endsWith('/api/abilities/export?format=tar'))).toBe(true))

    const archive = new File(['zip'], 'migration.zip', { type: 'application/zip' })
    fireEvent.change(screen.getByLabelText(/choose abilities archive/i), { target: { files: [archive] } })

    expect(await screen.findByText(/3 added · 2 existing\/unsupported skipped/i)).toBeInTheDocument()
    const importCall = calls.find(([url]) => url.toString().endsWith('/api/abilities/import'))
    expect(importCall?.[1]?.body).toBeInstanceOf(FormData)
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
