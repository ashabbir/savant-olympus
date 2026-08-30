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
      CREATE TABLE IF NOT EXISTS chat_history (
        target_id TEXT PRIMARY KEY,
        messages TEXT,
        title TEXT,
        context TEXT,
        kind TEXT DEFAULT 'general',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    const chatHistoryColumns = new Set(
      db.prepare('PRAGMA table_info(chat_history)').all().map((column: any) => column.name)
    )
    if (!chatHistoryColumns.has('title')) db.exec('ALTER TABLE chat_history ADD COLUMN title TEXT')
    if (!chatHistoryColumns.has('context')) db.exec('ALTER TABLE chat_history ADD COLUMN context TEXT')
    if (!chatHistoryColumns.has('kind')) db.exec("ALTER TABLE chat_history ADD COLUMN kind TEXT DEFAULT 'general'")
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
      const response = await fetch(`${baseUrl}${endpoint}`, {
        signal: controller.signal,
        headers: { 'X-App-Name': 'savant-olympus' },
      })
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

async function runGatewayAgent(provider: string, model: string, prompt: string) {
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
        'X-App-Name': 'savant-olympus',
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

    // Bound the poll loop. Without a deadline a run that never reaches a
    // terminal status (or a gateway that stops responding) leaves the
    // renderer's awaited `runAgentViaGateway` promise pending forever while
    // this loop issues a fetch every 500ms indefinitely.
    const POLL_INTERVAL_MS = 500;
    const POLL_TIMEOUT_MS = 10 * 60 * 1000;
    const MAX_CONSECUTIVE_POLL_FAILURES = 20;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let consecutiveFailures = 0;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      const pollRes = await fetch(`${baseUrl}/runs/${id}`, {
        headers: { 'X-App-Name': 'savant-olympus', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) }
      });
      if (!pollRes.ok) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
          return `Error: Gateway stopped responding while polling run ${id} (last status ${pollRes.status}).`;
        }
        continue;
      }
      consecutiveFailures = 0;
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

    return `Error: Gateway run ${id} did not complete within ${Math.round(POLL_TIMEOUT_MS / 1000)}s.`;
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

ipcMain.handle('run-agent', async (_event, { provider, model, prompt }) => runGatewayAgent(provider, model, prompt))

