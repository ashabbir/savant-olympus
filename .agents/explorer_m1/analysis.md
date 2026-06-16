# savant-olympus Admin Migration: Initial Exploration & Codebase Analysis (M1)

## Executive Summary
This report summarizes the findings of the M1: Initial Exploration & Codebase Analysis phase. It identifies key styling variables, navigation tab layouts, user management implementation details, date-picker configurations, and testing structures to guide the migration of Admin features from `savant-sanctum` to `savant-olympus`.

---

## 1. Olympus Style Guide (CSS Layout & Variables)

### CSS Files Structure
The application imports styles through:
- `src/renderer/index.css`: Defines core Tailwind global styles, root font family overrides (`--font-mono`, `--font-heading`), and main body properties.
- `src/renderer/styles/fonts.css`: Imports google web fonts for Share Tech Mono, Rajdhani, and Orbitron.
- `src/renderer/styles/tailwind.css`: Imports standard Tailwind CSS (Tailwind v4 structure) and `tw-animate-css`.
- `src/renderer/styles/theme.css`: Defines CSS custom variables for the dark futuristic cyberpunk style.

### Key Custom Variables (`src/renderer/styles/theme.css`)
- **Theme Color Tokens**:
  - `background`: `#080b12` (very dark blue/black, matching `--cp-bg-0`)
  - `foreground`: `#c8d8e8` (soft light-blueish white)
  - `primary`: `#00e5ff` (bright neon cyan, matching `--cp-cyan`)
  - `accent`: `#ff00aa` (magenta, matching `--cp-magenta`)
  - `destructive`: `#ff2244` (bright red)
  - `border`: `rgba(0, 229, 255, 0.12)` (cyan borders with alpha)
- **Cyberpunk Color Tokens**:
  - `--cp-cyan`: `#00e5ff` (used for active states, highlighted headers, main buttons)
  - `--cp-magenta`: `#ff00aa` (used for errors/destructive items, logs, accents)
  - `--cp-yellow`: `#ffe600` (warning status indicator)
  - `--cp-green`: `#00ff88` (success/active status indicator)
  - `--cp-purple`: `#7b2fff` (alternative accents)
  - `--cp-bg-0` to `--cp-bg-3`: stepped dark panel backgrounds ranging from `#080b12` down to `#0f1929`
  - `--cp-border`: `rgba(0, 229, 255, 0.15)`
  - `--cp-glow-cyan`: `0 0 8px rgba(0, 229, 255, 0.4)` (glowing shadows for interactive elements)
  - `--cp-glow-magenta`: `0 0 8px rgba(255, 0, 170, 0.4)`

### Typography Styles
- **Headers**: Styled with the font-family `Orbitron` (`fontFamily: "'Orbitron', sans-serif"`), tracking-wider, and typically highlighted in Cyan (`text-[var(--cp-cyan)]`).
- **Body Fonts**: Applied globally via `fontFamily: "'Rajdhani', sans-serif"` on the outer `App` container and specific subviews. It is a technical sans-serif with a condensed look.
- **Monospace Fonts**: Applied using the class `font-mono` (aliased to `'Share Tech Mono', monospace` in `index.css`). Used for CLI logs, code blocks, tooltips, and technical labels.

### Glassmorphism & Panel Styling Patterns
- **Panels/Cards**: Formed using combinations like `border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-4`.
- **Scanlines Overlay**: Placed in `App.tsx` via a fixed overlay:
  ```tsx
  <div
    className="fixed inset-0 pointer-events-none z-[999]"
    style={{
      background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
    }}
  />
  ```

### Hover Micro-Animations
- Styled inline using Tailwind's `transition-all`, `transition-opacity`, and `transition-colors` utilities.
- Interactive list elements glow on hover: `hover:border-[var(--cp-cyan)]` or `hover:border-[var(--cp-cyan)]/30`.
- Buttons highlight their borders or change background opacities: `hover:bg-[rgba(0,229,255,0.1)]`, `hover:bg-red-500/10`, or `hover:opacity-90`.
- Delete triggers fade in on hover of their parent group: `opacity-0 group-hover:opacity-100 transition-all`.

---

## 2. LeftSidebar.tsx Tab Icons & Selection Logic

### Components & Props
`LeftSidebar` takes the following props:
```typescript
interface LeftSidebarProps {
  onSettingsChanged: () => void;
  onLogout: () => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
}
```

### Tab Configuration Array
Tabs are defined as a static list of objects (`TAB_ITEMS`):
```typescript
const TAB_ITEMS = [
  { id: "Workspace", label: "Workspace", icon: <Briefcase size={16} /> },
  { id: "Knowledge", label: "Knowledge", icon: <Network size={16} /> },
  { id: "Context", label: "Context", icon: <Search size={16} /> },
  { id: "Tools", label: "Tools", icon: <Wrench size={16} /> },
  { id: "Skills", label: "Skills", icon: <Award size={16} /> },
  { id: "Abilities", label: "Abilities", icon: <Cpu size={16} /> },
  { id: "Users", label: "Users", icon: <Users size={16} /> },
];
```

### Icon Rendering & Active State Style
Tabs are mapped through a child wrapper `NavIcon`. Clicking a tab invokes `onChangeTab(tab.id)`.
The active state is styling in `NavIcon` inline:
```typescript
style={{
  color: "var(--cp-cyan)",
  opacity: isActive ? 1 : 0.45,
  borderRight: isActive ? "2px solid var(--cp-cyan)" : "2px solid transparent",
}}
```
With classes:
`className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all cursor-pointer"`

