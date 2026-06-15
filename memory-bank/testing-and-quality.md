# Testing and Quality Notes

## Commands

Run tests:

```bash
cd /Users/home/code/project-x/savant-olympus
npm test -- --run
```

Run coverage:

```bash
npm test -- --coverage
```

Run production package path without installers:

```bash
npm run build -- --dir
```

Run dev app:

```bash
npm run dev
```

## Test setup

Vitest runs from Vite root `src/renderer`. Test setup is `src/renderer/test/setup.ts` and mocks:
- Mermaid rendering.
- `window.system` Electron bridge.
- `window.ipcRenderer` bridge.
- localStorage with default `savant_api_key`.
- global `fetch` with valid-auth defaults.

## Current test files

- `src/renderer/test/App.test.tsx` — app shell and authenticated startup.
- `src/renderer/test/Tabs.test.tsx` — Tools, Skills, Users, Abilities, Workspace, RightPanel events.
- `src/renderer/test/ContextView.test.tsx` — context repo registration and file browser integration.
- `src/renderer/test/Mermaid.test.tsx` — Mermaid rendering wrapper.
- `src/renderer/test/AuthAndShell.test.tsx` — auth storage, LoginScreen, ProfileModal, SettingsModal, BottomBar.
- `src/renderer/test/ContextAnalysis.test.tsx` — AST complexity and source analysis helpers.
- `src/renderer/test/KnowledgeView.test.tsx` — knowledge graph loading, node creation, layer/maintenance actions.

## Known quality issues

- Existing tests still emit React `act(...)` warnings around AbilitiesView and WorkspaceView async state updates. They pass, but future cleanup should make output pristine.
- Production renderer bundle is large (~993 kB before gzip in recent builds). Consider dynamic imports/code splitting for D3-heavy Knowledge and Context visualization modules.
- `npm audit` reports Electron 31.0.0 advisories. npm suggests a semver-major Electron upgrade path.
- Several tabs contain fallback/demo data for API failure states. Tests may pass on fallback data; integration behavior should be validated against the Savant server where possible.

## Coverage posture

Recent coverage work expanded coverage around auth, shell, settings, context analysis, and knowledge graph flows. Remaining low-coverage areas are mostly large visual/interactive surfaces:
- D3 drawing branches in `ContextVisualizations.tsx` and `KnowledgeView.tsx`.
- RightPanel drawer modes.
- Workspace MCP SSE edge cases.
- Full Abilities asset CRUD failure modes.
