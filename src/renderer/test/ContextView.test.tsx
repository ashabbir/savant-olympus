import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextView, formatSyncLogDateTime, sortSyncLogsNewestFirst } from '../components/tabs/ContextView'

describe('ContextView - Sync Audit Trail', () => {
  it('sorts sync logs newest first with IDs as a stable timestamp tie-breaker', () => {
    const logs = [
      { id: 1, created_at: '2026-07-20T02:50:26Z' },
      { id: 2, created_at: '2026-07-20T02:50:28Z' },
      { id: 3, created_at: '2026-07-20T02:50:28Z' },
    ]

    expect(sortSyncLogsNewestFirst(logs).map((log) => log.id)).toEqual([3, 2, 1])
    expect(logs.map((log) => log.id)).toEqual([1, 2, 3])
  })

  it('formats a sync log timestamp with both its date and time', () => {
    const formatted = formatSyncLogDateTime('2026-07-20T02:50:28Z')

    expect(formatted).toMatch(/2026/)
    expect(formatted).toMatch(/Jul/)
    expect(formatted).toMatch(/20/)
    expect(formatted).toMatch(/:/)
  })

  it('filters execution logs to the opened project', async () => {
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [{ name: 'opened-project', path: '/base-code/opened-project' }] }) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ logs: [], status: {} }) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject="opened-project" isAdmin={true} />)

    await waitFor(() => {
      expect(vi.mocked(window.fetch).mock.calls.some(([url]) =>
        url.toString().includes('/periodic-sync/logs?repo_name=opened-project&limit=10'),
      )).toBe(true)
    })
  })
})

