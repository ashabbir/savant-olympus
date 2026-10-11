import { shell, BrowserWindow } from 'electron'

export interface CopilotTokenData {
  github_token: string
  copilot_token: string
  copilot_expires_at: number
  username?: string
  base_url?: string
}

export interface CopilotAuthStatus {
  authenticated: boolean
  username?: string
  expiresAt?: number
  userCode?: string
  verificationUri?: string
  error?: string
}

const CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const DEFAULT_COPILOT_BASE_URL = 'https://api.individual.githubcopilot.com'
const DEFAULT_MODEL = 'gpt-4o'
const SETTINGS_KEY = 'copilot:auth_token'

let currentDb: any = null
let getWindowRef: (() => BrowserWindow | null) | null = null
let currentAuthStatus: CopilotAuthStatus = { authenticated: false }
let activePollingAbort: AbortController | null = null

function logInfo(msg: string) {
  console.log(`[COPILOT DIRECT] ${msg}`)
}

function logError(msg: string, err?: any) {
  console.error(`[COPILOT DIRECT] ${msg}`, err || '')
}

function getStoredToken(db: any): CopilotTokenData | null {
  if (!db) return null
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY)
    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value)
        if (parsed?.github_token || parsed?.copilot_token) return parsed
      } catch {}
    }
  } catch (e) {
    logError('Error querying settings for copilot token:', e)
  }
  return null
}

function saveStoredToken(db: any, tokenData: CopilotTokenData): void {
  if (!db) return
  try {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(SETTINGS_KEY, JSON.stringify(tokenData))
    logInfo('Auth token successfully saved to Savant Olympus DB.')
  } catch (e) {
    logError('Failed to save auth token to DB:', e)
  }
}

function deleteStoredToken(db: any): void {
  if (!db) return
  try {
    db.prepare('DELETE FROM settings WHERE key = ?').run(SETTINGS_KEY)
    logInfo('Auth token removed from Savant Olympus DB.')
  } catch (e) {
    logError('Failed to remove auth token from DB:', e)
  }
}

function deriveBaseUrl(token: string): string {
  const match = token.match(/(?:^|;)\s*proxy-ep=([^;\s]+)/i)
  const proxyEp = match?.[1]?.trim()
  if (!proxyEp) return DEFAULT_COPILOT_BASE_URL
  const host = proxyEp.replace(/^https?:\/\//, '').replace(/^proxy\./i, 'api.')
  return host ? `https://${host}` : DEFAULT_COPILOT_BASE_URL
}

async function exchangeCopilotToken(githubToken: string): Promise<{ token: string; expires_at: number; baseUrl: string }> {
  const res = await fetch(COPILOT_TOKEN_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${githubToken}`,
      'User-Agent': 'GitHubCopilotChat/0.22.0',
    },
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Copilot token exchange failed (HTTP ${res.status}): ${errText.slice(0, 200)}`)
  }

  const json = await res.json()
  const rawToken = json.token
  const rawExpires = json.expires_at

  let expiresAtMs: number
  if (typeof rawExpires === 'number') {
    expiresAtMs = rawExpires > 10_000_000_000 ? rawExpires : rawExpires * 1000
  } else if (typeof rawExpires === 'string') {
    const parsed = parseInt(rawExpires, 10)
    expiresAtMs = parsed > 10_000_000_000 ? parsed : parsed * 1000
  } else {
    expiresAtMs = Date.now() + 30 * 60 * 1000
  }

  return {
    token: rawToken,
    expires_at: expiresAtMs,
    baseUrl: deriveBaseUrl(rawToken),
  }
}

async function fetchGithubUsername(githubToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(GITHUB_USER_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'Savant-Olympus',
      },
    })
    if (res.ok) {
      const data = await res.json()
      return data.login || undefined
    }
  } catch (err) {
    logError('Failed to fetch GitHub username:', err)
  }
  return undefined
}

