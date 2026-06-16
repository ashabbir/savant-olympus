# Implementation Strategy: R3 (Collapsible & Toggleable Node Details Panel)

This document details the implementation strategy for adding a collapsible and toggleable node details panel to the Savant Olympus Knowledge Graph.

---

## 1. Overview of Requirements
The R3 requirement calls for:
1. **Collapsible Details Panel**: When a selection is active, the details panel must support collapse and expand actions.
2. **Collapse/Expand Toggle Buttons**:
   - A collapse button must be present in the details panel header next to the close (`✕`) button. When clicked, the panel hides (`w-0` or Tailwind `hidden` class).
   - An expand button (e.g., `<ArrowLeft size={16} />`) must appear on the right edge of the graph container when the panel is collapsed, allowing the user to restore the panel.
3. **Auto-expansion on New Node Selection**: If a new node is selected (or added in bulk mode) while the details panel is collapsed, the panel must automatically expand.

---

## 2. Current State Analysis
In `src/renderer/components/tabs/KnowledgeView.tsx`:
* **State Management**: Node selection is tracked via `selectedNode` (single node) and `selectedNodes` (a `Map<string, Node>` for multi-selection).
* **DOM Structure**: The main workspace is divided into:
  - **Graph Container**: `<div ref={containerRef} className="flex-1 border ... bg-[var(--cp-bg-0)] relative overflow-hidden">`
  - **Details Panel**: `<div className="w-80 border ... bg-[var(--cp-bg-1)] flex flex-col overflow-hidden" ...>`
* **Add Node Form Placement**: Currently, if no node is selected, the details panel defaults to displaying the "Add Node" form. Under R2 and R4, this form is moved to a modal, and the details panel is hidden entirely when no nodes are selected.

---

## 3. Implementation Design

### 3.1. State Management
Introduce a new boolean state to track the collapse state:
```tsx
const [isCollapsed, setIsCollapsed] = useState(false);
```

Define a helper to check if a selection is active:
```tsx
const hasSelection = selectedNode !== null || selectedNodes.size >= 2;
```

### 3.2. Auto-Expansion Logic
To ensure the panel automatically expands when a new selection is made, we monitor `selectedNode` and `selectedNodes.size` using a React `useEffect` and refs:
```tsx
const prevSelectedNodeId = useRef<string | null>(null);
const prevSelectedNodesSize = useRef<number>(0);

useEffect(() => {
  const currentId = selectedNode?.node_id || selectedNode?.id || null;
  const currentSize = selectedNodes.size;

  const nodeChanged = currentId !== null && currentId !== prevSelectedNodeId.current;
  const nodesAdded = currentSize > prevSelectedNodesSize.current;

  // Auto-expand on new node selection or new bulk node additions
  if (nodeChanged || nodesAdded) {
    setIsCollapsed(false);
  }

  prevSelectedNodeId.current = currentId;
  prevSelectedNodesSize.current = currentSize;
}, [selectedNode, selectedNodes]);
```

### 3.3. JSX Layout Modification
1. **Details Panel Header Toggle Button**: Add a collapse button left of the close (`✕`) button:
```tsx
<div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] px-4 py-3 items-center justify-between">
  <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--cp-cyan)]">
    {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : selectedNode ? "// Node Details" : ""}
  </span>
  <div className="flex items-center gap-2">
    <button
      onClick={() => setIsCollapsed(true)}
      title="Collapse Panel"
      className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer flex items-center justify-center p-1"
    >
      <ArrowRight size={14} />
    </button>
    {(selectedNode || selectedNodes.size > 0) && (
      <button
        onClick={() => {
          setSelectedNode(null);
          setSelectedNodes(new Map());
        }}
        className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer flex items-center justify-center p-1"
      >
        ✕
      </button>
    )}
  </div>
</div>
```

