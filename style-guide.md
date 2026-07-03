# Savant Desktop Style Guide

## Purpose

This guide defines the shared Savant desktop style used by Sanctum, Olympus, and adjacent control-surface apps. The UI should feel like a command surface for user-scoped work, not a generic dashboard and not a chat client.

This guide defines the visual system, shell layout, density, and interaction patterns.

## 1. Design Direction

should feel:

- precise
- dense
- technical
- calm under load
- information-rich without looking cluttered

The app should borrow the structural discipline of Quorum, the control-surface organization of Olympus, and the text rhythm of Sanctum while using the same visual system:

- dark navy background surfaces
- cyan primary accents
- magenta secondary accents
- muted blue-gray text and panels
- thin borders
- tiny corner radius
- compact industrial typography

Avoid:

- generic SaaS spacing
- flat empty white panels
- playful consumer styling
- oversized cards with wasted space
- bright rainbow gradients
- soft glassmorphism
- neon glow overload

## 2. App Shell

Sanctum should use a persistent desktop shell with five main regions:

- top header
- left navigation rail
- central workspace
- right context rail
- bottom status bar

The shell must communicate state continuously. The user should always be able to answer:

- where am I
- what workspace am I in
- what session am I looking at
- is the server online
- are MCP/config/install actions ready

## 3. Layout Model

### 3.1 Top Header

The top header is the global identity strip.

Responsibilities:

- icon + app title
- minimal global identity
- optional context only when it adds clarity
- compact status indicators if needed

Style:

- sticky
- very compact
- icon first, title next
- visually separated from content by a thin border
- no heavy height
- should feel like a label strip, not a marketing header

### 3.2 Left Navigation Rail

The left rail is the main navigation spine.

Responsibilities:

- workspace list
- session list
- tasks
- reminders
- notes
- files
- Jira
- merge requests
- settings/preferences
- skills/tools
- MCP/system

Style:

- very narrow by default
- collapsible or expandable
- icon-first, often letter-first
- strong hierarchy for active section
- persistent and never visually noisy

Behavior:

- selection state must be obvious
- section grouping should be visible
- counts and badges should be compact

### 3.2.1 Left Collapsible Panel

When a view needs an entity list immediately after the left rail, that list is the Left Collapsible Panel. It is a secondary tree or registry pane and must be collapsible.

Use this pane for:

- workspace trees
- project/repository trees
- user indexes
- ability/asset trees
- tool or MCP registry lists
- skill registries
- scheduler matrices and reminder filters
- session/file/artifact trees

Rules:

- default width should be compact, usually 220-320px
- collapsed width should be rail-like, usually 40-48px
- the collapse/expand control lives in the pane header
- the collapsed pane becomes a narrow named bar, not empty space
- the named bar uses a vertical mono label for the hidden entity set, for example `PROJECTS`, `WORKSPACES`, `USERS`, `ASSETS`, `TOOLS`, `SKILLS`, or `REMINDERS`
- example: when the project tree collapses, a slim bar remains after the left rail and says `PROJECTS`
- example: when the tools registry collapses, a slim bar remains after the left rail and says `TOOLS`
- example: when the skills registry collapses, a slim bar remains after the left rail and says `SKILLS`
- example: when the scheduler matrix collapses, a slim bar remains after the left rail and says `REMINDERS`
- collapsing the pane must give width back to the primary work surface
- the left rail itself remains stable and does not become the entity list
- entity tree rows use dense mono text, small icons, badges, and thin active-state borders
- search/filter controls belong inside the open tree pane, not in the global header
- do not replace the right context rail with this pane; the tree selects entities, the right rail inspects context

### 3.3 Center Workspace

The center area is the primary work surface.

Responsibilities:

- workspace detail
- session detail
- task views
- reminder views
- notes/files/Jira/MR detail
- provider/configuration setup flows

Style:

- full density
- flexible and scrollable
- content cards should be bounded but not boxed-in
- views should feel layered, not modal-heavy

### 3.4 Right Context Rail

The right rail is the inspection and augmentation surface.

Responsibilities:

