# AI Agent Playbook for Savant Olympus

## Before editing

1. Read `memory-bank/product-boundary.md` and keep Olympus scoped as a Savant control surface.
2. Inspect source-of-truth files, not packaged output:
   - Use `src/`, `scripts/`, `package.json`, `vite*.mts`.
   - Ignore `dist/`, `dist-electron/`, `node_modules/`, and `src/renderer/coverage/` as source inputs.
3. Use Savant context/knowledge/abilities through MCP tools when available. Do not read Savant SQLite databases directly.
4. Resolve abilities for this repo when doing significant work.

## Common implementation rules

- Use absolute paths for file edits and commands.
- Verify file contents before patching.
- Keep business/domain behavior on the Savant server side; keep Olympus as UI orchestration and visualization.
- Do not add local chat/session features.
- Preserve `X-API-Key` auth behavior for Savant server endpoints.
- Keep Electron preload APIs narrow; prefer adding explicit bridge methods over generic IPC use.
- Avoid direct network calls from generic UI helpers; route API interactions through tab-level data loading functions.

## Where to change things

- Tab routing/nav: `src/renderer/App.tsx`, `src/renderer/components/LeftSidebar.tsx`.
- Local settings and profiles: `SettingsModal.tsx`, `ProfileModal.tsx`, `src/main/electron/main.ts` settings handlers.
- Server/gateway URLs and health: `SettingsModal.tsx`, `BottomBar.tsx`, `App.tsx` startup logic.
- Workspace MCP tools: `WorkspaceView.tsx`.
- Knowledge graph UI: `KnowledgeView.tsx`.
- Context repo/indexing/analysis: `ContextView.tsx`, `ContextVisualizations.tsx`, `FileBrowserModal.tsx`.
- Abilities: `AbilitiesView.tsx` plus RightPanel custom event triggers.
- Tools/skills/operators: `ToolsView.tsx`, `SkillsView.tsx`, `UsersView.tsx`.
- Electron local capabilities: `src/main/electron/main.ts`, `preload.ts`.
- Dev startup: `scripts/start-electron-dev.mjs`.

## Verification checklist

For most code changes run:

```bash
npm test -- --run
npm run build -- --dir
```

For dev-startup changes also run:

```bash
npm run dev
curl -sf http://127.0.0.1:5174/
```

Stop dev processes after verification to avoid orphaned Electron/Vite instances.

## Documentation updates

Update this memory bank when:
- Adding/removing top-level tabs.
- Changing Savant API endpoints or auth behavior.
- Changing Electron IPC/preload methods.
- Changing dev/build scripts.
- Moving product boundaries.
