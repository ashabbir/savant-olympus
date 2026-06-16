# Original User Request

## Initial Request — 2026-06-15T00:51:42Z

Migrate missing Admin features and subtabs from `savant-sanctum` to `savant-olympus`, aligning API operations and establishing feature parity under the Olympus styling guidelines.

Working directory: /Users/home/code/project-x/savant-olympus
Integrity mode: development

## Requirements

### R1. Reminders Tab Addition
Add a new operational tab named "Reminders" (with a corresponding icon in the LeftSidebar). This view must:
*   Fetch and display reminders from the `/api/reminders` REST endpoint on the Savant Server.
*   Integrate a visual calendar grid using the pre-installed `react-day-picker` package.
*   Filter reminders by status (Pending, All, Done, Dismissed) and highlight due dates.

### R2. Complete Users CRUD Integration
Migrate the Users tab from its read-only `/api/auth/operators` implementation to the full `/api/users` REST APIs present in `savant-sanctum`. This must support:
*   Fetching the list of all users via `GET /api/users?include_inactive=true`.
*   Grouping users in active/inactive admin and standard user tree structures (Active Admins, Active Users, Inactive Admins, Inactive Users).
*   Creating a new user profile via `POST /api/users`.
*   Modifying user details via `PUT /api/users/:userId`.
*   Deactivating/deleting a user via `DELETE /api/users/:userId`.
*   Regenerating a user's authorization token via `POST /api/users/:userId/api-key`.

### R3. Olympus Styling Parity
Ensure all new UI elements fully adhere to the Olympus style guide (dark futuristic glassmorphic panels, Orbitron headers, Rajdhani monospace body fonts, variables for status colors, and hover micro-animations).

### R4. Automated Testing
Add or update unit/integration tests under `src/renderer/test` (e.g. `Tabs.test.tsx` or new test files) to cover the new Reminders view, the users CRUD operations, and their mock server endpoints in `setup.ts`.

## Acceptance Criteria

### LeftSidebar & Navigation
- [ ] LeftSidebar includes a new navigation icon for the "Reminders" tab.
- [ ] Clicking the Reminders tab button correctly switches the active panel to show the RemindersView.

### Reminders View
- [ ] RemindersView renders a calendar using `react-day-picker` styled to match the dark Olympus palette.
- [ ] Reminders are fetched from `/api/reminders` and can be filtered by status (Pending, All, Done, Dismissed).

### Users View
- [ ] UsersView lists users grouped into tree-like categories: Active Admins, Active Users, Inactive Admins, Inactive Users.
- [ ] Admin operators can trigger forms to Create, Edit, Deactivate, and Regenerate API Keys for any user, hitting the respective `/api/users` endpoints.

### Tests
- [ ] All new tests and existing test suites pass cleanly when running `npm test -- --run`.

## Follow-up — 2026-06-15T02:31:53Z

Refine the Savant Olympus Knowledge Graph tab by improving domain bubble visibility, expanding the graph canvas layout, and making the node details panel collapsible/closable.

Working directory: /Users/home/code/project-x/savant-olympus
Integrity mode: development

## Requirements

### R1. Domain Bubble & Canvas Visibility
* Enhance the visibility of domain clusters/bubbles (D3 hulls) on the canvas. 
* Increase the background color contrast (e.g. using `bg-[var(--cp-bg-1)]` or `bg-[var(--cp-bg-2)]` instead of `bg-[var(--cp-bg-0)]` for the SVG container) and increase the fill and stroke opacity values of the domain bubbles (e.g., `fill-opacity` from `0.12` to `0.28`, and `stroke-opacity` to `0.85` or higher).

### R2. Responsive Screen-Wide Canvas Layout
* The Knowledge Graph canvas must occupy most of the available screen space.
* The right-hand node details panel must be hidden entirely when no node is selected, allowing the graph container to span the full available width.

### R3. Collapsible & Toggleable Node Details Panel
* When a node is selected (or multiple nodes are selected for merging), the details panel should open on the right side.
* The details panel must feature a collapse toggle button (e.g., in the header next to close). When collapsed, the panel hides (`w-0` or hidden), and an expand toggle button appears on the right edge of the graph container so the user can easily open it again.
* If a new node is selected while the panel is collapsed, the panel must automatically expand to display the new node's details.

### R4. Modal-Based Node Creation
* Move the "Add Node" form from the details panel into a clean dialog modal (`isAddModalOpen`), since the details panel is now hidden when no node is selected.
* Integrate a `+` (Add Node) button in the top action bar next to the Reload/Purge/Upload/Download buttons to trigger this node creation modal.

## Acceptance Criteria

### Canvas & Background Contrast
- [ ] The SVG container background uses `bg-[var(--cp-bg-1)]` or `bg-[var(--cp-bg-2)]` for better visibility.
- [ ] Domain hulls (bubbles) are clearly visible with increased fill and stroke opacity.

### Layout & Hiding Panel
- [ ] The right-hand panel is hidden by default when no nodes are selected, allowing the graph to occupy the full width.
- [ ] Click-selecting a node renders the details panel.
- [ ] Deselecting or closing the selection hides the details panel again.

### Collapsibility & Toggle Controls
- [ ] A collapse/expand button toggles the details panel open and closed when a selection is active.
- [ ] Selecting a node while the panel is collapsed automatically expands it.

### Node Creation
- [ ] A `+` button in the top action bar opens the node creation modal.
- [ ] Creating a node via the modal refreshes the graph and auto-selects the created node.
- [ ] Existing unit tests compile and pass cleanly via `npm test`.
