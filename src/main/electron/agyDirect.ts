import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { shell, BrowserWindow } from 'electron'

export interface AgyTokenData {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_at: number
  email?: string
  scope?: string
}

export interface AgyAuthStatus {
  authenticated: boolean
  email?: string
  expiresAt?: number
  error?: string
}

function resolveOAuthCredentials(): { clientId: string; clientSecret: string } {
  if (process.env.AGY_CLIENT_ID && process.env.AGY_CLIENT_SECRET) {
    return { clientId: process.env.AGY_CLIENT_ID, clientSecret: process.env.AGY_CLIENT_SECRET }
  }

  const candidatePaths = [
    path.join(os.homedir(), '.savant', 'agy_oauth_client.json'),
    path.join(os.homedir(), '.hermes', 'agy-direct', 'oauth_client.json'),
    path.join(os.homedir(), 'code', 'agy-direct', 'oauth_client.json'),
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'oauth_client.json'),
    path.join(os.homedir(), '.gemini', 'agy-direct', 'oauth_client.json'),
  ]

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'))
        if (parsed.client_id && parsed.client_secret) {
          return { clientId: parsed.client_id, clientSecret: parsed.client_secret }
        }
      }
    } catch {}
  }

  return { clientId: '', clientSecret: '' }
}

const { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } = resolveOAuthCredentials()
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo'
const CLOUDCODE_ENDPOINT = 'https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse'
const DEFAULT_MODEL = 'gemini-3.8-flash-high'
const PROJECT_ID = 'aicode-consumers'
const USER_AGENT = 'antigravity/hub/2.15.0 (aidev_client; os_type=darwin; arch=arm64; cl=983516863)'
const SCOPES = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs'
const SETTINGS_KEY = 'agy:auth_token'

let currentDb: any = null
let getWindowRef: (() => BrowserWindow | null) | null = null
let currentAuthStatus: AgyAuthStatus = { authenticated: false }
let activeAuthServer: http.Server | null = null
let activeAuthReject: ((reason?: any) => void) | null = null

function logInfo(msg: string) {
  console.log(`[AGY DIRECT] ${msg}`)
}

function logError(msg: string, err?: any) {
  console.error(`[AGY DIRECT] ${msg}`, err || '')
}

export function tryMigrateCliToken(db: any = currentDb): AgyTokenData | null {
  const targetDb = db || currentDb
  try {
    const cliTokenPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token')
    if (fs.existsSync(cliTokenPath)) {
      const content = fs.readFileSync(cliTokenPath, 'utf8')
      const parsed = JSON.parse(content)
      const tokenObj = parsed?.token
      if (tokenObj?.refresh_token) {
        logInfo('Discovered existing Antigravity CLI token, migrating into Savant Olympus DB...')
        const migrated: AgyTokenData = {
          access_token: tokenObj.access_token || '',
          refresh_token: tokenObj.refresh_token,
          token_type: tokenObj.token_type || 'Bearer',
          expires_at: tokenObj.expiry ? new Date(tokenObj.expiry).getTime() : Date.now() + 3600_000,
          scope: tokenObj.scope || 'https://www.googleapis.com/auth/cloud-platform',
        }
        if (targetDb) {
          saveStoredToken(targetDb, migrated)
        }
        return migrated
      }
    }
  } catch (err) {
    logError('Error checking CLI token seed file:', err)
  }
  return null
}

function getStoredToken(db: any): AgyTokenData | null {
  if (!db) return null
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY)
    if (row && row.value) {
      try {
        const parsed = JSON.parse(row.value)
        if (parsed?.refresh_token) {
          if (parsed.scope && !parsed.scope.includes('cloud-platform')) {
            logInfo('Stored token lacks cloud-platform scope. Attempting migration from Antigravity CLI...')
            const cliToken = tryMigrateCliToken(db)
            if (cliToken) return cliToken
          }
          return parsed
        }
      } catch {
        // ignore parse error
      }
    }
  } catch (e) {
    logError('Error querying settings for agy token:', e)
  }

  // Fallback / seed: check if ~/.gemini/antigravity-cli/antigravity-oauth-token exists on machine
  return tryMigrateCliToken(db)
}

