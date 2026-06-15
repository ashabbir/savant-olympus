# Chat/session removal note

User clarified Savant Olympus does not need a chat area or chat sessions.

Actions taken:
- Removed chat/session orchestration from `src/renderer/App.tsx`.
- Removed ActionBar usage and ChatArea fallback from the app shell.
- Simplified `LeftSidebar` to Savant module navigation only: Workspace, Knowledge, Context, Tools, Skills, Abilities, Users.
- Removed session status from `BottomBar`.
- Removed `window.sessions` and `window.agents` preload exposure.
- Removed renderer browser-preview fallbacks for `window.sessions` and `window.agents`.
- Stopped creating `sessions`, `messages`, and `thinking` tables in Electron DB initialization. Settings table remains.
- Removed session IPC handlers from Electron main process.
- Left existing old chat/session files on disk because destructive file deletion was not approved by the user permission prompt. They are no longer wired into the app shell.

Verification:
- `npm test`: 5 files passed, 21 tests passed.
- `npm run build`: passed; Vite, Electron main/preload builds, and electron-builder completed. Build skipped macOS signing because no valid Developer ID Application signing identity was available.

Likely origin:
- The chat/session layer appears to be legacy Quorum prototype code from the earlier multi-agent chat implementation. It persisted UI conversations in `~/.savant/quorum.db` and was still wired into the Olympus shell even though current Olympus should be a Savant control surface, not a chat client.
