# Savant Olympus / Quorum onboarding snapshot

Session: 20260607_192109_d8cab7
Repo: /Users/home/code/project-x/savant-olympus

## What this project is
Savant Olympus (package name `savant-olympus`, product name currently `Savant Quorum`) is an Electron desktop command center for the Savant ecosystem. It combines a React/Vite/TypeScript renderer with an Electron main process, local SQLite persistence, gateway-backed agent execution, and dashboard tabs for Savant Workspace, Context, Knowledge, Abilities, Tools, Skills, and Users.

## Verified local source facts
- `package.json` version: 4.0.51.
- Runtime: Electron 31, React 18, Vite 8, TypeScript 5, Vitest 4, better-sqlite3.
- Electron main entry: `src/main/electron/main.ts`.
- Preload bridge: `src/main/electron/preload.ts`.
- Renderer entry/shell: `src/renderer/App.tsx`.
- Main UI tabs: `WorkspaceView`, `KnowledgeView`, `ContextView`, `ToolsView`, `SkillsView`, `AbilitiesView`, `UsersView`.
- Local Quorum persistence path in code: `~/.savant/quorum.db`.
- Main process log path in code: `~/.savant/quorum.log`.
- Default gateway URL in code: `http://127.0.0.1:3100`.
- Default Savant server URL in renderer auth: `http://127.0.0.1:8090`.

## Architecture map
1. Electron main process
   - Initializes local SQLite tables: `sessions`, `messages`, `thinking`, `settings`.
   - Creates main BrowserWindow and tray.
   - Exposes IPC handlers for session CRUD, settings, provider discovery, DB status, directory picker, and directory listing.
   - Calls the external gateway via `/runs` and polls `/runs/:id` for agent responses.

2. Preload bridge
   - Exposes `window.agents.run(provider, model, prompt)`.
   - Exposes `window.sessions` for list/load/save/delete.
   - Exposes `window.system` for user/settings/provider/DB calls.
   - Exposes `window.electronAPI` for directory picker/listing.

3. Renderer app shell
   - Requires Savant API key validation against `/api/auth/validate` before entering the app.
   - Restores the latest persisted Olympus session or starts a new one.
   - Implements a moderator loop that chooses configured agents, dispatches tasks, accumulates agent context, and synthesizes final answers.
   - Uses gateway-backed provider chain fallback; default chain in code is Gemini then Claude unless overridden in settings.

4. Savant tabs
   - Workspace tab talks to Savant Workspace MCP over SSE after discovering port via `/api/mcp/health/workspace`.
   - Context tab talks to `/api/context/*` for repo registry, indexing, AST generation, code listing/reading, and heuristic analysis.
   - Knowledge tab talks to `/api/knowledge/*` for graph visualization and node/edge CRUD, merge, bulk edge, bulk delete, import/export, prune, and purge.
   - Abilities tab talks to `/api/abilities/*` for assets, resolution, validation, and bootstrap.

## Savant Context findings
MCP discovery via `npx -y mcporter list --output json` found these Savant MCP servers available: `savant-context`, `savant`, `savant-abilities`, `savant-knowledge`, and `savant-workspace` (plus `savant-tools` offline).

Context index status reports 11 indexed repos. The current `savant-olympus` repo itself is not separately indexed by name; the closest indexed repo is parent `project-x` with only 33 indexed files/chunks, so local file inspection is currently the most reliable source for this repo.

Context search results for `project-x` show the broader Project-X/Savant platform intent:
- Self-hosted agentic development platform.
- n8n as orchestration backbone.
- Context MCP for semantic code search and memory bank.
- Abilities MCP for persona/rule/policy resolution.
- Infrastructure with Postgres/pgvector, Redis, MongoDB, n8n.
- Current broader Project-X state in indexed docs: Phase 1 complete; Phase 2 Context MCP pending.