function saveStoredToken(db: any, tokenData: AgyTokenData): void {
  if (!db) return
  try {
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(SETTINGS_KEY, JSON.stringify(tokenData))
    logInfo('Auth token successfully saved to Savant Olympus DB.')
  } catch (e) {
    logError('Failed to save auth token to Savant Olympus DB:', e)
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

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; scope?: string }> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Token refresh failed (HTTP ${res.status}): ${errText.slice(0, 200)}`)
  }

  const json = await res.json()
  return {
    access_token: json.access_token,
    expires_in: json.expires_in || 3600,
    scope: json.scope,
  }
}

async function fetchUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const data = await res.json()
      return data.email || undefined
    }
  } catch (err) {
    logError('Failed to fetch user email:', err)
  }
  return undefined
}

export async function getValidAccessToken(db: any = currentDb): Promise<string> {
  const stored = getStoredToken(db)
  if (!stored || !stored.refresh_token) {
    throw new Error('AGY Direct requires authentication. Please authenticate in Settings > Gateway > Direct Connect.')
  }

  // Valid if expires > 2 minutes from now
  if (stored.access_token && stored.expires_at > Date.now() + 120_000) {
    return stored.access_token
  }

  // Needs refresh
  try {
    logInfo('Access token expired or expiring soon; refreshing with Google OAuth...')
    const refreshed = await refreshAccessToken(stored.refresh_token)
    stored.access_token = refreshed.access_token
    stored.expires_at = Date.now() + refreshed.expires_in * 1000
    if (refreshed.scope) {
      stored.scope = refreshed.scope
    }

    if (!stored.email) {
      stored.email = await fetchUserEmail(stored.access_token)
    }

    saveStoredToken(db, stored)
    currentAuthStatus = {
      authenticated: true,
      email: stored.email,
      expiresAt: stored.expires_at,
    }
    notifyStatusChange()
    return stored.access_token
  } catch (err: any) {
    currentAuthStatus = {
      authenticated: false,
      error: err.message,
    }
    notifyStatusChange()
    throw err
  }
}

function notifyStatusChange() {
  if (getWindowRef) {
    const win = getWindowRef()
    if (win && !win.isDestroyed()) {
      win.webContents.send('agy-auth-status-changed', currentAuthStatus)
    }
  }
}

export async function checkAgyAuth(db: any = currentDb): Promise<AgyAuthStatus> {
  const stored = getStoredToken(db)
  if (!stored || !stored.refresh_token) {
    currentAuthStatus = {
      authenticated: false,
      error: 'No authentication token found in database',
    }
    return currentAuthStatus
  }

  try {
    const token = await getValidAccessToken(db)
    if (token) {
      const updated = getStoredToken(db)
      currentAuthStatus = {
        authenticated: true,
        email: updated?.email,
        expiresAt: updated?.expires_at,
      }
    }
  } catch (err: any) {
    currentAuthStatus = {
      authenticated: false,
      error: err?.message || 'Authentication validation failed',
    }
  }

  return currentAuthStatus
}

export function getAgyAuthStatus(): AgyAuthStatus {
  return currentAuthStatus
}

export async function initAgyDirect(db: any, winSupplier: () => BrowserWindow | null): Promise<AgyAuthStatus> {
  currentDb = db
  getWindowRef = winSupplier

  logInfo('Initializing AGY Direct on startup...')
  const status = await checkAgyAuth(db)
  if (status.authenticated) {
    logInfo(`Startup auth check: User is AUTHENTICATED (${status.email || 'token verified'}).`)
  } else {
    logInfo(`Startup auth check: User is NOT AUTHENTICATED (${status.error || 'auth required'}).`)
  }
  notifyStatusChange()
  return status
}

export function cancelAgyBrowserAuth(): boolean {
  if (activeAuthServer) {
    try {
      activeAuthServer.close()
    } catch {}
    activeAuthServer = null
  }
  if (activeAuthReject) {
    activeAuthReject(new Error('Authentication cancelled by user.'))
    activeAuthReject = null
  }
  return true
}

export async function disconnectAgyAuth(db: any = currentDb): Promise<boolean> {
  cancelAgyBrowserAuth()
  deleteStoredToken(db || currentDb)
  currentAuthStatus = { authenticated: false }
  notifyStatusChange()
  return true
}

export async function startAgyBrowserAuth(db: any = currentDb): Promise<{ success: boolean; email?: string; error?: string }> {
  cancelAgyBrowserAuth()

  return new Promise((resolve, reject) => {
    activeAuthReject = reject

    // Generate PKCE credentials and CSRF state
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    const state = crypto.randomBytes(16).toString('hex')

    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url || !req.url.startsWith('/oauth/callback')) {
          res.writeHead(404)
          res.end('Not found')
          return
        }

        const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
        const code = parsedUrl.searchParams.get('code')
        const returnedState = parsedUrl.searchParams.get('state')
        const error = parsedUrl.searchParams.get('error')

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderAuthHtml(false, `Google authentication error: ${error}`))
          server.close()
          activeAuthServer = null
          reject(new Error(`Google authentication failed: ${error}`))
          return
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderAuthHtml(false, 'Invalid state or missing authorization code.'))
          server.close()
          activeAuthServer = null
          reject(new Error('State mismatch or missing authorization code.'))
          return
        }

        // Render success page to the user in browser
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderAuthHtml(true, 'Authentication successful! You can safely close this tab and return to Savant Olympus.'))

        server.close()
        activeAuthServer = null

        // Exchange authorization code for tokens
        logInfo('Exchanging authorization code with Google OAuth endpoint...')
        const address = server.address() as any
        const callbackPort = address?.port || 51121
        const redirectUri = `http://127.0.0.1:${callbackPort}/oauth/callback`

        const tokenParams = new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        })

        const tokenRes = await fetch(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams.toString(),
        })

        if (!tokenRes.ok) {
          const errDetail = await tokenRes.text().catch(() => '')
          throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${errDetail.slice(0, 200)}`)
        }

        const tokenPayload = await tokenRes.json()
        const userEmail = await fetchUserEmail(tokenPayload.access_token)

        const tokenData: AgyTokenData = {
          access_token: tokenPayload.access_token,
          refresh_token: tokenPayload.refresh_token,
          token_type: tokenPayload.token_type || 'Bearer',
          expires_at: Date.now() + (tokenPayload.expires_in || 3600) * 1000,
          email: userEmail,
          scope: tokenPayload.scope,
        }

        // Save token in Savant Olympus DB
        saveStoredToken(db || currentDb, tokenData)

        currentAuthStatus = {
          authenticated: true,
          email: userEmail,
          expiresAt: tokenData.expires_at,
        }
        notifyStatusChange()
        logInfo(`User successfully authenticated via browser as: ${userEmail || 'verified'}.`)
        resolve({ success: true, email: userEmail })
      } catch (e: any) {
        logError('Error handling OAuth callback:', e)
        currentAuthStatus = { authenticated: false, error: e.message }
        notifyStatusChange()
        reject(e)
      }
    })

    activeAuthServer = server

    // Try listening on port 51121, or let OS pick an available port on failure
    const startListen = (portToTry: number) => {
      server.listen(portToTry, '127.0.0.1', () => {
        const address = server.address() as any
        const boundPort = address.port
        logInfo(`OAuth callback listener active on http://127.0.0.1:${boundPort}/oauth/callback`)

        const redirectUri = `http://127.0.0.1:${boundPort}/oauth/callback`
        const authUrlParams = new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: SCOPES,
          access_type: 'offline',
          prompt: 'consent',
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        })

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authUrlParams.toString()}`
        logInfo(`Opening browser for authentication: ${authUrl.slice(0, 80)}...`)
        shell.openExternal(authUrl).catch((err) => {
          logError('Failed to launch system browser for auth:', err)
          server.close()
          activeAuthServer = null
          reject(new Error(`Failed to launch browser: ${err.message}`))
        })
      })
    }

    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logInfo('Port 51121 is in use; retrying with ephemeral port 0...')
        startListen(0)
      } else {
        logError('OAuth HTTP server error:', err)
        activeAuthServer = null
        reject(err)
      }
    })

    startListen(51121)

    // Timeout after 5 minutes
    setTimeout(() => {
      if (activeAuthServer === server) {
        server.close()
        activeAuthServer = null
        reject(new Error('Browser authentication timed out after 5 minutes.'))
      }
    }, 5 * 60 * 1000)
  })
}

function renderAuthHtml(success: boolean, message: string): string {
  const title = success ? 'AGY DIRECT AUTHENTICATED' : 'AUTHENTICATION FAILED'
  const color = success ? '#00e5ff' : '#ff4466'
  const borderColor = success ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 68, 102, 0.4)'
  const glow = success ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255, 68, 102, 0.25)'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Savant Olympus - ${title}</title>
  <style>
    body {
      background-color: #0d0d0d;
      color: #e5e5e5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #141414;
      border: 1px solid ${borderColor};
      box-shadow: 0 0 30px ${glow};
      border-radius: 8px;
      padding: 36px 44px;
      max-width: 500px;
      text-align: center;
    }
    h1 {
      color: ${color};
      font-size: 20px;
      font-family: 'Share Tech Mono', monospace, sans-serif;
      letter-spacing: 1.5px;
      margin: 0 0 16px;
    }
    p {
      color: #a3a3a3;
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 16px;
    }
    .hint {
      font-size: 12px;
      color: #737373;
      margin: 20px 0 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="hint">You can safely close this browser tab and return to Savant Olympus.</p>
  </div>
</body>
</html>`
}