- session context
- file preview
- stats
- timeline
- metadata
- linked items
- diagnostics
- graph/analysis/contextual detail

Style:

- narrower than center
- context-sensitive
- can collapse when the user needs more room
- should never compete with the main work surface

### 3.5 Bottom Status Bar

The bottom bar is the persistent system feedback strip.

Responsibilities:

- sync state
- server online/offline
- MCP status
- current user
- current workspace
- notification counts
- background activity
- local install/config status

Style:

- low-height
- high-information
- muted by default
- changes color only when a state matters

## 4. Visual Language

### 4.1 Overall Tone

Sanctum should combine:

- Quorum’s operational density
- Olympus’s modular control-surface structure
- a slightly more productized and explicit information architecture

### 4.2 Typography

Recommended direction:

- section headers: Orbitron-style, uppercase, letter-spaced
- body text: Rajdhani first, with Inter/system as fallback
- numeric data and technical labels: Share Tech Mono-style mono
- labels: compact, deliberate, not decorative

Typography should support:

- rapid scanning
- dense tables and metadata
- clear hierarchy between entity name, status, and detail

Text should match Sanctum:

- product chrome uses short, quiet labels such as `OP_CON`, `Workspaces`, `Preferences`, and `Logout`
- visible human-facing copy uses sentence case where possible
- machine labels, section tags, IDs, and status codes may use uppercase mono text
- avoid snake_case and all-caps for normal user actions unless the control is explicitly a technical command
- entity names are the largest text in rows; metadata stays smaller and muted
- helper copy should be specific and operational, not marketing language

### 4.3 Color

Use the Sanctum runtime palette:

- background: `#06090f`
- shell/sidebar panels: `#0b0f1a`
- cards/panels: transparent for standard panels, `#0b0f1a` for modal/toast cards
- secondary surfaces: `#0f1929`
- muted surfaces: `#111a2a`
- primary: `#00e5ff`
- accent: `#ff00aa`
- success: `#00ff88`
- warning: `#ffe600`
- destructive: `#ff2244`
- foreground text: `#f0f4f8`
- muted text: `#a0aec0`
- default borders: `rgba(0, 229, 255, 0.15)`
- strong card/toast borders: `rgba(0, 229, 255, 0.2)`

Rules:

- avoid random rainbow accents
- use color to encode state, not decoration
- keep destructive and success states consistent across API, MCP, and local install flows
- do not introduce purple-forward or pastel-forward themes

### 4.4 Surfaces

Use layered surfaces rather than flat panels:

- app background: `#06090f`
- shell panel: `#0b0f1a`
- card/panel: transparent with thin cyan border
- inset/secondary: `#0f1929`
- muted/active surface: `#111a2a`
- overlay: `rgba(6, 9, 15, 0.72)`

Each surface should be distinguishable without heavy borders.
Borders should stay thin and subtle, with the primary differentiation coming from surface tone rather than shadow-heavy depth.

## 5. Navigation and Information Hierarchy

### 5.1 Primary Hierarchy

1. Workspace
2. Session
3. Attached artifacts
4. Support/integration surfaces
5. Settings and local install/config

### 5.2 Secondary Hierarchy

Within session and workspace views, prioritize:

- identity
- current status
- linked artifacts
- timeline/history
- actions

Do not bury the entities under admin or settings UI.

## 6. Component Patterns

### 6.1 Cards

Cards should be:

- compact
- structured
- information-dense
- easy to scan in grid or list form
- transparent by default for workspace panels
- `#0b0f1a` for modal/toast cards
- thin bordered with cyan at `rgba(0, 229, 255, 0.15)`, using `rgba(0, 229, 255, 0.2)` for stronger modal/toast cards
- square in shell surfaces, with `0.125rem` only for modal/toast cards
- minimal shadow

Use cards for:

- workspace summaries
- session summaries
- task summaries
- reminder summaries
- linked Jira/MR artifacts

### 6.2 Tables and Lists

Use tables when comparing:

- sessions
- tasks
- reminders
- Jira tickets
- merge requests
- providers
- config states

Use list rows when:

- hierarchy is shallow
- actions are per-item
- density matters more than decoration

Tree/list panes:

