import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5174/'
const shouldStartRenderer = process.argv.includes('--with-renderer')
const waitTimeoutMs = Number(process.env.OLYMPUS_DEV_SERVER_TIMEOUT_MS || 120_000)

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${signal || code}`))
      }
    })
  })
}

function requestServer(url, requestTimeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(true)
    })

    req.on('error', () => resolve(false))
    req.setTimeout(requestTimeoutMs, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForServer(url, timeoutMs = waitTimeoutMs) {
  const deadline = Date.now() + timeoutMs
  let attempts = 0

  while (Date.now() < deadline) {
    attempts += 1
    if (await requestServer(url)) {
      return
    }

    if (attempts === 1 || attempts % 20 === 0) {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      console.log(`[OLYMPUS] Waiting for renderer dev server at ${url} (${remaining}s remaining)`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms. If the renderer is still optimizing dependencies, retry or set OLYMPUS_DEV_SERVER_TIMEOUT_MS to a larger value.`)
}

function startRendererIfNeeded() {
  if (!shouldStartRenderer) return null

  const args = [
    path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--config',
    path.join(rootDir, 'vite.config.mts'),
    '--force',
    '--host',
    '127.0.0.1',
    '--port',
    '5174',
    '--strictPort',
  ]

  console.log(`[OLYMPUS] Starting renderer dev server: ${process.execPath} ${args.join(' ')}`)
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      QUORUM_RENDERER_ONLY: '1',
    },
  })

  child.exitPromise = new Promise((_, reject) => {
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      const status = signal || code
      const message = `[OLYMPUS] Renderer dev server exited with ${status}`
      if (code !== 0 || signal) {
        reject(new Error(message))
      } else {
        reject(new Error(`${message} before ${devServerUrl} became ready`))
      }
    })
  })

  return child
}

let rendererProcess = null
let electronProcess = null

const stopChildren = () => {
  if (electronProcess && !electronProcess.killed) electronProcess.kill()
  if (rendererProcess && !rendererProcess.killed) rendererProcess.kill()
}

process.on('SIGINT', stopChildren)
process.on('SIGTERM', stopChildren)
process.on('exit', stopChildren)

await run(process.execPath, [
  path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build',
  '--config',
  'vite.electron.config.mts',
  '--mode',
  'development',
])

if (shouldStartRenderer && !(await requestServer(devServerUrl))) {
  rendererProcess = startRendererIfNeeded()
}

if (rendererProcess?.exitPromise) {
  await Promise.race([
    waitForServer(devServerUrl),
    rendererProcess.exitPromise,
  ])
} else {
  await waitForServer(devServerUrl)
}

console.log(`[OLYMPUS] Renderer ready at ${devServerUrl}`)
const electronArgs = ['.', ...(process.env.ELECTRON_CDP_PORT ? [`--remote-debugging-port=${process.env.ELECTRON_CDP_PORT}`] : [])]
electronProcess = spawn(electron, electronArgs, {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
})

electronProcess.on('exit', (code) => {
  stopChildren()
  process.exit(code ?? 0)
})
