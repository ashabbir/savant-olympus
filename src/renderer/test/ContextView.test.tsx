import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextView, formatSyncLogDateTime, sortSyncLogsNewestFirst, parseFileStats } from '../components/tabs/ContextView'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }
}))


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

  it('closes registration immediately and shows the queued repository in the tree', async () => {
    vi.mocked(window.fetch).mockImplementation((url, options) => {
      const u = url.toString()
      if (u.includes('/api/context/repos/sources')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sources: { github: { enabled: true } } }) } as Response)
      }
      if (u.endsWith('/api/context/repos') && options?.method === 'POST') {
        return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({
          id: 42, name: 'large-repo', path: '/base-code/large-repo', registration_accepted: true,
          job_id: 'job-large-repo', job_type: 'initial_repo_sync', processing_status: 'queued',
        }) } as Response)
      }
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [{
          id: 42, name: 'large-repo', path: '/base-code/large-repo', status: 'added', source: 'unknown',
        }] }) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: {} }) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject={null} isAdmin={true} />)
    fireEvent.click(screen.getByText(/REGISTER REPOSITORY/i))
    fireEvent.change(await screen.findByPlaceholderText('git@github.com:owner/repo.git'), {
      target: { value: 'https://github.com/acme/large-repo.git' },
    })
    fireEvent.click(screen.getByText('REGISTER PROJECT'))

    await waitFor(() => expect(screen.getByText('large-repo')).toBeInTheDocument())
    expect(screen.queryByPlaceholderText('git@github.com:owner/repo.git')).toBeNull()
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

  it('filters the project tree with multiple status filters (AND logic)', async () => {
    vi.mocked(window.fetch).mockImplementation((url) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            repos: [
              { name: 'alpha-dashboard', path: '/base-code/alpha-dashboard', source: 'github', indexed_at: '2026-07-20T00:00:00Z', freshness: 'fresh', status: 'ready' },
              { name: 'beta-service', path: '/base-code/beta-service', source: 'directory', status: 'ready' },
              { name: 'gamma-service', path: '/base-code/gamma-service', source: 'github', indexed_at: '2026-07-20T00:00:00Z', freshness: 'unavailable', status: 'ready' },
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

    // Wait for the projects to load
    expect(await screen.findByText('alpha-dashboard')).toBeInTheDocument()
    expect(screen.getByText('beta-service')).toBeInTheDocument()
    expect(screen.getByText('gamma-service')).toBeInTheDocument()

    // 1. Filter by INDEXED (should show alpha and gamma)
    fireEvent.click(screen.getByRole('button', { name: /^indexed$/i }))
    expect(screen.getByText('alpha-dashboard')).toBeInTheDocument()
    expect(screen.getByText('gamma-service')).toBeInTheDocument()
    expect(screen.queryByText('beta-service')).toBeNull()

    // 2. Add ANALYZED filter (should show only alpha-dashboard)
    fireEvent.click(screen.getByRole('button', { name: /^analyzed$/i }))
    expect(screen.getByText('alpha-dashboard')).toBeInTheDocument()
    expect(screen.queryByText('gamma-service')).toBeNull()
    expect(screen.queryByText('beta-service')).toBeNull()

    // 3. Clear filters (click ALL)
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByText('alpha-dashboard')).toBeInTheDocument()
    expect(screen.getByText('beta-service')).toBeInTheDocument()
    expect(screen.getByText('gamma-service')).toBeInTheDocument()

    // 4. Click ADDED filter (should show beta-service only)
    fireEvent.click(screen.getByRole('button', { name: /^added$/i }))
    expect(screen.getByText('beta-service')).toBeInTheDocument()
    expect(screen.queryByText('alpha-dashboard')).toBeNull()
    expect(screen.queryByText('gamma-service')).toBeNull()
  })




  it('displays git metadata (branch, commits, files changed) on successful repository sync pass', async () => {
    let callCount = 0;
    vi.mocked(window.fetch).mockImplementation((url, options) => {
      const u = url.toString()
      if (u.endsWith('/api/context/repos')) {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            repos: [{
              name: 'repo-with-git',
              path: '/base-code/repo-with-git',
              source: 'github',
              source_label: 'GitHub',
              status: 'ready',
              branch: callCount > 1 ? 'feature-cool' : 'main',
              last_job: callCount > 1 ? { after_commit: '2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } : null
            }]
          })
        } as Response)
      }
      if (u.includes('/api/context/repos/indexing-status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: {} }) } as Response)
      }
      if (u.includes('/api/context/repos/periodic-sync/run')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            count: 1
          })
        } as Response)
      }
      if (u.includes('/api/context/ast/list')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ nodes: [] }) } as Response)
      }
      if (u.includes('/health')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ provider: 'legacy', freshness: 'unavailable' }) } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    const { container } = render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject="repo-with-git" isAdmin={true} />)
    
    // Switch to Activity & History tab to show the Git Checkout info
    const activityTabBtn = await screen.findByTestId('activity-tab-button')
    fireEvent.click(activityTabBtn)

    const syncButton = await screen.findByRole('button', { name: /run sync pass/i })
    fireEvent.click(syncButton)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Periodic sync completed for "repo-with-git"!'
      )
    })

    // Verify redesigned Git Checkout Details cards are rendered
    expect(screen.getByText(/Git Branch/i)).toBeInTheDocument();
    expect(screen.getByText(/Last Sync Commit/i)).toBeInTheDocument();
    expect(screen.getByText(/Remote Origin \/ Host/i)).toBeInTheDocument();

    // Verify branch name and new commit SHA are rendered inside the cards
    expect(screen.getAllByText(/feature-cool/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2222222/i)).toBeInTheDocument();
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
          json: () => Promise.resolve({ repo: { status: 'indexing', progress: 42, phase: 'Embedding files', job_id: 'index-job-1' } }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
    })

    render(<ContextView serverUrl="http://127.0.0.1:8090" apiKey="test-key" onSelectProject={() => {}} selectedProject="repo" isAdmin={true} />)

    expect((await screen.findAllByText('42%')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/INDEXING IN PROGRESS/i)).toBeInTheDocument()
    expect(screen.getByText(/PHASE: Embedding files/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /stop index job/i }))
    await waitFor(() => {
      const cancelCall = vi.mocked(window.fetch).mock.calls.find(([url]) => url.toString().includes('/api/jobs/cancel'))
      expect(cancelCall).toBeTruthy()
      expect(cancelCall?.[1]?.body).toBe(JSON.stringify({ job_id: 'index-job-1' }))
    })
  })
})

describe('parseFileStats helper', () => {
  it('correctly parses file stats from sync logs details', () => {
    const details = 'Fetched origin (code_changed=True); Indexed (clear=False, indexed=7, skipped=228, removed=0); CodeGraph synced (freshness=ok)'
    const stats = parseFileStats(details)
    expect(stats).toEqual({
      indexed: 7,
      skipped: 228,
      removed: 0,
      total: 235
    })
  })

  it('returns null if stats are not present in details', () => {
    const details = 'Fetched origin (code_changed=False)'
    const stats = parseFileStats(details)
    expect(stats).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseFileStats('')).toBeNull()
  })
})
