import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other apts you need here.
  // ...
})

contextBridge.exposeInMainWorld('system', {
  getUser: () => ipcRenderer.invoke('get-user'),
  listProviders: (gatewayUrl?: string) => ipcRenderer.invoke('list-providers', gatewayUrl),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSetting: (key: string, value: any) => ipcRenderer.invoke('save-setting', { key, value }),
  getDbStatus: () => ipcRenderer.invoke('get-db-status'),
  getChatHistory: (target_id: string) => ipcRenderer.invoke('get-chat-history', target_id),
  saveChatHistory: (target_id: string, messages: any[]) => ipcRenderer.invoke('save-chat-history', { target_id, messages }),
  clearChatHistory: (target_id: string) => ipcRenderer.invoke('clear-chat-history', target_id),
  readGraphifyJson: (repoPath: string) => ipcRenderer.invoke('read-graphify-json', repoPath),
})

contextBridge.exposeInMainWorld('electronAPI', {
  pickDirectory: (defaultPath?: string) => ipcRenderer.invoke('pick-directory', defaultPath || null),
  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath)
})
