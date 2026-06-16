# Project Plan: Knowledge Graph Refinements

## Architecture & Scope
The goal is to refine the Savant Olympus Knowledge Graph view component (`src/renderer/components/tabs/KnowledgeView.tsx`) and its accompanying tests (`src/renderer/test/KnowledgeView.test.tsx`).
Key source file: `src/renderer/components/tabs/KnowledgeView.tsx`
Key test file: `src/renderer/test/KnowledgeView.test.tsx`

## Requirements Decomposition

### Milestone 1: Canvas, Domain Hull Visibility & Responsive Width (R1, R2)
- Update the SVG container background color to `bg-[var(--cp-bg-1)]` or `bg-[var(--cp-bg-2)]` for contrast.
- Increase domain hull (bubble) fill opacity from `0.12` to `0.28` (or similar) and stroke opacity to `0.85` or higher.
- Hide the right details panel entirely when no node is selected (and no multiple nodes are selected for merging/bulk actions), letting the canvas span the full screen width.

### Milestone 2: Collapsible Details Panel (R3)
- When a node is selected (or multiselect for merging), the panel shows on the right.
- Add a collapse toggle button in the details panel header next to the close button.
- When collapsed, hide the details panel (e.g. `w-0` or `hidden`).
- Show an expand toggle button on the right edge of the graph container when collapsed.
- If a new node is selected while the panel is collapsed, automatically expand it.

### Milestone 3: Modal-Based Node Creation (R4)
- Move the "Add Node" form from the details panel into a clean dialog modal controlled by `isAddModalOpen`.
- Add a `+` (Add Node) button in the top action bar next to the Upload/Download/Reload/Purge buttons.
- Ensure that creating a node via the modal refreshes the graph and auto-selects the newly created node.

### Milestone 4: Testing & Verification (R4, Verification)
- Update/add unit tests in `src/renderer/test/KnowledgeView.test.tsx` to cover the new behaviors:
  - Left panel is hidden by default and graph takes full width.
  - Selecting a node opens the details panel.
  - Click to collapse/expand.
  - Adding a node via the modal triggers POST and refreshes the graph.
- Verify tests pass with `npm test`.
- Run Forensic Audit checks to ensure compliance and integrity.

## Execution Strategy
- We will execute this in a single loop (Explorer -> Worker -> Reviewer -> Challenger -> Auditor) targeting the single component file and test file.
- If any stage fails, we will loop back to Explorer with logs and error reports.
