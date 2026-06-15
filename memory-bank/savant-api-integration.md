# Savant API, MCP, Context, Knowledge, and Gateway Integration

## Authentication

Renderer requests to the Savant server use `X-API-Key`. App startup validates with:

```text
GET /api/auth/validate
Header: X-API-Key: <key>
```

The API key is stored in two places:
- Browser localStorage under `savant_api_key` (`src/renderer/services/auth.ts`).
- Electron SQLite settings key `user:apiKey`.

LocalStorage takes precedence during settings refresh.

## Savant server URL

Default: `http://127.0.0.1:8090`.

Configured in settings under `server:config`:

```json
{ "url": "http://127.0.0.1:8090", "enabled": true }
```

Settings UI server health endpoint: `/health/ready`.

## Gateway URL

Default: `http://127.0.0.1:3100`.

Configured in settings under `gateway:config`:

```json
{ "url": "http://127.0.0.1:3100", "enabled": true }
```

Renderer health check: `/health`.
Electron main provider discovery probes `/models`, `/health`, `/providers`, `/api/providers`, `/v1/providers`, `/models/providers`.

## Gateway run forwarding

Electron main IPC handler `run-agent` sends:

```text
POST <gateway>/runs
Authorization: Bearer <apiKey>
Body: { "prompt": "...", "chain": [{ "provider": "...", "model": "..." }] }
```

Then polls:

```text
GET <gateway>/runs/:id
```

The handler treats `ModelNotFoundError`, critical API errors, and warning-prefixed gateway output as failures even if the gateway marks the run complete.

## MCP workspace execution

WorkspaceView is a browser-side MCP/SSE client:
1. Calls `/api/mcp/health/workspace` to determine whether workspace MCP is online and which port to use.
2. Opens `EventSource` to `http(s)://<host>:<port>/sse?api_key=<key>&session_id=<sessionId>`.
3. Waits for the `endpoint` event.
4. POSTs JSON-RPC `initialize`.
5. POSTs JSON-RPC `tools/call` with the selected tool name and arguments.

Default workspace MCP port is `8091`.

## Context integration

ContextView and RightPanel use Savant context HTTP routes for repository registry, indexing status, AST/code reads, semantic search, and memory resources. The repo name selected in ContextView becomes `selectedProject` and filters RightPanel memory/code/search calls.

## Knowledge integration

KnowledgeView expects graph payloads shaped roughly as:

```json
{
  "nodes": [{ "node_id": "...", "title": "...", "node_type": "...", "content": "...", "metadata": {} }],
  "edges": [{ "edge_id": "...", "source_id": "...", "target_id": "...", "edge_type": "..." }]
}
```

It performs client-side D3 layout, layer filtering, search, focus/explore mode, and bulk graph actions.

## Abilities integration

AbilitiesView expects assets grouped by type from `/api/abilities/assets`. Asset IDs use forms like `persona.engineer`, `rule.coding_style`, repo overlays, policies, and styles. Prompt resolution is delegated to `/api/abilities/resolve` with `{ persona, tags, repo_id }`.
