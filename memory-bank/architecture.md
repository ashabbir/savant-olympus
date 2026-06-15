# Architecture Overview

## What this project is

Savant Olympus is a desktop control surface for Savant. It packages a React renderer inside Electron and talks to the Savant server/gateway/MCP services over HTTP, SSE, and Electron IPC. The renderer is organized as operational tabs rather than a chat interface.

## Runtime components

1. Electron main process
   - Source: `src/main/electron/main.ts`.
   - Initializes a local SQLite settings store under `~/.savant/quorum.db`.
   - Creates the BrowserWindow and tray.
   - Exposes IPC handlers for local settings, provider discovery, local directory browsing, and gateway agent run forwarding.

2. Electron preload bridge
   - Source: `src/main/electron/preload.ts`.
   - Exposes `window.system`, `window.electronAPI`, and a low-level `window.ipcRenderer` shim to the renderer.
   - Renderer code should prefer typed/narrow bridge methods over broad `ipcRenderer.invoke` usage.

3. React renderer
   - Entrypoint: `src/renderer/main.tsx` -> `src/renderer/App.tsx`.
   - Main shell: `TopBar`, `LeftSidebar`, `RightPanel`, `BottomBar`.
   - Tabs: Workspace, Knowledge, Context, Tools, Skills, Abilities, Users.

4. Savant backend/API plane
   - Default server URL: `http://127.0.0.1:8090`.
   - Default gateway URL: `http://127.0.0.1:3100`.
   - API key is sent as `X-API-Key` for Savant server endpoints and as Bearer auth for gateway `/runs` in Electron main.

5. Local build/dev tooling
   - Vite renderer root is `src/renderer`.
   - Main/preload are bundled into `dist-electron`.
   - Packaged renderer output is `dist`.

## Source-of-truth files

- `package.json`: scripts, dependencies, Electron Builder config.
- `vite.config.mts`: renderer build/dev config and Electron plugin config for production build.
- `vite.electron.config.mts`: focused main/preload build config used by dev startup.
- `scripts/start-electron-dev.mjs`: orchestrates dev Electron startup and renderer readiness.
- `src/main/electron/main.ts`: local persistence, Electron lifecycle, IPC, gateway/provider logic.
- `src/main/electron/preload.ts`: exposed renderer API.
- `src/renderer/App.tsx`: authentication gate, settings propagation, tab routing.

## Key architectural rule

Renderer tabs are thin control surfaces over Savant APIs and local Electron capabilities. Avoid moving Savant business logic into the desktop client unless it is strictly UI orchestration or client-side visualization.
