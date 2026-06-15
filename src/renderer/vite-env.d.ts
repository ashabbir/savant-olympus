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
  }
  electronAPI?: {
    pickDirectory: (defaultPath?: string) => Promise<string | null>;
    listDirectory: (dirPath: string) => Promise<Array<{ name: string, isDirectory: boolean, path: string }>>;
  }
}