export async function getValidCopilotToken(db: any = currentDb): Promise<{ token: string; baseUrl: string }> {
  const stored = getStoredToken(db)
  if (!stored || !stored.github_token) {
    throw new Error('Copilot Direct requires authentication. Please authenticate in Settings > Gateway > Direct Connect.')
  }

  // If copilot_token is valid for more than 3 minutes, use it
  if (stored.copilot_token && stored.copilot_expires_at > Date.now() + 3 * 60 * 1000) {
    return {
      token: stored.copilot_token,
      baseUrl: stored.base_url || DEFAULT_COPILOT_BASE_URL,
    }
  }

  // Otherwise, refresh copilot token using github_token
  logInfo('Copilot token expired or expiring soon; exchanging for fresh token...')
  const exchanged = await exchangeCopilotToken(stored.github_token)
  stored.copilot_token = exchanged.token
  stored.copilot_expires_at = exchanged.expires_at
  stored.base_url = exchanged.baseUrl

  if (!stored.username) {
    stored.username = await fetchGithubUsername(stored.github_token)
  }

  saveStoredToken(db, stored)
  currentAuthStatus = {
    authenticated: true,
    username: stored.username,
    expiresAt: stored.copilot_expires_at,
  }
  notifyStatusChange()

  return {
    token: stored.copilot_token,
    baseUrl: stored.base_url,
  }
}

function notifyStatusChange() {
  if (getWindowRef) {
    const win = getWindowRef()
    if (win && !win.isDestroyed()) {
      win.webContents.send('copilot-auth-status-changed', currentAuthStatus)
    }
  }
}

export async function checkCopilotAuth(db: any = currentDb): Promise<CopilotAuthStatus> {
  const stored = getStoredToken(db)
  if (!stored || !stored.github_token) {
    currentAuthStatus = {
      authenticated: false,
      error: 'No authentication token found in database',
    }
    return currentAuthStatus
  }

  try {
    const valid = await getValidCopilotToken(db)
    if (valid) {
      const updated = getStoredToken(db)
      currentAuthStatus = {
        authenticated: true,
        username: updated?.username,
        expiresAt: updated?.copilot_expires_at,
      }
    }
  } catch (err: any) {
    currentAuthStatus = {
      authenticated: false,
      error: err?.message || 'Copilot authentication validation failed',
    }
  }

  return currentAuthStatus
}

export function getCopilotAuthStatus(): CopilotAuthStatus {
  return currentAuthStatus
}

export async function initCopilotDirect(db: any, winSupplier: () => BrowserWindow | null): Promise<CopilotAuthStatus> {
  currentDb = db
  getWindowRef = winSupplier

  logInfo('Initializing Copilot Direct on startup...')
  const status = await checkCopilotAuth(db)
  if (status.authenticated) {
    logInfo(`Startup auth check: User is AUTHENTICATED (${status.username || 'token verified'}).`)
  } else {
    logInfo(`Startup auth check: User is NOT AUTHENTICATED (${status.error || 'auth required'}).`)
  }
  notifyStatusChange()
  return status
}

export function cancelCopilotBrowserAuth(): boolean {
  if (activePollingAbort) {
    activePollingAbort.abort()
    activePollingAbort = null
  }
  currentAuthStatus = {
    ...currentAuthStatus,
    userCode: undefined,
    verificationUri: undefined,
  }
  notifyStatusChange()
  return true
}

export async function disconnectCopilotAuth(db: any = currentDb): Promise<boolean> {
  cancelCopilotBrowserAuth()
  deleteStoredToken(db || currentDb)
  currentAuthStatus = { authenticated: false }
  notifyStatusChange()
  return true
}