- must collapse when they sit directly after the left rail
- must leave a named collapsed bar that identifies the hidden list
- should keep rows 28-40px tall depending on metadata density
- use chevrons only for real hierarchy or pane collapse, not decoration
- show counts and status badges at the trailing edge
- keep the selected row obvious with a cyan border or inset surface

### 6.3 Tabs and Subtabs

Tabs are acceptable for switching between related entity views, but do not overuse them.

Use tabs for:

- session subviews
- workspace subviews
- settings subviews
- MCP/system subviews

Rule:

- tabs should expose relationships, not hide them
- when a view gets too fragmented, consolidate it into a panel with filtered sections

### 6.4 Modals

Use modals only for:

- editing
- confirmation
- focused lookup
- quick create

Avoid:

- deep modal nesting
- modal-only navigation
- modal overload for primary workflows

### 6.5 Toasts

Toasts are part of the product language.

Use toasts for:

- success/failure of writes
- provider config setup
- skill/tool installation
- MCP reconnect/setup results
- session/workspace linking
- sync state changes

Toast style:

- compact
- high contrast
- short-lived unless action required
- distinguish success, warning, and error clearly

## 7. Shell-Specific Guidance

### 7.1 Header

The header should show only the identity lockup by default.

Good examples:

- `[icon] Sanctum`
- `[icon] Sanctum · Workspace`

Preferred structure:

- icon first
- `Sanctum` title immediately beside the icon
- context only when it is genuinely useful

### 7.2 Left Bar

The left bar should present major app areas in a stable order using compact glyphs or abbreviations:

- `W`
- `S`
- `T`
- `R`
- `N`
- `F`
- `J`
- `M`
- `K`
- `P`

Small labels can appear when expanded, but the default rail should read visually like a tight control column.

If a tree pane follows the left bar, it is not optional decoration. It must have its own collapse button and a collapsed rail label, matching the Sanctum workspace pane pattern.

### 7.3 Right Bar

The right rail should adapt to the selected entity:

- session details show stats, notes, files, linked items
- workspace details show aggregate counts and summaries
- settings views show status and help text
- MCP/config views show install/config state

### 7.4 Bottom Bar

The bottom bar should always include:

- server connectivity
- sync state
- current user
- active workspace/session where relevant
- active notifications or warnings

The bar should feel like a dense status strip:

- state runs left to right
- separators stay minimal
- build/version may sit at the far right
- text should be compact and information-rich

## 8. Content Density Rules

Sanctum should favor dense, readable layouts.

Rules:

- keep padding tight but not cramped
- show metadata inline when it improves scanning
- avoid large empty hero spaces
- minimize decorative whitespace
- use collapsible sections for optional detail
- prefer rows and tables over oversized cards when comparing entities

Recommended behavior:

- lists are the default
- cards are for grouped summaries
- full-width detail panes are for focused editing

## 9. State and Feedback

### 9.1 Loading

Loading states should be clear and local to the area being loaded.

- skeletons for lists and panels
- spinner only when needed
- keep surrounding UI stable

### 9.2 Empty States

Empty states should explain:

- what this section is
- why it might be empty
- what to do next

### 9.3 Error States

Errors should:

- identify the failing surface
- show the relevant action
- avoid technical jargon unless in diagnostics mode

## 10. Motion

Motion should be minimal and intentional.

Use motion for:

- panel transitions
- drawer open/close
- toast entrance and exit
- selection emphasis
- status change emphasis

Avoid:

- continuous decorative animation
- motion that slows task completion
- novelty effects that reduce legibility
- neon flicker effects
- exaggerated particle/glow systems

## 11. Sanctum-Specific Product Framing

Sanctum is not a chat-first app.

It should feel like:

- a work operations console
- a session-linked artifact manager
- a configuration hub for AI-provider workflows
- a tool surface for both humans and agents

Therefore, the UI must make these domains obvious:

- workspaces
- sessions
- tasks
- reminders
- notes/files
- Jira/MR artifacts
- provider config
- MCP setup
- skills/tools install

The styling should remain consistent with the existing Savant desktop family:

