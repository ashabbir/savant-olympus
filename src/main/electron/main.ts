import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

// Persistence configuration
const SAVANT_DIR = path.join(os.homedir(), '.savant')
const OLYMPUS_DB_PATH = path.join(SAVANT_DIR, 'olympus.db')
const GATEWAY_URL = 'http://127.0.0.1:3100'

const LOG_FILE = path.join(SAVANT_DIR, 'olympus.log');
function writeLog(level: string, ...args: any[]) {
  const msg = `[${new Date().toISOString()}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  fs.appendFile(LOG_FILE, msg).catch(() => {}); // Fire and forget
}
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;
console.log = (...args) => { origLog(...args); writeLog('INFO', ...args); };
console.error = (...args) => { origError(...args); writeLog('ERROR', ...args); };
console.warn = (...args) => { origWarn(...args); writeLog('WARN', ...args); };

let db: any
let tray: Tray | null = null

async function initDb() {
  try {
    await fs.mkdir(SAVANT_DIR, { recursive: true })
    const Database = require('better-sqlite3')
    db = new Database(OLYMPUS_DB_PATH)
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
    console.log('[OLYMPUS] SQLite engine initialized.')
  } catch (e) {
    console.error('Failed to initialize Savant Olympus database:', e)
  }
}

function normalizeGatewayProviders(payload: any) {
  const providerPayload = payload?.providerDetails ?? payload?.providers ?? payload?.data ?? payload
  const rawProviders = Array.isArray(providerPayload)
    ? providerPayload
    : providerPayload && typeof providerPayload === 'object'
      ? Object.entries(providerPayload).map(([id, value]) => (
        value && typeof value === 'object'
          ? { id, ...(value as Record<string, unknown>) }
          : { id, label: String(value) }
      ))
      : Array.isArray(payload)
    ? payload
    : []

  return rawProviders
    .map((provider: any) => {
      if (typeof provider === 'string') {
        const id = provider.trim()
        if (!id) return null
        return {
          id,
          label: id,
          models: [],
          source: 'gateway',
          installed: true,
        }
      }

      const id = String(provider.id || provider.name || provider.provider || '').trim()
      if (!id) return null
      const models = Array.isArray(provider.models)
        ? provider.models.map((model: any) => String(model.id || model.name || model)).filter(Boolean)
        : provider.models && typeof provider.models === 'object'
          ? Object.keys(provider.models)
        : provider.model
          ? [String(provider.model)]
          : []

      return {
        id,
        label: String(provider.label || provider.name || id),
        defaultModel: provider.defaultModel ? String(provider.defaultModel) : models[0],
        models,
        source: 'gateway',
        installed: true,
      }
    })
    .filter(Boolean)
}

async function getGatewayProviders(gatewayUrl: string) {
  const baseUrl = gatewayUrl.replace(/\/+$/, '')
  const endpoints = ['/models', '/health', '/providers', '/api/providers', '/v1/providers', '/models/providers']

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2500)
      const response = await fetch(`${baseUrl}${endpoint}`, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) continue

      const providers = normalizeGatewayProviders(await response.json())
      if (providers.length > 0) {
        return providers
      }
    } catch (_e) {
      // Try the next known gateway route
    }
  }

  return []
}

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../../renderer/public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = app.isPackaged ? undefined : process.env['VITE_DEV_SERVER_URL']

function resolveAsset(name: string): string {
  // In packaged builds, assets live under process.resourcesPath/public (extraResources).
  // In dev, they live alongside the renderer public dir.
  const packaged = path.join(process.resourcesPath || '', 'public', name)
  const devPath = path.join(process.env.VITE_PUBLIC || '', name)
  return app.isPackaged ? packaged : devPath
}

function createWindow() {
  win = new BrowserWindow({
    icon: resolveAsset('main1.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false
    },
    width: 1200,
    height: 800,
    backgroundColor: '#0d0d0d',
  })

  // Add load failure logging
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[OLYMPUS] Failed to load URL: ${validatedURL}`)
    console.error(`[OLYMPUS] Error: ${errorDescription} (${errorCode})`)
  })

  if (VITE_DEV_SERVER_URL) {
    console.log(`[OLYMPUS] Loading Dev Server: ${VITE_DEV_SERVER_URL}`)
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // In built app, index.html is in the dist folder
    // Packaged apps load from app.asar; dev loads from the local dist folder.
    const indexPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html')
      : path.join(__dirname, '..', 'dist', 'index.html')
    
    console.log(`[OLYMPUS] Loading production file: ${indexPath}`)
    win.loadURL(pathToFileURL(indexPath).href).catch(err => {
      console.error('[OLYMPUS] win.loadFile failed:', err)
    })
  }
}

