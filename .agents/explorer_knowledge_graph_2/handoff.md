# Handoff Report: R3 Collapsible Node Details Panel

## 1. Observation
* **Details Panel Container**:
  - In `/Users/home/code/project-x/savant-olympus/src/renderer/components/tabs/KnowledgeView.tsx`, the details panel is currently structured as:
    ```tsx
    750:       <div className="w-80 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden" style={{ animation: "slideInRight 0.2s ease-out" }}>
    ```
    This container defaults to displaying the "Add Node" form (lines 808-815) when no node is selected:
    ```tsx
    754:             {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : selectedNode ? "// Node Details" : "// Add Node"}
    ```
* **Graph SVG Container**:
  - In `KnowledgeView.tsx`, the graph container wrapping the SVG has `ref={containerRef}` and is defined as:
    ```tsx
    737:       <div ref={containerRef} className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-0)] relative overflow-hidden">
    ```
* **Base Tests Status**:
  - Running `npx vitest run src/renderer/test/KnowledgeView.test.tsx` succeeds:
    ```
    ✓ test/KnowledgeView.test.tsx (3 tests) 235ms
    Test Files  1 passed (1)
         Tests  3 passed (3)
    ```

---

## 2. Logic Chain
1. Under **R2** and **R4**, the details panel must be completely hidden when no selection is active, and the "Add Node" form is relocated into a modal triggered by a `+` button in the top action bar. This means the details panel should only be rendered when `hasSelection` is true (`selectedNode !== null || selectedNodes.size >= 2`).
2. To enable collapsibility under **R3**, we must introduce state to track whether the details panel is collapsed (`const [isCollapsed, setIsCollapsed] = useState(false)`).
3. If `isCollapsed` is true, the details panel must be hidden (e.g., using Tailwind's `hidden` class on the container).
4. If `isCollapsed` is true and a selection is active, an expand button (`<ArrowLeft size={16} />`) must be rendered at the right edge of the graph container. Placing this button absolutely inside the `relative overflow-hidden` graph container at `right-0 top-1/2 -translate-y-1/2` aligns it perfectly at the edge.
5. In order to automatically expand the panel when a new node is selected, we need to track when the selection changes. A `useEffect` hook comparing the current selected node ID/size against mutable refs (`prevSelectedNodeId` and `prevSelectedNodesSize`) is the most reliable way to intercept selections and set `isCollapsed(false)`.

---

## 3. Caveats
* **Deselection**: If the panel is closed using the `✕` close button, the selection states are set to `null` or cleared. This correctly unmounts/hides the details panel. If a node is selected again later, the `useEffect` will fire due to the `selectedNode` transitioning from `null` to a non-null node, auto-expanding the panel correctly even if the previous node details were collapsed.
* **Radix UI**: Standard Radix primitives are available in `package.json` but a custom Tailwind implementation is simpler, more direct, and fully compatible with Olympus styles.

---

## 4. Conclusion
The proposed collapsible & toggleable node details panel implementation matches all acceptance criteria for R3. It introduces an `isCollapsed` state hook, modifies the details panel container to toggle visibility using Tailwind's `hidden` class, absolute-positions the expand button inside the graph container, and utilizes a `useEffect` with refs to automatically expand the panel on any selection change.

---

## 5. Verification Method
1. The implementation can be verified using the test suite defined in `analysis.md`.
2. Execute the test runner command:
   ```bash
   npx vitest run src/renderer/test/KnowledgeView.test.tsx
   ```
3. Check the visual layout in browser/electron development environment to ensure the panel toggles hide/show and the toggle buttons appear correctly.
