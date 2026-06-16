# Repository Guidelines

## Project Structure & Module Organization
This repository is a TypeScript Electron app with a Vite-rendered React UI.

- `src/main/electron/` contains the Electron main process and preload bridge.
- `src/renderer/` contains the React app, UI components, tabs, styles, and tests.
- `src/renderer/components/tabs/` holds the primary feature panels such as `KnowledgeView.tsx` and `WorkspaceView.tsx`.
- `src/renderer/components/ui/` contains reusable UI primitives.
- `scripts/` contains dev tooling, including Electron startup orchestration.
- `memory-bank/` contains project guidance and architecture notes; read these before making larger changes.

## Build, Test, and Development Commands

- `npm run dev` starts the Electron app with the local renderer.
- `npm run dev:renderer` runs the renderer only on `http://127.0.0.1:5174`.
- `npm run dev:electron` starts Electron without the renderer helper.
- `npm test -- --run` runs the Vitest suite once.
- `npm test -- --coverage` generates coverage output under `src/renderer/coverage/`.
- `npm run build -- --dir` builds the app and stops after producing packaged artifacts.
- `npm run build` performs the full production build, including `electron-builder`.

## Coding Style & Naming Conventions
TypeScript is strict, with `@/*` mapped to `src/renderer/*`. Follow the existing React style:

- Use functional components and hooks.
- Keep files and exported components in `PascalCase` (`SettingsModal.tsx`).
- Use `camelCase` for variables, functions, and custom hooks.
- Prefer explicit bridge methods and tab-level data loading over generic IPC or ad hoc network helpers.
- Match the surrounding formatting; there is no repo-specific formatter config checked in.

## Testing Guidelines
Vitest is the test runner, with setup in `src/renderer/test/setup.ts`. Tests live in `src/renderer/test/` and should be named `*.test.tsx` or `*.test.ts`. Prefer focused component and behavior tests that reflect real UI flows, especially for auth, tabs, context analysis, and knowledge graph actions.

## Commit & Pull Request Guidelines
History is currently minimal, so there is no enforced commit convention yet. Use short, imperative commit messages such as `fix login fallback` or `add knowledge tab test`. Pull requests should describe the change, list verification commands run, and include screenshots or screen recordings for UI changes. Link related issues or tasks when applicable.

## Agent Notes
Before editing, check the memory-bank docs and verify the current source files rather than generated output. Avoid changing `dist/`, `dist-electron/`, `node_modules/`, or `src/renderer/coverage/` as source inputs.
