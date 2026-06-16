## 2026-06-14T20:56:42-04:00
Implement M3: Users CRUD Integration in the savant-olympus admin migration project.
Read /Users/home/code/project-x/savant-olympus/.agents/orchestrator/PROJECT.md, plan.md, context.md, explorer_m1/analysis.md, and the previous worker's handoff report at worker_m2/handoff.md.

Tasks for M3:
1. Refactor `src/renderer/components/tabs/UsersView.tsx` to migrate from `/api/auth/operators` to the full `/api/users` REST APIs.
   - Fetch the list of all users via `GET /api/users?include_inactive=true` (with authorization header `X-API-Key: apiKey`).
   - Group users into four collapsible tree structures:
     1. Active Admins (`role === 'admin' && active === true`)
     2. Active Users (`role !== 'admin' && active === true`)
     3. Inactive Admins (`role === 'admin' && active === false`)
     4. Inactive Users (`role !== 'admin' && active === false`)
   - Use simple state toggles (e.g. `const [isSectionOpen, setIsSectionOpen] = useState({ activeAdmins: true, ... })`) or `<Collapsible />` from Radix to expand/collapse these lists.
   - Display each user inside their respective group with: Name, Username, Role, Email, Active Status (Active/Inactive), API Key section, and controls to: Edit, Deactivate/Delete, and Regenerate API Key.
   - Forms and CRUD APIs integration:
     - **Create User Form**: Add an "Add Operator" or "Add User" button. Clicking this should toggle a Create form. Submitting this form should perform `POST /api/users` with JSON payload `{ username, name, email, role }`. Make sure the username, name, email, and role are input fields.
     - **Edit User Form**: Clicking edit on any user should open an Edit form pre-populated with details. Submitting this form should perform `PUT /api/users/:userId` with JSON payload `{ name, email, role }` (where `:userId` is the user's `id` or falls back to `username` if `id` is not present, or use user's `id`).
     - **Deactivate/Delete User**: Add a button to Deactivate / Delete the user. Clicking this should perform `DELETE /api/users/:userId` and trigger a re-fetch of the users list.
     - **Regenerate API Key**: Add a button to Regenerate API Key. Clicking this should perform `POST /api/users/:userId/api-key` and display the new API Key.
   - All components must retain the dark glassmorphic styling, utilizing custom CSS variables (`--cp-cyan`, `--cp-border`, `--cp-bg-1`, etc.), Rajdhani font for body text, and Orbitron font for headings.

2. Modify `src/renderer/test/setup.ts` to add REST mocks for:
   - `GET /api/users` (with or without `include_inactive=true`) returning an array of mock users.
   - `POST /api/users` returning a created mock user.
   - `PUT /api/users/:userId` returning the updated mock user.
   - `DELETE /api/users/:userId` returning `{ success: true, message: "User deactivated" }`.
   - `POST /api/users/:userId/api-key` returning `{ api_key: "sk-regenerated-..." }`.

3. Update the UsersView test suite in `src/renderer/test/Tabs.test.tsx` to cover:
   - Mocking of `/api/users` endpoints.
   - Listing users grouped by their categories (Active Admins, Active Users, Inactive Admins, Inactive Users).
   - Form operations (Create, Edit).
   - Deactivation operation (`DELETE /api/users/:userId`).
   - API Key regeneration operation (`POST /api/users/:userId/api-key`).

4. Verify that TypeScript compilation and the test suite both pass cleanly:
   - Run `npx tsc --noEmit`.
   - Run `npm test`.

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

Write your handoff report to `/Users/home/code/project-x/savant-olympus/.agents/worker_m3/handoff.md`. Include verification instructions, build/test command used, and output results.
Your working directory is `/Users/home/code/project-x/savant-olympus/.agents/worker_m3`.
Your identity is worker_m3.
