# Analysis and Implementation Strategy — Knowledge Graph UI Enhancements

This document details the analysis and implementation strategy for the Savant Olympus Knowledge Graph UI enhancements, specifically focusing on **R1 (Canvas SVG Contrast and Domain Hull Opacities)** and **R2 (Responsive Wide Layout & Details Panel Hiding)**.

---

## 1. Requirement R1: Canvas SVG Contrast & Domain Hull Opacities

### Current State Analysis
* **SVG Container Background**: The container div hosting the SVG (`svgRef`) currently uses CSS class `bg-[var(--cp-bg-0)]` (line 737 in `KnowledgeView.tsx`). This background color does not provide sufficient contrast for the node types and domain bubbles.
* **Domain Hulls (D3 Path Groups)**:
  * Domain hull path elements (representing D3 clusters/bubbles) are appended with D3 selectors at lines 279-286:
    ```tsx
    const path = domainHullG.append("path")
      .attr("fill", area.color)
      .attr("fill-opacity", 0.12)
      .attr("stroke", area.color)
      .attr("stroke-opacity", 0.6)
      ...
    ```
  * Furthermore, the colors in the `domainHullColors` array (line 184) already contain an alpha transparency channel (`rgba(..., 0.38)`). Because both the RGBA color alpha value and the SVG attribute `fill-opacity` compose, the effective background fill opacity of the hull bubbles is extremely low (`0.38 * 0.12 = 0.0456` or ~4.5%).

### Proposed Changes
1. **Background Contrast Enhancement**:
   Change the container background class of the SVG wrapper (line 737) from `bg-[var(--cp-bg-0)]` to `bg-[var(--cp-bg-1)]` or `bg-[var(--cp-bg-2)]` for a darker, high-contrast, futuristic canvas.
2. **Domain Hull Opacity Tuning**:
   Modify the path attributes of D3 hulls in `KnowledgeView.tsx`:
   * Set `fill-opacity` attribute to `0.28` (was `0.12`).
   * Set `stroke-opacity` attribute to `0.85` (was `0.6`).
   * Optionally keep or slightly increase the alpha transparency of `domainHullColors` values (e.g. `rgba(..., 0.45)` or use solid colors with clean SVG opacity variables) to ensure the bubbles stand out clearly.

---

## 2. Requirement R2: Responsive Wide Layout & Contextual Details Panel

### Current State Analysis
* **Persistent Panel**: Currently, the details panel is always rendered regardless of whether nodes are selected. When no node is selected, it displays the "Add Node" form (lines 808-815).
* **Grid/Flex Constraints**: The main layout (line 736) uses a flex container with `gap-4`:
  ```tsx
  <div className="flex-1 flex gap-4 overflow-hidden relative min-h-0">
  ```
  If the details panel is rendered, it takes up `w-80` width, squeezing the graph container.

### Proposed Changes
1. **Selection Visibility Toggle**:
   Wrap the details panel `<div className="w-80 ...">` inside a condition checking if selection is active:
   ```tsx
   const hasSelection = selectedNode !== null || selectedNodes.size > 0;
   ```
   When `hasSelection` is false, the panel should be completely unrendered (returns `null`), enabling the graph container (`flex-1`) to occupy the entire width.
2. **Collapsible details panel (R3 Integration)**:
   Add a state `isCollapsed` (boolean) to the component:
   ```tsx
   const [isCollapsed, setIsCollapsed] = useState(false);
   ```
   * **Auto-Expand on Selection Change**:
     To auto-expand the panel when a node is selected (single or bulk), add a declarative `useEffect`:
     ```tsx
     useEffect(() => {
       if (selectedNode || selectedNodes.size > 0) {
         setIsCollapsed(false);
       }
     }, [selectedNode, selectedNodes.size]);
     ```
   * **Collapse Control (Header)**:
     Embed a collapse button (`ArrowRight` icon) inside the details panel header next to the close `✕` button. Clicking it sets `isCollapsed` to `true`.
   * **Expand Control (Graph Canvas Edge)**:
     Absolutely position an expand button (`ArrowLeft` icon) on the right edge of the graph container. It should be visible only when `hasSelection && isCollapsed` is true. Clicking it sets `isCollapsed` to `false`.
   * **Tailwind Class Toggling**:
     Apply `isCollapsed ? 'w-0 border-none hidden' : 'w-80'` classes to the details panel container to hide it cleanly and remove the flex `gap` layout effect.
