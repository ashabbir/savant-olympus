# Frontend Control Surface

## App shell

`src/renderer/App.tsx` is the renderer orchestrator.

Startup flow:
1. Show `StartupScreen` while initializing.
2. Load local settings through `window.system.getSettings()`.
3. Find an API key from localStorage (`savant_api_key`) or persisted settings (`user:apiKey`).
4. Validate against `${serverUrl}/api/auth/validate` with `X-API-Key`.
5. If valid, initialize the control surface and probe gateway health.
6. If invalid/missing, show `LoginScreen`.

State propagated to tabs:
- `serverUrl`: `settings["server:config"].url` or `http://127.0.0.1:8090`.
- `apiKey`: `settings["user:apiKey"]` or localStorage key.
- `selectedProject`: shared by Context and RightPanel.

## Navigation tabs

`src/renderer/components/LeftSidebar.tsx` defines the active module order:
1. Workspace
2. Knowledge
3. Context
4. Tools
5. Skills
6. Abilities
7. Users

## Workspace tab

Source: `src/renderer/components/tabs/WorkspaceView.tsx`.

Purpose: MCP workspace tool runner for concrete workspace/task/session-note/Jira/MR operations.

Important behavior:
- Checks `${serverUrl}/api/mcp/health/workspace`.
- Opens an SSE connection to the workspace MCP server, defaulting to port `8091` unless health returns another port.
- Uses JSON-RPC initialize then `tools/call`.

## Knowledge tab

Source: `src/renderer/components/tabs/KnowledgeView.tsx`.

Purpose: D3 graph UI over knowledge nodes and edges.

Important endpoints:
- `GET /api/knowledge/graph?limit=150&slim=true`
- `GET /api/knowledge/nodes/:node_id`
- `POST /api/knowledge/nodes`
- `POST /api/knowledge/edges`
- `POST /api/knowledge/edges/bulk`
- `POST /api/knowledge/nodes/merge`
- `POST /api/knowledge/nodes/bulk-delete`
- `DELETE /api/knowledge/nodes/:node_id`
- `POST /api/knowledge/purge-workspace`
- `POST /api/knowledge/prune`
- `GET /api/knowledge/export`
- `POST /api/knowledge/import`

## Context tab

Source: `src/renderer/components/tabs/ContextView.tsx` and `ContextVisualizations.tsx`.

Purpose: repository registration, indexing status, AST/code analysis, and visualization.

Important endpoints:
- `GET /api/context/repos`
- `GET /api/context/repos/indexing-status`
- `GET /api/context/repos/sources`
- `POST /api/context/repos`
- `POST /api/context/repos/:repo/index`
- `DELETE /api/context/repos/:repo`
- `GET /api/context/ast/list?repo=...`
- `GET /api/context/code/read?uri=...`

`ContextVisualizations.tsx` exports pure helper functions (`computeAstComplexity`, `complexityColor`, `analyzeProjectSource`) and contains D3-heavy visualizations for AST tree/radial/cluster views and heuristic code findings.

## Tools and Skills tabs

Sources: `ToolsView.tsx`, `SkillsView.tsx`.

Tools tab hits:
- `GET /api/mcp/tools`
- `POST /api/mcp/tools/run`

Skills tab hits:
- `GET /api/abilities/skills`

Both include local fallback/demo data when APIs fail; be careful not to mistake fallback data for backend truth.

## Abilities tab

Source: `src/renderer/components/tabs/AbilitiesView.tsx`.

Purpose: browse/edit ability assets and resolve persona/rule/policy/repo prompts.

Important endpoints:
- `GET /api/abilities/assets`
- `GET /api/abilities/assets/:id`
- `PUT /api/abilities/assets/:id`
- `DELETE /api/abilities/assets/:id`
- `POST /api/abilities/assets`
- `POST /api/abilities/resolve`
- bootstrap/validate operations triggered by right-panel events.

## Users tab

Source: `src/renderer/components/tabs/UsersView.tsx`.

Purpose: operators and credentials view. Current edit behavior is local UI state, not guaranteed persistent server mutation.
Endpoint: `GET /api/auth/operators`.

## RightPanel

Source: `src/renderer/components/RightPanel.tsx`.

Purpose: context-sensitive secondary drawer. For Context it can search semantic context, list/read memory resources, and list/read indexed code files.

Important endpoints:
- `GET /api/context/search?q=...&repo=...`
- `GET /api/context/memory/list?repo=...`
- `GET /api/context/memory/read?uri=...`
- `GET /api/context/code/list?repo=...`
- `GET /api/context/code/read?uri=...`
