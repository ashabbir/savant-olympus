import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock-mermaid</svg>' })
  }
}))

// Mock Electron APIs exposed in preload.ts
const mockAgents = {
  run: vi.fn().mockResolvedValue('Mock agent response'),
}

const mockIpcRenderer = {
  on: vi.fn(),
  off: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
}

const mockSystem: any = {
  getUser: vi.fn().mockResolvedValue('test-user'),
  getSettings: vi.fn().mockResolvedValue({ 'user:apiKey': 'sk-test-key', 'user:name': 'test-user' }),
  saveSetting: vi.fn().mockResolvedValue(true),
  listProviders: vi.fn().mockResolvedValue({ source: 'gateway', providers: [] }),
  getDbStatus: vi.fn().mockResolvedValue('connected'),
  loadAthenaThreads: vi.fn().mockResolvedValue([]),
  saveAthenaThread: vi.fn().mockResolvedValue(true),
  clearAthenaThread: vi.fn().mockResolvedValue(true),
  readGraphifyJson: vi.fn().mockResolvedValue(null),
  runAgentViaGateway: vi.fn().mockResolvedValue('Mock agent response'),
  exportDocument: vi.fn().mockResolvedValue('/tmp/athena-export.html'),
  getSkillExportProfiles: vi.fn().mockResolvedValue({
    codex: { label: 'Codex', directory: '/tmp/.codex/skills', format: 'Agent Skills / SKILL.md' },
    claude: { label: 'Claude', directory: '/tmp/.claude/skills', format: 'Claude Code Skill' },
    copilot: { label: 'Copilot', directory: '/tmp/.copilot/skills', format: 'GitHub Copilot Agent Skill' },
    agy: { label: 'AGY', directory: '/tmp/.agents/skills', format: 'AGY Workspace Skill' },
    hermes: { label: 'Hermes', directory: '/tmp/.hermes/skills/custom', format: 'Hermes Agent Skill' },
  }),
  exportSkillPackage: vi.fn().mockResolvedValue({ provider: 'codex', path: '/tmp/.codex/skills/example', format: 'Agent Skills / SKILL.md' }),
}

mockSystem.getChatHistory = vi.fn().mockResolvedValue([])
mockSystem.saveChatHistory = vi.fn().mockResolvedValue(true)
mockSystem.clearChatHistory = vi.fn().mockResolvedValue(true)

const localStorageMock = (() => {
  const store = new Map<string, string>([['savant_api_key', 'sk-test-key']])
  return {
    getItem: vi.fn((key: string) => store.get(key) || null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    clear: vi.fn(() => { store.clear() }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] || null),
    get length() { return store.size },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

vi.stubGlobal('fetch', vi.fn().mockImplementation((url, options) => {
  const u = url.toString();
  const method = (options?.method || 'GET').toUpperCase();

  if (u.includes('/api/reminders')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
        {
          id: "rem-1",
          text: "Backup savant database",
          description: "Perform full backup of SQLite instances",
          due_date: "2026-06-20T12:00:00Z",
          status: "pending"
        }
      ])
    });
  }

  if (u.includes('/api/users')) {
    if (method === 'DELETE') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, message: "User deactivated" })
      });
    }
    if (method === 'POST' && (u.endsWith('/api-key') || u.includes('/api-key?_') || u.includes('/api-key/'))) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ api_key: "sk-regenerated-new-key" })
      });
    }
    if (method === 'POST') {
      const body = options?.body ? JSON.parse(options.body.toString()) : {};
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: "usr-new",
          username: body.username || "new_user",
          name: body.name || "New User",
          email: body.email || "new@savant.ai",
          role: body.role || "operator",
          active: true,
          api_keys: ["sk-new-generated-key"]
        })
      });
    }
    if (method === 'PUT') {
      const body = options?.body ? JSON.parse(options.body.toString()) : {};
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          id: "usr-edited",
          username: "edited_user",
          name: body.name || "Edited User",
          email: body.email || "edited@savant.ai",
          role: body.role || "operator",
          active: true,
          api_keys: ["sk-edited-key"]
        })
      });
    }
    // GET /api/users
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([
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
      ])
    });
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ valid: true, user_id: 'test-user', name: 'test-user', role: 'admin' }),
  });
}))

Object.defineProperty(window, 'agents', {
  value: mockAgents,
  writable: true,
})

Object.defineProperty(window, 'system', {
  value: mockSystem,
  writable: true,
})

Object.defineProperty(window, 'ipcRenderer', {
  value: mockIpcRenderer,
  writable: true,
})