export async function runAgyDirectPrompt(
  prompt: string,
  model: string = DEFAULT_MODEL,
  thinkingLevel: string = 'LOW'
): Promise<{ response: string; provider: string; model: string }> {
  const accessToken = await getValidAccessToken()
  const effectiveModel = model || DEFAULT_MODEL
  const requestId = `direct-${Date.now()}-${process.pid}`

  const thinkingLevelUpper = (thinkingLevel || 'LOW').toUpperCase()
  const resolvedThinkingLevel = thinkingLevelUpper === 'HIGH' ? 'HIGH' : thinkingLevelUpper === 'MEDIUM' ? 'MEDIUM' : 'LOW'

  const requestBody = {
    project: PROJECT_ID,
    requestId,
    request: {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: -1,
          thinkingLevel: resolvedThinkingLevel,
        },
      },
      sessionId: requestId,
    },
    model: effectiveModel,
    userAgent: 'antigravity',
    requestType: 'agent',
  }

  logInfo(`Invoking CloudCode API model=${effectiveModel}...`)
  let response = await fetch(CLOUDCODE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    let errorText = await response.text().catch(() => '')
    logError(`CloudCode API returned ${response.status}: ${errorText.slice(0, 200)}`)

    // Self-healing: if insufficient scopes, attempt migration from Antigravity CLI credentials
    if (response.status === 403 && errorText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
      logInfo('Scope insufficient on CloudCode API. Attempting recovery from Antigravity CLI credentials...')
      const cliToken = tryMigrateCliToken(currentDb)
      if (cliToken) {
        try {
          const freshAccessToken = await getValidAccessToken()
          response = await fetch(CLOUDCODE_ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${freshAccessToken}`,
              'User-Agent': USER_AGENT,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          })
          if (!response.ok) {
            errorText = await response.text().catch(() => '')
          }
        } catch (retryErr) {
          logError('Retry with recovered CLI token failed:', retryErr)
        }
      }
    }

    if (!response.ok) {
      throw new Error(`AGY Direct upstream error (HTTP ${response.status}): ${errorText.slice(0, 300)}`)
    }
  }

  const rawSse = await response.text()
  const fullTextParts: string[] = []

  const lines = rawSse.split(/\r?\n/)
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataStr = line.slice(6).trim()
      if (!dataStr || dataStr === '[DONE]') continue
      try {
        const frame = JSON.parse(dataStr)
        const candidates = frame?.response?.candidates || []
        for (const candidate of candidates) {
          const parts = candidate?.content?.parts || []
          for (const part of parts) {
            if (part?.text && !part.thought) {
              fullTextParts.push(part.text)
            }
          }
        }
      } catch {
        // Skip malformed SSE frame
      }
    }
  }

  const resultText = fullTextParts.join('')
  logInfo(`CloudCode response received: ${resultText.length} chars.`)

  return {
    response: resultText,
    provider: 'agy',
    model: effectiveModel,
  }
}