3. **Move Add Node form to a Modal (R4 Integration)**:
   Since the panel is hidden when no nodes are selected, the "Add Node" form must be moved to a modal.
   * Reuse the existing `isAddModalOpen` state.
   * Add a `+` button in the top action bar next to Upload/Download/Reload/Purge to trigger `setIsAddModalOpen(true)`.
   * Render the form in a modal structure similar to the Connect Node modal.
   * Close the modal (`setIsAddModalOpen(false)`) upon successful node creation in `handleAddNode`.

---

## 3. Recommended Code Modifications

### Target: `src/renderer/components/tabs/KnowledgeView.tsx`

* **State additions**:
  ```tsx
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasSelection = selectedNode !== null || selectedNodes.size > 0;
  ```

* **D3 Area Hull Attributes Modification**:
  ```tsx
  const path = domainHullG.append("path")
    .attr("fill", area.color)
    .attr("fill-opacity", 0.28) // increased from 0.12
    .attr("stroke", area.color)
    .attr("stroke-opacity", 0.85) // increased from 0.6
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "6,4")
    .attr("pointer-events", "none");
  ```

* **Layout Restructuring**:
  ```tsx
  <div className="flex-1 flex gap-4 overflow-hidden relative min-h-0">
    <div ref={containerRef} className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] relative overflow-hidden">
      {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 text-xs font-mono text-[var(--cp-cyan)] animate-pulse">SYNCING_VECTORS...</div>}
      <svg ref={svgRef} id="kb-graph-svg" className="w-full h-full cursor-grab active:cursor-grabbing" />
      
      {/* R3 Expand Button */}
      {hasSelection && isCollapsed && (
        <button 
          onClick={() => setIsCollapsed(false)}
          title="Expand Details"
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-[var(--cp-bg-1)] border-l border-y border-[var(--cp-border)] p-2 hover:text-[var(--cp-cyan)] transition-all z-20 cursor-pointer rounded-l"
        >
          <ArrowLeft size={16} />
        </button>
      )}

      {/* Explore depth control ... */}
    </div>

    {/* R2 / R3 Details Panel */}
    {hasSelection && (
      <div 
        className={`w-80 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden transition-all duration-300 ${isCollapsed ? "w-0 border-none hidden" : ""}`}
        style={{ animation: "slideInRight 0.2s ease-out" }}
      >
        <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] px-4 py-3 items-center justify-between">
          <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--cp-cyan)]">
            {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : selectedNode ? "// Node Details" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsCollapsed(true)} 
              title="Collapse Panel" 
              className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
            >
              <ArrowRight size={14} />
            </button>
            <button 
              onClick={() => { setSelectedNode(null); setSelectedNodes(new Map()); }} 
              title="Close Selection"
              className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Panel Content (Remove Add Node form since it is now in a Modal) */}
        ...
      </div>
    )}
  </div>
  ```

---

## 4. Test Suite Strategy

* **Problem Statement**: Moving the "Add Node" form from the details panel into a modal dialog causes the existing test (`creates a new knowledge node and reloads the graph`) to fail since it expects the form fields to be visible in the details panel by default.
* **Solution**:
  Modify the test file (`KnowledgeView.test.tsx`) to trigger clicking the `+` action button (retrieved via `screen.getByTitle('Add Node')`) to open the modal before filling out the form.
* **Proposed Test Updates**:
  ```tsx
  // Open Add Node Modal first
  fireEvent.click(screen.getByTitle('Add Node'))
  
  await screen.findByText('// Add Node')
  // Locate fields and submit node creation
  ```
* **New Integration Test**: Add an integration test to specifically verify that panel collapses/expands properly and hidden classes are toggleable.