2. **Graph Container Expand Button**: Render the expand button inside the graph container (`containerRef` element), absolutely positioned to touch the right edge:
```tsx
<div ref={containerRef} className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-0)] relative overflow-hidden">
  {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 text-xs font-mono text-[var(--cp-cyan)] animate-pulse">SYNCING_VECTORS...</div>}
  <svg ref={svgRef} id="kb-graph-svg" className="w-full h-full cursor-grab active:cursor-grabbing" />
  
  {/* Existing Explore slider control ... */}
  
  {/* R3 Expand Button */}
  {isCollapsed && hasSelection && (
    <button
      onClick={() => setIsCollapsed(false)}
      title="Expand Panel"
      className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-[var(--cp-bg-1)] border-y border-l border-[var(--cp-border)] hover:bg-[var(--cp-bg-2)] text-muted-foreground hover:text-foreground p-2 flex items-center justify-center cursor-pointer shadow-lg rounded-l"
    >
      <ArrowLeft size={16} />
    </button>
  )}
</div>
```

3. **Details Panel Container Visibility**: Conditionally apply the Tailwind `hidden` class when `isCollapsed` is true, and only render if `hasSelection` is true:
```tsx
{hasSelection && (
  <div
    className={`w-80 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden transition-all duration-200 ${
      isCollapsed ? "hidden" : ""
    }`}
    style={{ animation: "slideInRight 0.2s ease-out" }}
  >
    {/* Merged or selected node details content */}
  </div>
)}
```

---

## 4. Test Strategy and Test Cases

To verify that the collapsible details panel operates correctly, add the following test suite in `src/renderer/test/KnowledgeView.test.tsx`:

```tsx
  it('supports R3 collapsible & toggleable node details panel', async () => {
    render(<KnowledgeView serverUrl="http://savant.local/" apiKey="sk-test" />)

    // 1. Initially, no node is selected, and details panel is not visible
    expect(screen.queryByText('// Node Details')).not.toBeInTheDocument()

    // 2. Select a node via search to open details panel
    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Auth' } })
    const searchHits = await screen.findAllByText('Auth Service')
    fireEvent.click(searchHits[0])

    await waitFor(() => expect(screen.getByText('// Node Details')).toBeInTheDocument())
    const detailsPanel = screen.getByText('// Node Details').closest('.w-80')
    expect(detailsPanel).toBeInTheDocument()
    expect(detailsPanel).not.toHaveClass('hidden')

    // 3. Click the collapse button (ArrowRight)
    const collapseButton = screen.getByTitle('Collapse Panel')
    fireEvent.click(collapseButton)

    // Details panel should be hidden (hidden class applied)
    expect(detailsPanel).toHaveClass('hidden')

    // Expand button (ArrowLeft) should appear on the right edge of the graph
    const expandButton = screen.getByTitle('Expand Panel')
    expect(expandButton).toBeInTheDocument()

    // 4. Click the expand button (ArrowLeft) to restore details panel
    fireEvent.click(expandButton)
    expect(detailsPanel).not.toHaveClass('hidden')
    expect(screen.queryByTitle('Expand Panel')).not.toBeInTheDocument()

    // 5. Collapse again and select a different node to trigger auto-expansion
    fireEvent.click(screen.getByTitle('Collapse Panel'))
    expect(detailsPanel).toHaveClass('hidden')

    // Search and click second node "Postgres" to trigger selection change
    fireEvent.change(screen.getByPlaceholderText('Find knowledge node...'), { target: { value: 'Postgres' } })
    const secondNodeHits = await screen.findAllByText('Postgres')
    fireEvent.click(secondNodeHits[0])

    // Panel must automatically expand to display the new node's details
    await waitFor(() => expect(detailsPanel).not.toHaveClass('hidden'))
    expect(screen.getByText('Database')).toBeInTheDocument()
  })
```

### Verification Command
Run the tests using:
```bash
npx vitest run src/renderer/test/KnowledgeView.test.tsx
```
This ensures both the existing functionality and all parts of the R3 collapse/expand/auto-expand requirements are properly verified.