- industrial technical UI
- dark operator-console surfaces
- small radii
- tight spacing
- cyan/magenta status accents
- legible dense tables and side rails

## 12. Implementation Notes

- Keep the shell persistent across views.
- Use the right rail for detail instead of opening excess modals.
- Keep preference and config actions visible but not dominant.
- Prefer explicit labels for cross-system integrations.
- Make server truth and local state visually distinct when needed.
- Surface local install/config status in the chrome, not buried in settings only.

## 13. What Sanctum Should Not Look Like

Sanctum should not look like:

- a generic admin dashboard
- a chat app with a side panel
- a consumer productivity tool
- an overstyled AI demo
- a blank workspace with hidden power features
- a neon cyberpunk poster
- a glassmorphic marketing site
- a pastel productivity app

## 14. Reference Alignment

Use Quorum and Olympus as the structural reference for:

- header and sidebars
- dense operational panels
- status feedback
- compact system indicators

Use Sanctum’s own roadmap and domain model for:

- session/workspace framing
- local setup/install surfaces
- user-scoped work artifacts
- MCP/API dual surface behavior

## 15. Design Checklist

Before shipping a Sanctum screen, verify:

- the active workspace/session is visible
- the current surface is obvious
- the right rail adds value
- the left rail is navigable
- the bottom bar shows live state
- toasts are used for real feedback only
- the screen is readable at dense, operational scale

## 16. Visual Examples

### 16.1 Global Shell

Use this as the baseline desktop layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [icon] Sanctum                                                                               │
├───────────────┬──────────────────────────────────────────────────────────────┬───────────────┤
│               │                                                              │               │
│  W            │  WORKSPACE / SESSION / TASK / REMINDER / CONFIG CONTENT      │   CONTEXT     │
│  S            │                                                              │   RA IL       │
│  T            │  primary view with lists, tables, details, and editors       │  stats        │
│  R            │                                                              │  notes        │
│               │                                                              │  files        │
│               │                                                              │  jira / mrs   │
│               │                                                              │  diagnostics  │
│  M            │                                                              │               │
│  L            │                                                              │               │
│  P            │                                                              │               │
├───────────────┴──────────────────────────────────────────────────────────────┴───────────────┤
│  Server: online · MCP: connected · User: ahmed · Sync: live · Outbox: 2 queued · Notifications: 1 · Last refresh: 14s ago · v1 │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Top Header Example

The header should read like a control strip, not a hero banner:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [icon] Sanctum                                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Key traits:

- icon first
- title immediately beside the icon
- no breadcrumb noise by default
- no oversized title block

### 16.3 Left Rail Example

The left rail should be compact and high-signal:

```text
┌──────────────┐
│ S            │
├──────────────┤
│ W            │
│ S            │
│ T            │
│ R            │
│ N            │
│ F            │
│ J            │
│ M            │
│ K            │
│ P            │
└──────────────┘
```

Variant with badges:

```text
│ S   128 │
│ T    14 │
│ R     6 │
│ J     9 │
│ M     3 │
```

### 16.4 Right Rail Example

The right rail should act as an inspector:

```text
┌────────────────────┐
│ Session Info       │
├────────────────────┤
│ Status: Active     │
│ Provider: Copilot  │
│ Workspace: Auth    │
│ Messages: 243      │
│ Tools: 19          │
│ Files: 12          │
├────────────────────┤
│ Linked Items       │
│ • AUTH-1234        │
│ • MR !381          │
│ • Notes (8)        │
├────────────────────┤
│ Diagnostics        │
│ Server: online     │
│ MCP: connected     │
│ Sync: current      │
└────────────────────┘
```

### 16.5 Workspace Detail Example

