# npm run dev timeout fix

## Root cause
`npm run dev` used `concurrently` to start renderer and Electron as independent commands. `scripts/start-electron-dev.mjs` waited only 30 seconds for `http://127.0.0.1:5174/`. On cold/slow renderer startup or dependency optimization, the Electron side could time out even though the renderer was still starting.

## Fix
- Changed `package.json` `dev` script to run `node scripts/start-electron-dev.mjs --with-renderer`.
- Updated `scripts/start-electron-dev.mjs` to own the dev lifecycle:
  - builds Electron main/preload first,
  - starts the renderer Vite dev server when `--with-renderer` is passed,
  - waits up to 120 seconds by default,
  - supports `OLYMPUS_DEV_SERVER_TIMEOUT_MS` override,
  - logs wait progress and readiness,
  - kills child processes on exit/SIGINT/SIGTERM.

## Verification
- `npm run dev` launched successfully; `curl http://127.0.0.1:5174/` returned OK and Electron process started.
- `node --check scripts/start-electron-dev.mjs` passed.
- `npm test -- --run` passed: 7 files, 30 tests.
- `npm run build -- --dir` passed.
