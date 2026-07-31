import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (!window.ipcRenderer) {
  window.ipcRenderer = {
    on: () => {},
    off: () => {},
    send: () => {},
    invoke: async () => undefined,
  }
}

if (!window.system) {
  window.system = {
    getUser: async () => 'operator',
    getSettings: async () => ({}),
    saveSetting: async (_key: string, _value: any) => true,
    listProviders: async () => ({
      source: 'terminal',
      providers: [
        { id: 'codex', label: 'Codex', defaultModel: 'o4-mini', models: ['o4-mini', 'gpt-5-mini', 'gpt-5', 'gpt-5-codex', 'o3'] },
        { id: 'gemini', label: 'Gemini', defaultModel: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-exp'] },
        { id: 'claude', label: 'Claude', defaultModel: 'haiku', models: ['haiku', 'sonnet', 'opus', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'] },
        { id: 'copilot', label: 'Copilot', defaultModel: 'claude-haiku-4.5', models: ['claude-haiku-4.5', 'claude-sonnet-4.6', 'claude-opus-4.7', 'gpt-4.1', 'gpt-5-mini'] },
      ].map(provider => ({
        ...provider,
        source: 'terminal' as const,
        installed: true,
      })),
    }),
    getDbStatus: async () => 'connected',
    getChatHistory: async (_target_id: string) => [],
    saveChatHistory: async (_target_id: string, _messages: any[]) => true,
    clearChatHistory: async (_target_id: string) => true,
    loadAthenaThreads: async () => [],
    saveAthenaThread: async (_target_id: string, _messages: any[]) => true,
    clearAthenaThread: async (_target_id: string) => true,
    readGraphifyJson: async (_repoPath: string) => null,
    runAgentViaGateway: async () => '',
    exportDocument: async () => null,
    getSkillExportProfiles: async () => ({}),
    exportSkillPackage: async () => ({ provider: '', path: '', format: '' }),
    installDefaultSkills: async () => ({ providers: {} }),
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
