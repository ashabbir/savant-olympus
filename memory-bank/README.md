# Savant Olympus Memory Bank

This directory is the project-level memory bank for AI agents working on Savant Olympus. Treat these files as the concise source of architectural intent and implementation landmarks before editing code.

Read order for new agents:
1. `product-boundary.md` — what Olympus is and is not.
2. `architecture.md` — runtime/process architecture and source-of-truth files.
3. `frontend-control-surface.md` — React shell and tab modules.
4. `electron-runtime.md` — Electron main/preload, local persistence, dev/build flow.
5. `savant-api-integration.md` — Savant server, gateway, MCP, context, knowledge, abilities APIs used by the UI.
6. `testing-and-quality.md` — current verification commands, coverage, and known quality issues.
7. `agent-playbook.md` — safe workflow for future agents.

Current product state:
- App name and package metadata are Savant Olympus.
- The renderer uses `main1.svg` and `tray1.svg` from `src/renderer/public/`.
- Packaged macOS builds must load the bundled `app.asar` renderer, not the dev server.
- KnowledgeView now includes full-height graph layout, grouped node search, and connection details.
- App shell tests cover login and tab switching, and the build path is expected to pass after packaging fixes.

Regenerate/update these notes whenever architecture, API contracts, runtime scripts, or product boundaries change.