describe('ContextView - FileBrowserModal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/context/repos/sources')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            sources: {
              directory: {
                enabled: true,
                base_dir: "/base-code",
                base_host_dir: "/Users/home/code"
              }
            }
          })
        } as Response)
      }
      if (u.includes('/api/context/repos/browse')) {
        const urlObj = new URL(u);
        const path = urlObj.searchParams.get('path') || '';
        let entries = [];
        if (path === "/Users/home/code/project-a") {
          entries = [
            { name: "src", isDirectory: true, path: "/Users/home/code/project-a/src" }
          ];
        } else {
          entries = [
            { name: "project-a", isDirectory: true, path: "/Users/home/code/project-a" },
            { name: "project-b", isDirectory: true, path: "/Users/home/code/project-b" }
          ];
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(entries)
        } as Response)
      }
      if (u.includes('/api/context/repos')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ repos: [] })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
      } as Response)
    })
  })

  it('identifies Olympus on project-list requests', async () => {
    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)

    await waitFor(() => {
      const call = vi.mocked(window.fetch).mock.calls.find(([url]) => url.toString().includes('/api/context/repos'))
      expect(call?.[1]).toMatchObject({
        headers: { "X-API-Key": "test-key", "X-App-Name": "savant-olympus" },
      })
    })
  })

  it('opens FileBrowserModal when BROWSE button is clicked', async () => {
    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)
    
    // Open Register modal
    const registerBtn = screen.getByText(/REGISTER REPOSITORY/i)
    fireEvent.click(registerBtn)
    
    // Select Local Directory source
    await waitFor(() => {
      const select = screen.getByLabelText(/Select Source/i)
      fireEvent.change(select, { target: { value: 'directory' } })
    })

    // Click BROWSE
    const browseBtn = screen.getByText(/BROWSE/i)
    fireEvent.click(browseBtn)

    // Check if FileBrowserModal is visible
    expect(screen.getByText(/BROWSE SERVER \(BASE_CODE_DIR\)/i)).toBeTruthy()
    await waitFor(() => {
      const calls = vi.mocked(window.fetch).mock.calls;
      const hasBrowseCall = calls.some(call => call[0].toString().includes('/api/context/repos/browse'));
      expect(hasBrowseCall).toBe(true);
    })
  })

  it('navigates directories and selects a path', async () => {
    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)
    fireEvent.click(screen.getByText(/REGISTER REPOSITORY/i))
    await waitFor(() => {
      fireEvent.change(screen.getByLabelText(/Select Source/i), { target: { value: 'directory' } })
    })
    fireEvent.click(screen.getByText(/BROWSE/i))

    await waitFor(() => {
      expect(screen.getByText("project-a")).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText("project-a"))

    await waitFor(() => {
      expect(screen.getByText("src")).toBeInTheDocument()
      expect(screen.getAllByText(/\/Users\/home\/code\/project-a/i).length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByText(/Select Directory/i))
    const input = screen.getByPlaceholderText("team/project") as HTMLInputElement
    expect(input.value).toBe("/Users/home/code/project-a")
  })

  it('renders only the configured project sources and uses one SSH/HTTPS URL field', async () => {
    vi.mocked(window.fetch).mockImplementation((url) => {
      const u = url.toString()
      if (u.includes('/api/context/repos/sources')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sources: {
              directory: { enabled: true },
              github: { enabled: true },
              gitlab: { enabled: true },
            },
          }),
        } as Response)
      }
      if (u.includes('/api/context/repos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [] }) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: {} }) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)
    fireEvent.click(screen.getByText(/REGISTER REPOSITORY/i))

    const select = await screen.findByLabelText(/Select Source/i) as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["directory", "github", "gitlab"])
    fireEvent.change(select, { target: { value: "github" } })
    expect(screen.getByPlaceholderText("git@github.com:owner/repo.git")).toBeTruthy()
    fireEvent.change(select, { target: { value: "gitlab" } })
    expect(screen.getByPlaceholderText("git@gitlab.com:group/repo.git")).toBeTruthy()
    expect(screen.queryByText(/Branch \(Optional\)/i)).toBeNull()
  })

  it('submits a single repository URL without exposing token fields', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.mocked(window.fetch).mockImplementation((url, options) => {
      calls.push([url, options])
      const u = url.toString()
      if (u.includes('/api/context/repos/sources')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sources: { github: { enabled: true } } }) } as Response)
      }
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [] }) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [] }) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)
    fireEvent.click(screen.getByText(/REGISTER REPOSITORY/i))
    const input = await screen.findByPlaceholderText("git@github.com:owner/repo.git")
    fireEvent.change(input, { target: { value: "git@github.com:acme/repo.git" } })
    fireEvent.click(screen.getByText("REGISTER PROJECT"))

    await waitFor(() => {
      const addCall = calls.find(([url, options]) => url.toString().endsWith('/api/context/repos') && options?.method === 'POST')
      expect(addCall).toBeDefined()
      expect(JSON.parse(String(addCall?.[1]?.body))).toEqual({ source: 'github', url: 'git@github.com:acme/repo.git' })
    })
  })

  it('shows repository registration progress while the server downloads the project', async () => {
    vi.mocked(window.fetch).mockImplementation((url, options) => {
      const u = url.toString()
      if (u.includes('/api/context/repos/sources')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sources: { gitlab: { enabled: true } } }) } as Response)
      }
      if (u.endsWith('/api/context/repos') && options?.method === 'POST') {
        return new Promise<Response>(() => {})
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [] }) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)
    fireEvent.click(screen.getByText(/REGISTER REPOSITORY/i))
    const input = await screen.findByPlaceholderText("git@gitlab.com:group/repo.git")
    fireEvent.change(input, { target: { value: "https://gitlab.example.org/group/public-repo.git" } })
    fireEvent.click(screen.getByText("REGISTER PROJECT"))

    expect(await screen.findByText("CHECKING ACCESS...")).toBeInTheDocument()
    expect(screen.getByText(/anonymous fallback for public repositories/i)).toBeInTheDocument()
  })

  it('filters the project tree with full-text search as the user types', async () => {
    vi.mocked(window.fetch).mockImplementation((url) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            repos: [
              { name: 'alpha-dashboard', path: '/base-code/alpha-dashboard', source: 'github', source_origin: 'https://github.com/acme/alpha-dashboard.git', status: 'ready' },
              { name: 'beta-service', path: '/base-code/beta-service', source: 'directory', status: 'ready' },
            ],
          }),
        } as Response)
      }
      if (u.includes('/api/context/repos/indexing-status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)

    expect(await screen.findByText('alpha-dashboard')).toBeInTheDocument()
    expect(screen.getByText('beta-service')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: /search projects/i }), { target: { value: 'GITHUB.COM/ACME/ALPHA' } })

    expect(screen.getByText('alpha-dashboard')).toBeInTheDocument()
    expect(screen.queryByText('beta-service')).toBeNull()
  })

  it('refreshes the checked-out code for a registered repository', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.mocked(window.fetch).mockImplementation((url, options) => {
      calls.push([url, options])
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [{ name: 'repo', path: '/base-code/repo', source: 'github', source_label: 'GitHub', status: 'ready' }] }) } as Response)
      }
      if (u.includes('/api/context/repos/indexing-status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: {} }) } as Response)
      }
      if (u.endsWith('/api/context/repos/repo/refresh')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: 'repo', path: '/base-code/repo' }) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)
    const refreshButton = await screen.findByRole('button', { name: /refetch code for repo/i })
    fireEvent.click(refreshButton)

    await waitFor(() => {
      const refreshCall = calls.find(([url, options]) => url.toString().endsWith('/api/context/repos/repo/refresh') && options?.method === 'POST')
      expect(refreshCall).toBeDefined()
    })
  })

  it('shows refetch controls only for GitHub and GitLab projects', async () => {
    vi.mocked(window.fetch).mockImplementation((url) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            repos: [
              { name: 'github-repo', path: '/base-code/github-repo', source: 'github', status: 'ready' },
              { name: 'gitlab-repo', path: '/base-code/gitlab-repo', source: 'gitlab', status: 'ready' },
              { name: 'local-repo', path: '/base-code/local-repo', source: 'directory', status: 'ready' },
            ],
          }),
        } as Response)
      }
      if (u.includes('/api/context/repos/indexing-status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)

    expect(await screen.findByRole('button', { name: /refetch code for github-repo/i })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /refetch code for gitlab-repo/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refetch code for local-repo/i })).toBeNull()
  })

  it('keeps members read-only while allowing project viewing', async () => {
    vi.mocked(window.fetch).mockImplementation((url) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [{ name: 'member-visible-repo', path: '/base-code/member-visible-repo', source: 'github', status: 'ready' }] }) } as Response)
      }
      if (u.includes('/api/context/repos/indexing-status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={false} />)

    expect(await screen.findByText('member-visible-repo')).toBeInTheDocument()
    expect(screen.queryByText(/REGISTER REPOSITORY/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /refetch code/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /index member-visible-repo/i })).toBeNull()
  })

  it('renders live progress from the indexing status response and polls without a manual refresh', async () => {
    vi.mocked(window.fetch).mockImplementation((url) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ repos: [{ name: 'repo', path: '/base-code/repo', status: 'added' }] }),
        } as Response)
      }
      if (u.includes('/api/context/repos/indexing-status')) {
        return Promise.resolve({
          ok: true,
          // The server returns the repository map directly, not { status: ... }.
          json: () => Promise.resolve({ repo: { status: 'indexing', progress: 42, phase: 'Embedding files' } }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject="repo" isAdmin={true} />)

    expect((await screen.findAllByText('42%')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/INDEXING IN PROGRESS/i)).toBeInTheDocument()
    expect(screen.getByText(/PHASE: Embedding files/i)).toBeInTheDocument()
  })
})
