/// <reference types="vite/client" />

declare const APP_VERSION: string;

interface Window {
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    off: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    send: (channel: string, ...args: any[]) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }
  system: {
    getUser: () => Promise<string>
    getSettings: () => Promise<Record<string, any>>
    saveSetting: (key: string, value: any) => Promise<boolean>
    listProviders: (gatewayUrl?: string) => Promise<{
      source: 'gateway' | 'terminal'
      providers: Array<{
        id: string
        label: string
        defaultModel?: string
        models: string[]
        source: 'gateway' | 'terminal'
        installed: boolean
      }>
    }>
    getDbStatus: () => Promise<string>
    getChatHistory: (target_id: string) => Promise<any[]>
    saveChatHistory: (
      target_id: string,
      messages: any[],
      metadata?: { title?: string; context?: any; kind?: string },
    ) => Promise<boolean>
    clearChatHistory: (target_id: string) => Promise<boolean>
    loadAthenaThreads: (kind?: string) => Promise<any[]>
    saveAthenaThread: (target_id: string, messages: any[]) => Promise<boolean>
    clearAthenaThread: (target_id: string) => Promise<boolean>
    readGraphifyJson: (repoPath: string) => Promise<any | null>
    runAgentViaGateway: (args: { provider: string; model: string; prompt: string }) => Promise<string>
    exportDocument: (args: {
      format: 'html' | 'pdf'
      html: string
      defaultFilename: string
    }) => Promise<string | null>
    getSkillExportProfiles: () => Promise<Record<string, { label: string; directory: string; format: string }>>
    exportSkillPackage: (args: {
      provider: string
      name: string
      destinationRoot: string
      files: Array<{ path: string; content: string }>
    }) => Promise<{ provider: string; path: string; format: string }>
  }
  electronAPI?: {
    pickDirectory: (defaultPath?: string) => Promise<string | null>;
    listDirectory: (dirPath: string) => Promise<Array<{ name: string, isDirectory: boolean, path: string }>>;
  }
}