ipcMain.handle('export-document', async (event, { format, html, defaultFilename }) => {
  if ((format !== 'html' && format !== 'pdf') || typeof html !== 'string' || !html.trim()) {
    throw new Error('Invalid document export request.')
  }

  const extension = format === 'pdf' ? 'pdf' : 'html'
  const filename = String(defaultFilename || `athena-export.${extension}`)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
  const owner = BrowserWindow.fromWebContents(event.sender) || undefined
  const saveOptions = {
    title: `Export ATHENA ${format.toUpperCase()}`,
    defaultPath: filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`,
    filters: [{ name: format === 'pdf' ? 'PDF Document' : 'HTML Document', extensions: [extension] }],
  }
  const result = owner
    ? await dialog.showSaveDialog(owner, saveOptions)
    : await dialog.showSaveDialog(saveOptions)
  if (result.canceled || !result.filePath) return null

  if (format === 'html') {
    await fs.writeFile(result.filePath, html, 'utf8')
    return result.filePath
  }

  const exportWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  })
  try {
    await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await exportWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'default' },
    })
    await fs.writeFile(result.filePath, pdf)
    return result.filePath
  } finally {
    exportWindow.destroy()
  }
})

ipcMain.handle('save-athena-thread', async (_event, { target_id, messages, title, context, kind }) => {
  if (!db) return false
  try {
    const val = typeof messages === 'string' ? messages : JSON.stringify(messages)
    const contextValue = context == null
      ? null
      : typeof context === 'string'
        ? context
        : JSON.stringify(context)
    db.prepare(`
      INSERT INTO chat_history (target_id, messages, title, context, kind, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(target_id) DO UPDATE SET
        messages=excluded.messages,
        title=COALESCE(excluded.title, chat_history.title),
        context=COALESCE(excluded.context, chat_history.context),
        kind=COALESCE(excluded.kind, chat_history.kind),
        updated_at=CURRENT_TIMESTAMP
    `).run(target_id, val, title || null, contextValue, kind || null)
    return true
  } catch (e) {
    console.error('Failed to save athena thread:', target_id, e)
    return false
  }
})

ipcMain.handle('load-athena-threads', async (_event, kind?: string) => {
  if (!db) return []
  try {
    const rows = kind
      ? db.prepare('SELECT target_id, messages, title, context, kind, updated_at FROM chat_history WHERE kind = ? ORDER BY updated_at DESC').all(kind)
      : db.prepare('SELECT target_id, messages, title, context, kind, updated_at FROM chat_history ORDER BY updated_at DESC').all()
    return rows.map((row: any) => {
      try {
        return {
          target_id: row.target_id,
          title: row.title,
          context: row.context ? JSON.parse(row.context) : null,
          kind: row.kind,
          messages: JSON.parse(row.messages),
          updated_at: row.updated_at,
        }
      } catch {
        return {
          target_id: row.target_id,
          title: row.title,
          context: null,
          kind: row.kind,
          messages: [],
          updated_at: row.updated_at,
        }
      }
    })
  } catch (e) {
    return []
  }
})

ipcMain.handle('get-chat-history', async (_event, target_id) => {
  if (!db) return []
  try {
    const row = db.prepare('SELECT messages FROM chat_history WHERE target_id = ?').get(target_id)
    if (!row) return []
    return JSON.parse(row.messages)
  } catch (e) {
    return []
  }
})

ipcMain.handle('clear-athena-thread', async (_event, target_id) => {
  if (!db) return false
  try {
    db.prepare('DELETE FROM chat_history WHERE target_id = ?').run(target_id)
    return true
  } catch (e) {
    return false
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

const SKILL_EXPORT_PROFILES = {
  codex: { label: 'Codex', presencePath: path.join(os.homedir(), '.codex'), directory: path.join(os.homedir(), '.codex', 'skills'), format: 'Agent Skills / SKILL.md' },
  claude: { label: 'Claude', presencePath: path.join(os.homedir(), '.claude'), directory: path.join(os.homedir(), '.claude', 'skills'), format: 'Claude Code Skill' },
  copilot: { label: 'Copilot', presencePath: path.join(os.homedir(), '.copilot'), directory: path.join(os.homedir(), '.copilot', 'skills'), format: 'GitHub Copilot Agent Skill' },
  agy: { label: 'AGY', presencePath: path.join(os.homedir(), '.agents'), directory: path.join(os.homedir(), '.agents', 'skills'), format: 'AGY Workspace Skill' },
  hermes: { label: 'Hermes', presencePath: path.join(os.homedir(), '.hermes'), directory: path.join(os.homedir(), '.hermes', 'skills', 'custom'), format: 'Hermes Agent Skill' },
} as const

const SAVANT_DEFAULT_SKILL_IDS = new Set([
  'savant-session-workspace',
  'savant-knowledge-commit',
  'savant-code-analysis',
])

type SkillFile = { path: string; content: string }
type DefaultSkillPackage = { id: string; files: SkillFile[] }

async function installDefaultSkillsForPresentProviders(payload: unknown) {
  const packages = Array.isArray((payload as any)?.skills) ? (payload as any).skills : []
  const skills: DefaultSkillPackage[] = packages.filter((skill: any) => (
    skill
    && SAVANT_DEFAULT_SKILL_IDS.has(String(skill.id || ''))
    && Array.isArray(skill.files)
    && skill.files.some((file: any) => file?.path === 'SKILL.md' && typeof file.content === 'string')
  )).map((skill: any) => ({
    id: String(skill.id),
    files: skill.files.map((file: any) => ({ path: String(file.path || ''), content: file.content })),
  }))

  const providers: Record<string, { present: boolean; installed: string[]; existing: string[]; error?: string }> = {}
  for (const [provider, profile] of Object.entries(SKILL_EXPORT_PROFILES)) {
    try {
      await fs.access(profile.presencePath)
    } catch {
      providers[provider] = { present: false, installed: [], existing: [] }
      continue
    }

    const installed: string[] = []
    const existing: string[] = []
    try {
      await fs.mkdir(profile.directory, { recursive: true })
      for (const skill of skills) {
        const targetDir = path.join(profile.directory, skill.id)
        try {
          await fs.access(path.join(targetDir, 'SKILL.md'))
          existing.push(skill.id)
          continue
        } catch {
          // A missing skill is installed below. Existing files are never overwritten.
        }

        const temporaryDir = path.join(profile.directory, `.installing-${skill.id}-${Date.now()}`)
        await fs.mkdir(temporaryDir, { recursive: false })
        try {
          for (const file of skill.files) {
            const relativePath = file.path.replace(/\\/g, '/')
            const destination = path.resolve(temporaryDir, relativePath)
            if (!relativePath || path.isAbsolute(relativePath) || relativePath.split('/').includes('..') || !destination.startsWith(`${temporaryDir}${path.sep}`)) {
              throw new Error(`Unsafe skill path: ${relativePath || '<empty>'}`)
            }
            if (typeof file.content !== 'string') throw new Error(`Skill file must be text: ${relativePath}`)
            await fs.mkdir(path.dirname(destination), { recursive: true })
            await fs.writeFile(destination, file.content, 'utf8')
          }
          await fs.access(path.join(temporaryDir, 'SKILL.md'))
          await fs.rename(temporaryDir, targetDir)
          installed.push(skill.id)
        } catch (error) {
          await fs.rm(temporaryDir, { recursive: true, force: true })
          throw error
        }
      }
      providers[provider] = { present: true, installed, existing }
    } catch (error: any) {
      providers[provider] = { present: true, installed, existing, error: error?.message || String(error) }
    }
  }
  return { providers }
}

ipcMain.handle('get-skill-export-profiles', () => SKILL_EXPORT_PROFILES)

ipcMain.handle('install-default-skills', async (_event, payload) => installDefaultSkillsForPresentProviders(payload))

ipcMain.handle('export-skill-package', async (_event, payload) => {
  const provider = String(payload?.provider || '') as keyof typeof SKILL_EXPORT_PROFILES
  const profile = SKILL_EXPORT_PROFILES[provider]
  const name = String(payload?.name || '')
  const destinationRoot = path.resolve(String(payload?.destinationRoot || ''))
  const files = Array.isArray(payload?.files) ? payload.files : []
  if (!profile) throw new Error('Unsupported skill provider')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error('Invalid skill name')
  if (!destinationRoot || files.length === 0 || files.length > 128) throw new Error('Invalid skill export payload')

  const targetDir = path.join(destinationRoot, name)
  const tempDir = path.join(destinationRoot, `.installing-${name}-${Date.now()}`)
  try {
    await fs.mkdir(destinationRoot, { recursive: true })
    try {
      await fs.access(targetDir)
      throw new Error(`A skill named ${name} already exists in this directory`)
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
    }
    await fs.mkdir(tempDir, { recursive: false })
    for (const entry of files) {
      const relPath = String(entry?.path || '').replace(/\\/g, '/')
      const content = entry?.content
      const resolved = path.resolve(tempDir, relPath)
      if (!relPath || path.isAbsolute(relPath) || relPath.split('/').includes('..') || !resolved.startsWith(`${tempDir}${path.sep}`)) {
        throw new Error(`Unsafe skill path: ${relPath || '<empty>'}`)
      }
      if (typeof content !== 'string') throw new Error(`Skill file must be text: ${relPath}`)
      await fs.mkdir(path.dirname(resolved), { recursive: true })
      await fs.writeFile(resolved, content, 'utf8')
      if (relPath.startsWith('scripts/') && /\.(sh|bash|py|js|mjs)$/.test(relPath)) await fs.chmod(resolved, 0o755)
    }
    await fs.access(path.join(tempDir, 'SKILL.md'))
    await fs.rename(tempDir, targetDir)
    return { provider, path: targetDir, format: profile.format }
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true })
    throw error
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

ipcMain.handle('read-graphify-json', async (_event, repoPath) => {
  try {
    let resolvedPath = repoPath
    if (repoPath.startsWith('/base-code/')) {
      resolvedPath = repoPath.replace('/base-code/', '/Users/home/code/')
    }
    const filePath = path.join(resolvedPath, 'graphify-out', 'graph.json')
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch (e) {
    return null
  }
})