**Tooltip styling**:
```typescript
style={{
  background: "var(--cp-bg-3)",
  border: "1px solid var(--cp-border)",
  color: "var(--cp-cyan)",
  fontFamily: "'Share Tech Mono', monospace",
}}
```

**Proposed Modification**:
To support the "Reminders" tab, a Lucide icon (e.g. `Bell` or `Calendar`) needs to be imported, and a new object `{ id: "Reminders", label: "Reminders", icon: <Bell size={16} /> }` added to `TAB_ITEMS`. Corresponding active tab matching is needed in `App.tsx` to mount `<RemindersView />`.

---

## 3. UsersView.tsx Implementation & `/api/users` Migration

### Current Structure (Read-Only + Local Edits)
1. **Fetching**: Fetches from `${baseUrl}/api/auth/operators?_=${Date.now()}` with the header `"X-API-Key": apiKey`.
2. **Fallback**: If the fetch fails, it sets operators to a hardcoded array (Ahmed Shabbir and Lex Friedman).
3. **Editing (Local/Simulated)**: Clicking edit opens fields (`name`, `email`, `role`, `api_key`). Saving calls `setOperators` to update the React state locally without dispatching any server request.

### Required Migration to `/api/users` (CRUD)
The subtask requires migrating from `/api/auth/operators` to `/api/users` with full CRUD:
1. **Fetch Users**:
   - Query: `GET /api/users?include_inactive=true`
   - Response structure contains `active: boolean` and lists of api keys:
     ```json
     [
       {
         "id": "usr-1",
         "username": "ahmed",
         "name": "Ahmed Shabbir",
         "email": "ahmed@savant.ai",
         "role": "admin",
         "active": true,
         "api_keys": ["sk-ahmed-savant-001"]
       }
     ]
     ```
2. **Collapsible Trees grouping**:
   - Organize into 4 groups:
     - **Active Admins**: `role === "admin" && active === true`
     - **Active Users**: `role !== "admin" && active === true`
     - **Inactive Admins**: `role === "admin" && active === false`
     - **Inactive Users**: `role !== "admin" && active === false`
   - Implement collapsible tree views using React state or Radix Collapsible (`import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible'`).
3. **CRUD endpoints integration**:
   - **Create**: `POST /api/users` with request payload `{ username, name, email, role }`.
   - **Update**: `PUT /api/users/:userId` with request payload `{ name, email, role }`.
   - **Deactivate**: `DELETE /api/users/:userId` (changes status to inactive).
   - **Regenerate API Key**: `POST /api/users/:userId/api-key`, displaying the newly generated token (`api_key`).

---

## 4. react-day-picker Integration & Custom Calendar Primitive

- There is a styled custom calendar wrapper `src/renderer/components/ui/calendar.tsx` which wraps the raw `DayPicker` from `react-day-picker`.
- **CSS and Class Layout**:
  - Integrates seamlessly with the tailwind theme.
  - Active selected days: `bg-primary text-primary-foreground` (which corresponds to Cyan highlight).
  - Current day: `bg-accent text-accent-foreground` (Magenta highlight).
  - Custom Chevrons: Lucide `ChevronLeft` and `ChevronRight` are preconfigured.
- **RemindersView Usage**:
  - `RemindersView` should NOT import `DayPicker` directly.
  - Instead, import `import { Calendar } from "../ui/calendar";` to inherit style guide overrides automatically.

---

## 5. Testing Structure & Fetch Mocking

### Directory & Files Layout
- Unit and integration tests reside in `src/renderer/test/`.
- Pre-test setup is defined in `src/renderer/test/setup.ts`.
- Tab-specific view tests reside in `src/renderer/test/Tabs.test.tsx`.

### Fetch Mocking Architecture
1. **Global Fallback Mock (`setup.ts`)**:
   Stubbed via `vi.stubGlobal('fetch', ...)` returning a validated response:
   ```typescript
   vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
     ok: true,
     status: 200,
     json: vi.fn().mockResolvedValue({ valid: true, user_id: 'test-user', name: 'test-user', role: 'admin' }),
   }))
   ```
2. **Dynamic Route Mocking (`Tabs.test.tsx`)**:
   Individual suites mock specific fetch calls in a `beforeEach` block by spying on the global fetch:
   ```typescript
   vi.spyOn(window, 'fetch').mockImplementation((url) => {
     const u = url.toString()
     if (u.includes('/api/...')) { ... }
     ...
   })
   ```

### Adding Mocks for `/api/reminders` and `/api/users`
- For global integration testing in `setup.ts`, we should extend the stub to safely return empty arrays or default mocks when matched to prevent runtime errors:
  ```typescript
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
    const u = url.toString()
    if (u.includes('/api/reminders')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
    }
    if (u.includes('/api/users')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ valid: true, user_id: 'test-user', name: 'test-user', role: 'admin' }),
    })
  }))
  ```
- For specific unit tests in `src/renderer/test/Tabs.test.tsx` (or a new `RemindersView.test.tsx`/`UsersCRUD.test.tsx` file):
  - Mock `fetch` in `beforeEach` to simulate server actions:
    - `GET /api/reminders` -> returns mock reminders.
    - `GET /api/users?include_inactive=true` -> returns users representing different roles and active statuses.
    - `POST /api/users`, `PUT /api/users/:userId`, `DELETE /api/users/:userId`, and `POST /api/users/:userId/api-key` -> return successful mock responses to verify UI changes after CRUD actions.