export async function startCopilotBrowserAuth(
  db: any = currentDb
): Promise<{ success: boolean; username?: string; userCode?: string; verificationUri?: string; error?: string }> {
  cancelCopilotBrowserAuth()

  // 1. Request device code
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'read:user',
  })

  const codeRes = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!codeRes.ok) {
    const errText = await codeRes.text().catch(() => '')
    throw new Error(`Failed to request GitHub device code (HTTP ${codeRes.status}): ${errText.slice(0, 200)}`)
  }

  const deviceData = await codeRes.json()
  const { device_code, user_code, verification_uri, expires_in, interval } = deviceData

  if (!device_code || !user_code || !verification_uri) {
    throw new Error('Incomplete response from GitHub device code service.')
  }

  logInfo(`Device code received: user_code=${user_code}, verification_uri=${verification_uri}`)

  // Update status with code so UI displays it
  currentAuthStatus = {
    ...currentAuthStatus,
    userCode: user_code,
    verificationUri: verification_uri,
  }
  notifyStatusChange()

  // Open browser for user authorization
  shell.openExternal(verification_uri).catch((err) => {
    logError('Failed to launch browser for GitHub auth:', err)
  })

  // 2. Poll for token
  const abortController = new AbortController()
  activePollingAbort = abortController

  const expiresAt = Date.now() + (expires_in || 900) * 1000
  let pollIntervalMs = Math.max(1000, (interval || 5) * 1000)

  try {
    while (Date.now() < expiresAt) {
      if (abortController.signal.aborted) {
        throw new Error('Authentication cancelled by user.')
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

      if (abortController.signal.aborted) {
        throw new Error('Authentication cancelled by user.')
      }

      const pollBody = new URLSearchParams({
        client_id: CLIENT_ID,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      })

      const pollRes = await fetch(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: pollBody.toString(),
        signal: abortController.signal,
      })

      if (!pollRes.ok) {
        continue
      }

      const tokenJson = await pollRes.json()

      if (tokenJson.access_token) {
        const githubToken = tokenJson.access_token
        logInfo('GitHub authorization granted! Exchanging for Copilot token...')

        const copilotTokenRes = await exchangeCopilotToken(githubToken)
        const username = await fetchGithubUsername(githubToken)

        const tokenData: CopilotTokenData = {
          github_token: githubToken,
          copilot_token: copilotTokenRes.token,
          copilot_expires_at: copilotTokenRes.expires_at,
          username,
          base_url: copilotTokenRes.baseUrl,
        }

        saveStoredToken(db || currentDb, tokenData)

        currentAuthStatus = {
          authenticated: true,
          username,
          expiresAt: tokenData.copilot_expires_at,
          userCode: undefined,
          verificationUri: undefined,
        }
        notifyStatusChange()
        logInfo(`User successfully authenticated with Copilot as: ${username || 'verified'}.`)
        activePollingAbort = null
        return { success: true, username }
      }

      const err = tokenJson.error
      if (err === 'authorization_pending') {
        continue
      }
      if (err === 'slow_down') {
        pollIntervalMs += 5000
        continue
      }
      if (err === 'expired_token') {
        throw new Error('GitHub device code expired. Please try again.')
      }
      if (err === 'access_denied') {
        throw new Error('GitHub authorization was denied.')
      }
      if (err) {
        throw new Error(`GitHub error: ${err}`)
      }
    }

    throw new Error('Device authentication timed out.')
  } finally {
    activePollingAbort = null
  }
}

export async function runCopilotDirectPrompt(
  prompt: string,
  model: string = DEFAULT_MODEL
): Promise<{ response: string; provider: string; model: string }> {
  const { token, baseUrl } = await getValidCopilotToken()
  const effectiveModel = model || DEFAULT_MODEL
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

  logInfo(`Invoking Copilot Chat API (${endpoint}) model=${effectiveModel}...`)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Editor-Version': 'vscode/1.95.0',
      'Editor-Plugin-Version': 'copilot-chat/0.22.0',
      'User-Agent': 'GitHubCopilotChat/0.22.0',
      'Openai-Organization': 'github-copilot',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      model: effectiveModel,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    logError(`Copilot API returned ${response.status}: ${errorText.slice(0, 200)}`)
    throw new Error(`Copilot Direct upstream error (HTTP ${response.status}): ${errorText.slice(0, 300)}`)
  }

  const json = await response.json()
  const choice = json.choices?.[0]
  const content = choice?.message?.content || ''
  logInfo(`Copilot response received: ${content.length} chars.`)

  return {
    response: content,
    provider: 'copilot',
    model: effectiveModel,
  }
}