Workspace detail should combine summary and actionable lists:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Auth Refactor                                                                │
│ active workspace · 18 sessions · 4 tasks · 2 reminders                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ Sessions                                                                      │
│ ┌───────────────┬──────────┬──────────┬──────────┬─────────────────────────┐ │
│ │ Session       │ Provider │ Status   │ Files    │ Linked artifacts         │ │
│ ├───────────────┼──────────┼──────────┼──────────┼─────────────────────────┤ │
│ │ 2026-06-17    │ Copilot  │ Active   │ 12       │ AUTH-1234 · MR !381      │ │
│ │ 2026-06-16    │ Claude   │ Idle     │ 5        │ Note set · MR !377       │ │
│ └───────────────┴──────────┴──────────┴──────────┴─────────────────────────┘ │
│                                                                              │
│ Tasks                         Reminders                                      │
│ • Verify API auth             • Follow up tomorrow                           │
│ • Review MR !381              • Re-check workspace link                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 16.6 Session Detail Example

Session detail should show the session as a work artifact hub:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Session: 2026-06-17 14:22 · Copilot · Auth Refactor                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Timeline / Conversation                                                     │
│ - user prompt                                                                │
│ - assistant reply                                                            │
│ - tool call                                                                  │
│ - file edit                                                                  │
│ - system event                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ Notes           │ Files             │ Jira Tickets     │ Merge Requests    │
│ - note 1        │ - src/app.ts      │ - AUTH-1234      │ - !381            │
│ - note 2        │ - src/api.ts      │ - AUTH-1250      │ - !377            │
├──────────────────────────────────────────────────────────────────────────────┤
│ Stats: 243 messages · 19 tools · 12 files touched · 8 checkpoints            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 16.7 Preferences / Install Example

Preferences should present local setup clearly:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Preferences / Provider Setup                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ API Key:  [***********************]  [Validate]                              │
│ Server:   [http://127.0.0.1:8090                  ]  [Save]                 │
│                                                                              │
│ Providers                                                                   │
│ [x] Copilot   MCP config found   Skills installed   [Reconfigure]           │
│ [x] Claude    MCP config found   Tools installed    [Reconfigure]           │
│ [ ] Codex     config missing                          [Detect]              │
│ [x] Savant    auto-config enabled                     [Repair]              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 16.8 Toast Example

Toast messages should be brief and specific:

```text
┌──────────────────────────────────────┐
│ ✓ Jira ticket AUTH-1234 linked       │
└──────────────────────────────────────┘
```

Other valid forms:

- `✓ MCP config updated for Copilot`
- `! Server offline, using cached data`
- `✕ Failed to write session file`

### 16.9 Status Bar Example

The bottom bar should keep the system state visible:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Server: online · MCP: connected · User: ahmed · Sync: live · Outbox: 0 · Notifications: 1 · v1 │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 16.10 Dense List Example

Use dense rows for compare-and-scan views:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Sessions                                                                             [Search] │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2026-06-17  Copilot   Active   Auth Refactor   243 msgs   12 files   AUTH-1234   !381       │
│ 2026-06-16  Claude    Idle     Billing Fix     118 msgs   6 files    AUTH-1190   !377       │
│ 2026-06-15  Codex     Archived Refactor        88 msgs    4 files     -           -         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 16.11 Modal Example

Modals should be narrow and purposeful:

```text
┌───────────────────────────────┐
│ Link Jira Ticket              │
├───────────────────────────────┤
│ Ticket ID                     │
│ [AUTH-1234               ]    │
│                               │
│ [Link]           [Cancel]     │
└───────────────────────────────┘
```

### 16.12 What Good Looks Like

Sanctum feels right when:

- the shell is always visible
- the active workspace/session is never ambiguous
- the right rail is useful, not decorative
- lists are readable at speed
- toasts report real state changes
- configuration feels like part of the product, not a hidden admin task

local DB:
- should always have a local DB
- should store login info
- sql lite under ~/.savant/{{appneme}}.db

Login:
- should be a modal 
- should have api key 
- once loged in should be stored in local storage db
- once logged in logout should be in left rail bottom section bottom most icon
- we only have X and ✅ icon 


preference settings:
- should be a modal
- should be above logout icon in left rail bottom section
- should have 
- we only have X and ✅ icon 

Right Rail Interaction and Drawer:
- right rail should have icons that are in context of what is selected in left rails
- right rail icons when clicked should open a Drawer - Left to right slow slide and it should cover from LEFT RAIL TO RIGHT RAIL
- drawer should have X icon on top to close
- drawer should close when i press escape
