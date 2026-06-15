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

const mockSystem = {
  getUser: vi.fn().mockResolvedValue('test-user'),
  getSettings: vi.fn().mockResolvedValue({ 'user:apiKey': 'sk-test-key', 'user:name': 'test-user' }),
  saveSetting: vi.fn().mockResolvedValue(true),
  listProviders: vi.fn().mockResolvedValue({ source: 'gateway', providers: [] }),
  getDbStatus: vi.fn().mockResolvedValue('connected'),
}

const localStorageMock = (() => {
  const store = new Map<string, string>([['savant_api_key', 'sk-test-key']])
  return {
    getItem: vi.fn((key: string) => store.get(key) || null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    clear: vi.fn(() => { store.clear() }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({ valid: true, user_id: 'test-user', name: 'test-user', role: 'admin' }),
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
