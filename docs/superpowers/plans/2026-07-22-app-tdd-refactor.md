Task 1: Lock runtime configuration behavior
File(s): src/renderer/test/olympusRuntime.test.ts, src/renderer/services/olympusRuntime.ts
What to do: Extract server, gateway, credential, model, and admin selectors from App.
Verify: The new unit test fails before implementation and passes afterward.

Task 2: Extract authentication and runtime lifecycle
File(s): src/renderer/test/useOlympusSession.test.tsx, src/renderer/hooks/useOlympusSession.ts, src/renderer/App.tsx
What to do: Move initialization, login, logout, settings refresh, and live-role refresh into one controller hook.
Verify: Hook tests and existing App authentication tests pass.

Task 3: Extract viewport routing
File(s): src/renderer/test/OlympusViewport.test.tsx, src/renderer/components/OlympusViewport.tsx, src/renderer/App.tsx
What to do: Move tab-to-feature composition into a typed shell component.
Verify: Router tests and existing App tab-navigation tests pass.

Task 4: Verify and publish
File(s): package.json, package-lock.json
What to do: Run the full suite and typecheck, measure App, bump version, package, install, commit, push, and deploy.
Verify: Installed app reports the new version and the remote branch contains the release commit.
