# KnowledgeView Behavior-Boundary Refactor

Task 1: Lock down extraction contracts
File(s): `src/renderer/test/knowledgeHooks.test.tsx`, `src/renderer/test/knowledgeComponents.test.tsx`
What to do: Add failing tests for keyboard/event subscriptions, error reporting, and modal/toolbar behavior.
Verify: Run the new focused tests and confirm failure is caused by missing extracted modules.

Task 2: Extract pure graph derivation
File(s): `src/renderer/components/tabs/knowledge/utils/graphUtils.ts`, `src/renderer/test/KnowledgeView.test.tsx`
What to do: Move reachability, grouping, filtering, and purge-preview formatting into pure helpers.
Verify: Run helper and KnowledgeView tests.

Task 3: Extract side-effect hooks
File(s): `src/renderer/components/tabs/knowledge/hooks/*.ts`
What to do: Move keyboard shortcuts, application event subscriptions, and repeated graph action lifecycle/error handling into hooks.
Verify: Run hook tests and typecheck.

Task 4: Extract presentation components
File(s): `src/renderer/components/tabs/knowledge/components/*.tsx`
What to do: Move toolbar, filters, canvas controls, drawer shell, add modal, import preview, and destructive-action dialog UI behind focused props.
Verify: Run component and existing KnowledgeView behavior tests.

Task 5: Simplify the container
File(s): `src/renderer/components/tabs/KnowledgeView.tsx`
What to do: Compose hooks/components, derive flags once, remove dead branches, and replace swallowed errors.
Verify: Run focused tests, full suite, TypeScript build, and source complexity/size checks.

Task 6: Release and install
File(s): `package.json`, `package-lock.json`
What to do: Bump the patch version, build the macOS package, replace `/Applications/Savant Olympus.app`, verify the installed version/process path, commit, and push.
Verify: Inspect packaged artifacts, installed app metadata, git status, and upstream branch.