Context search results for `savant-mvp` memory bank show Savant hub architecture:
- HTTP Hub serves React UI and operational endpoints.
- `ServiceManager` bridges HTTP routes to engine registrars/tools.
- Dual transport architecture: HTTP transport for Hub/UI and MCP transport for stdio/websocket editor integrations.
- Memory bank emphasizes concise factual notes, config under `config/settings.json`, and Make targets for migrations/indexing.

## Savant Knowledge / Workspace access status
Attempted Savant Workspace and Knowledge MCP calls through mcporter:
- `savant-workspace.get_current_workspace` returned no workspace assigned to session `20260607_192109_d8cab7`.
- `savant-workspace.list_workspaces` returned API 401.
- `savant-knowledge.search` returned API 401.

Blocker: the workspace/knowledge MCP bridge currently requires an API key not present in this CLI environment. I did not access Savant SQLite directly, per protocol. Once the API key is available in the environment or MCP config, assign this session to the Quorum/Olympus workspace and create a session note there.

## Resolved abilities
Resolved `engineer` persona against repo `Savant MVP` with tags `frontend`, `electron`, `typescript`, `savant-workspace`.
Key operating constraints from resolved prompt:
- Pragmatic, precise, safe engineering.
- Small valuable changes; focused diffs.
- Tests for critical paths and edge cases.
- Strict TypeScript/noImplicitAny preferred.
- A11y-first frontend work.
- Savant workflow: start discovery from knowledge graph; notes are mandatory; use tasks for concrete work; session files are markdown under session files directory.

## Current verification results
Commands run:
- `npm test -- --runInBand` failed because Vitest does not support Jest's `--runInBand` option.
- `npm test` ran 21 tests: 19 passed, 2 failed.
- `npm run build` failed at TypeScript compile.

Test failures:
- `src/renderer/test/ContextView.test.tsx` expects button text matching `/BROWSE/i`, but current UI renders `[ EXPLORE_SERVER_FILESYSTEM ]`.
- This is test/UI drift, not necessarily runtime functionality failure.

Build failures:
- `src/renderer/App.tsx`: imports `ChatItem` and `FolderItem` from `LeftSidebar`, but those exports are missing.
- `src/renderer/App.tsx`: `ChatArea` call is missing required `sessionTitle` prop.
- `src/renderer/components/LeftSidebar.tsx`: `LeftSidebarProps` not found.
- `src/renderer/components/tabs/ContextView.tsx`: `analyzeProjectSource` not found.
- `src/renderer/components/tabs/KnowledgeView.tsx`: `handleConnectNodes` not found.

## Important docs drift
- `README.md` and `GEMINI.md` still describe older Gemini shell-command integration and `exec` assumptions.
- Current implementation uses gateway `/runs` via `fetch`, with provider/model chain fallback, not only direct `gemini` CLI execution.
- `QUORUM.md` states spawn-based shell execution and SQLite persistence. SQLite is true, but current agent execution path is gateway HTTP, not local spawn.

## Contributor starting points
- Main app behavior: `src/renderer/App.tsx`.
- Main process persistence/gateway/IPC: `src/main/electron/main.ts`.
- Preload API contract: `src/main/electron/preload.ts`.
- Context repo/indexing UI: `src/renderer/components/tabs/ContextView.tsx`.
- Workspace MCP UI: `src/renderer/components/tabs/WorkspaceView.tsx`.
- Knowledge graph UI: `src/renderer/components/tabs/KnowledgeView.tsx`.
- Abilities editor/resolver UI: `src/renderer/components/tabs/AbilitiesView.tsx`.
- Build blockers should be fixed before feature work.

## Immediate next technical priorities
1. Fix TypeScript build blockers.
2. Fix ContextView test drift (`BROWSE` vs `[ EXPLORE_SERVER_FILESYSTEM ]`) or update tests to current copy.
3. Ensure this repo is indexed in Savant Context as its own repo, not just through parent `project-x`.
4. Provide Savant API key to MCP bridge so workspace/knowledge session notes and graph operations can be performed through MCP.