function createTray() {
  const iconPath = resolveAsset('trayTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Olympus', click: () => { win?.show(); win?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } }
  ])

  tray.setToolTip('Savant Olympus')
  tray.setContextMenu(contextMenu)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.whenReady().then(async () => {
  await initDb()
  process.env.GEMINI_CLI_TRUST_WORKSPACE = "true"
  createWindow()
  createTray()
})

ipcMain.handle('run-agent', async (_event, { provider, model, prompt }) => {
  try {
    let gatewayUrl = GATEWAY_URL;
    let apiKey = '';
    if (db) {
       try {
         const gwRow = db.prepare("SELECT value FROM settings WHERE key = 'gateway:config'").get();
         if (gwRow) {
           const parsed = JSON.parse(gwRow.value);
           if (parsed?.url) gatewayUrl = parsed.url;
         }
         const akRow = db.prepare("SELECT value FROM settings WHERE key = 'user:apiKey'").get();
         if (akRow) apiKey = akRow.value;
       } catch (e) {}
    }
    
    const baseUrl = gatewayUrl.replace(/\/$/, '');
    const runRes = await fetch(`${baseUrl}/runs`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
       },
       body: JSON.stringify({
         prompt,
         chain: [{ provider, model }]
       })
    });
    
    if (!runRes.ok) {
       const text = await runRes.text();
       return `Error: Gateway returned ${runRes.status} - ${text}`;
    }
    
    const { id } = await runRes.json();
    
    while (true) {
      await new Promise(r => setTimeout(r, 500));
      const pollRes = await fetch(`${baseUrl}/runs/${id}`, {
        headers: { ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) }
      });
      if (!pollRes.ok) continue;
      const run = await pollRes.json();
      
      if (run.status === 'complete') {
        const rawResponse = run.result?.response || '';
        // Split response into lines and filter out any lines starting with "Warning:" (case-insensitive)
        const lines = rawResponse.split(/\r?\n/);
        const cleanLines = lines.filter((line: string) => !line.trim().toLowerCase().startsWith('warning:'));
        const responseText = cleanLines.join('\n').trim();

        // If the gateway CLI execution succeeded but the output is actually a critical error
        if (/ModelNotFoundError|An unexpected critical error occurred|Error when talking to API/i.test(responseText)) {
           return `Error: Gateway execution failed - ${responseText.substring(0, 100)}`;
        }
        return responseText;
      }
      if (run.status === 'error' || run.status === 'killed') {
        return `Error: Gateway run failed with status ${run.status} - ${run.error || 'Unknown error'}`;
      }
    }
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
})

ipcMain.handle('get-user', async () => {
  try {
    return os.userInfo().username
  } catch (e) {
    return 'operator'
  }
})

ipcMain.handle('get-settings', async () => {
  if (!db) return {}
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all()
    const settings: Record<string, any> = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    return settings
  } catch (e) {
    return {}
  }
})

ipcMain.handle('save-setting', async (_event, { key, value }) => {
  if (!db) return false
  try {
    const val = typeof value === 'string' ? value : JSON.stringify(value)
    db.prepare(`
      INSERT INTO settings (key, value) 
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(key, val)
    return true
  } catch (e) {
    console.error('Failed to save setting:', key, e)
    return false
  }
})

ipcMain.handle('list-providers', async (_event, gatewayUrl?: string) => {
  const url = gatewayUrl || GATEWAY_URL
  const gatewayProviders = await getGatewayProviders(url)
  if (gatewayProviders.length > 0) {
    return {
      source: 'gateway',
      providers: gatewayProviders,
    }
  }

  return {
    source: 'gateway',
    providers: [],
  }
})

ipcMain.handle('get-db-status', async () => {
  if (!db) return 'offline'
  try {
    db.prepare('SELECT 1').get()
    return 'connected'
  } catch (e) {
    return 'offline'
  }
})

ipcMain.handle('pick-directory', async (_event, defaultPath) => {
  try {
    const opts: any = { properties: ['openDirectory'], title: 'Select Project Directory' }
    if (defaultPath && typeof defaultPath === 'string') opts.defaultPath = defaultPath
    const result = await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  } catch (e) {
    return null
  }
})

ipcMain.handle('list-directory', async (_event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name)
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (e) {
    return []
  }
})
