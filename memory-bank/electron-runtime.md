# Electron Runtime, Persistence, and Dev Flow

## Main process responsibilities

`src/main/electron/main.ts` owns:
- Local directory `~/.savant` creation.
- SQLite database `~/.savant/olympus.db` via `better-sqlite3`.
- `settings` table: `key TEXT PRIMARY KEY, value TEXT`.
- Log file `~/.savant/olympus.log` through console wrappers.
- BrowserWindow creation and tray menu.
- Packaged builds load `app.asar/dist/index.html` via a `file://` URL; dev builds continue to use `VITE_DEV_SERVER_URL`.
- Gateway provider discovery by probing known endpoints: `/models`, `/health`, `/providers`, `/api/providers`, `/v1/providers`, `/models/providers`.
- Gateway run forwarding through `/runs` and `/runs/:id`.
- Directory picker/listing used by Context repo registration.

Icon/runtime notes:
- BrowserWindow icon uses `main1.svg`.
- Tray icon uses `tray1.svg`.
- The macOS `.icns` file in `build/` must be valid or the app icon can appear blank in packaged builds.

## Preload bridge

`src/main/electron/preload.ts` exposes:

- `window.system`
  - `getUser()`
  - `listProviders(gatewayUrl?)`
  - `getSettings()`
  - `saveSetting(key, value)`
  - `getDbStatus()`

- `window.electronAPI`
  - `pickDirectory(defaultPath?)`
  - `listDirectory(dirPath)`

- `window.ipcRenderer`
  - generic `on/off/send/invoke` shim. Use sparingly.

## Dev flow

`npm run dev` runs `node scripts/start-electron-dev.mjs --with-renderer`.

The script:
1. Builds Electron main/preload with `vite.electron.config.mts`.
2. Starts the renderer Vite server on `127.0.0.1:5174` if needed, explicitly using `vite.config.mts`.
3. Waits for renderer readiness, default timeout `120000ms`.
4. Races readiness against renderer child exit so renderer startup failures fail fast instead of waiting for the full timeout.
5. Starts Electron with `VITE_DEV_SERVER_URL=http://127.0.0.1:5174/`.
6. Cleans up child renderer/Electron processes on exit/signals.

Set `OLYMPUS_DEV_SERVER_TIMEOUT_MS` if cold dependency optimization needs a longer renderer wait.

## Build flow

`npm run build` runs:
1. `tsc`
2. `vite build`
3. `electron-builder`

Production build uses `vite.config.mts`; packaged app includes `dist-electron/**/*`, `dist/**/*`, and selected public assets from `src/renderer/public`.
