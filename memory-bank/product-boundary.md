# Product Boundary: Olympus is a Savant Control Surface

Savant Olympus is an Electron + React command-and-control surface for the Savant ecosystem. It is not a local chat client and should not grow a chat transcript/session UX.

## In scope

Olympus should expose operational modules for:
- Savant Workspace: workspaces, tasks, notes, Jira, merge requests, and MCP workspace tools.
- Savant Knowledge: graph visualization and node/edge maintenance.
- Savant Context: indexed repositories, AST/code analysis, semantic search, memory resources.
- Savant Abilities: persona/rule/policy/repo asset browsing, editing, validation, bootstrap, and prompt resolution.
- MCP Tools and Skills: registry/playground surfaces for available tools and audited capabilities.
- Operators/Users: operator and credential visibility/editing.
- Gateway/server health, provider discovery, and local settings.

## Out of scope / legacy-suspect areas

Do not preserve or reintroduce local chat/session UI as a fallback. Treat these names as suspect if they appear in future branches:
- `ChatArea`, `ChatMarkdown`, `ChatModeSelector`, `ActionBar` chat/session naming flows.
- `window.sessions` renderer bridge or Electron IPC handlers like `list-sessions`, `load-session`, `save-session`, `delete-session`.
- SQLite tables solely for local chat history: `sessions`, `messages`, `thinking`.
- Bottom/status labels that imply a local chat session is the primary object.

The active product object is the Savant control plane, not local conversation history.
