# Analysis Report: Knowledge Graph R4 Implementation Strategy

## Executive Summary
This report defines the implementation strategy for R4 of the Savant Olympus Knowledge Graph refinement task. 
Specifically, the "Add Node" form will be removed from the default right-hand details panel (which will be hidden entirely when no node is selected under R2/R3) and migrated to a clean, modal-based dialog. A new `+` button in the toolbar action bar will trigger this modal. Upon successful creation, the modal will close, the graph will reload, and the newly created node will be automatically selected (which will cause the details panel to slide open to show its details).

---

## 1. Codebase Analysis

### 1.1 `KnowledgeView.tsx` Analysis
1. **Toolbar Component** (Lines 716-735):
   Currently renders the `Upload`, `Download`, `Reload`, and `Purge` buttons in a container:
   ```tsx
   <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-0.5">
     <button onClick={triggerUpload} title="Upload" ...><Upload size={14} /></button>
     <button onClick={triggerDownload} title="Download" ...><Download size={14} /></button>
     <button onClick={loadGraph} title="Reload" ...><RefreshCw size={14} ... /></button>
     <button onClick={handlePurgeGraph} title="Purge" ...><Trash2 size={14} /></button>
   </div>
   ```
   *Action:* We need to insert a new `+` button inside this container to trigger `setIsAddModalOpen(true)`.

2. **Add Node Form & Right Details Panel** (Lines 750-820):
   Currently, the right panel is always rendered. When `selectedNode` is null and `selectedNodes.size` is < 2, the details panel renders the `// Add Node` title and the `<form onSubmit={handleAddNode}>` form.
   *Action:* 
   - Under R2/R3, the details panel container `div` should only render when `selectedNode !== null || selectedNodes.size >= 2`.
   - The fallback branch `<form onSubmit={handleAddNode}>` can be completely removed from the details panel.
   - The conditional render within the details panel simplifies to `selectedNodes.size >= 2 ? <MergeView /> : <DetailsView />` (where `selectedNode` is guaranteed to be present in the details view).

3. **Node Creation State & Handler** (Lines 43, 47-50, 574-591):
   - `isAddModalOpen` state is already declared: `const [isAddModalOpen, setIsAddModalOpen] = useState(false);`
   - `handleAddNode` currently resets title and content fields and reloads the graph, followed by selecting the created node:
     ```tsx
     if (res.ok) {
       const created = await res.json();
       setNewNodeTitle(""); setNewNodeContent("");
       await loadGraph();
       setSelectedNode(created);
     }
     ```
   *Action:* We must close the modal upon successful submission by adding `setIsAddModalOpen(false);`.

### 1.2 `KnowledgeView.test.tsx` Analysis
Currently, the test `'creates a new knowledge node and reloads the graph'` relies on the form being visible in the right panel by default:
```tsx
await screen.findByText('// Add Node')
const titleInput = screen.getByText('Node Title').parentElement?.querySelector('input') as HTMLInputElement
```
Since the details panel will now be hidden and the form will be inside a modal, this test will fail as `// Add Node` and the inputs will not be present in the document.
*Action:* We need to update this test to:
1. Locate and click the toolbar `+` (Add Node) button.
2. Verify that the modal opens (renders the `// Add Node` heading).
3. Query the form inputs inside the modal, simulate inputs, and click the `CREATE_NODE` button.
4. Verify that the modal is closed and that the details panel automatically opens (renders `// Node Details`) due to auto-selection of the new node.

---

## 2. Detailed Implementation Strategy

### 2.1 Component Changes (`KnowledgeView.tsx`)

#### Step 1: Add the Toolbar "+" Button
Insert the `Plus` icon button into the top action bar:
```tsx
<button
  onClick={() => setIsAddModalOpen(true)}
  title="Add Node"
  className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"
>
  <Plus size={14} />
</button>
```

#### Step 2: Extract Form to Modal
At the bottom of the return statement, alongside the connect modal, add the modal wrapper controlled by `isAddModalOpen`:
```tsx
{isAddModalOpen && (
  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
    <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 rounded shadow-2xl space-y-4">
      <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2">
        <h3 className="text-sm font-mono text-[var(--cp-cyan)] tracking-wider font-bold">// Add Node</h3>
        <button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button>
      </div>
      <form onSubmit={handleAddNode} className="space-y-4">
        <div>
          <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Title</label>
          <input
            type="text"
            required
            value={newNodeTitle}
            onChange={(e) => setNewNodeTitle(e.target.value)}
            className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Type</label>
          <select
            value={newNodeType}
            onChange={(e) => setNewNodeType(e.target.value)}
            className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs"
          >
            {["domain", "service", "library", "technology", "concept", "session"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Content</label>
          <textarea
            rows={4}
            value={newNodeContent}
            onChange={(e) => setNewNodeContent(e.target.value)}
            className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] resize-none font-mono text-xs"
          />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(false)}
            className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono text-foreground hover:bg-[var(--cp-bg-2)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmittingNode}
            className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            {isSubmittingNode ? "CREATING..." : "CREATE_NODE"}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
```

#### Step 3: Update `handleAddNode` Function
```tsx
const handleAddNode = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newNodeTitle.trim()) return;
  setIsSubmittingNode(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ title: newNodeTitle, node_type: newNodeType, content: newNodeContent, metadata: { workspaces: ["olympus"] } }),
    });
    if (res.ok) {
      const created = await res.json();
      setNewNodeTitle(""); 
      setNewNodeContent("");
      setIsAddModalOpen(false); // Close Modal on Success
      await loadGraph();
      setSelectedNode(created); // Auto-select created node
    } else {
      alert("Failed to create node");
    }
  } catch (e: any) { 
    alert(e.message); 
  } finally { 
    setIsSubmittingNode(false); 
  }
};
```

#### Step 4: Hide/Render Details Panel conditionally
```tsx
{(selectedNode || selectedNodes.size >= 2) && (
  <div className="w-80 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden" style={{ animation: "slideInRight 0.2s ease-out" }}>
    <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] px-4 py-3 items-center justify-between">
      <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--cp-cyan)]">
        {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : "// Node Details"}
      </span>
      <button onClick={() => { setSelectedNode(null); setSelectedNodes(new Map()); }} className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer">✕</button>
    </div>
    <div className="flex-1 p-4 overflow-y-auto">
      {selectedNodes.size >= 2 ? (
         // Merge panel (unchanged)
      ) : (
         // Node details panel (unchanged, but now selectedNode is guaranteed non-null here)
      )}
    </div>
    <div className="p-4 border-t border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
      <button onClick={handleDeleteSelected} disabled={!selectedNode} title="Delete" className="w-full py-2 border border-red-500/30 text-red-500 disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase hover:bg-red-950/20"><Trash2 size={14} />DELETE_NODE</button>
    </div>
  </div>
)}
```

---

## 3. Test Update Strategy

### 3.1 `KnowledgeView.test.tsx` Modifications
We modify the `'creates a new knowledge node and reloads the graph'` test block.

#### Before:
```tsx
  it('creates a new knowledge node and reloads the graph', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)

    await screen.findByText('// Add Node')
    const titleInput = screen.getByText('Node Title').parentElement?.querySelector('input') as HTMLInputElement
    const contentInput = screen.getByText('Content').parentElement?.querySelector('textarea') as HTMLTextAreaElement
    expect(titleInput).toBeTruthy()
    expect(contentInput).toBeTruthy()
    fireEvent.change(titleInput, { target: { value: 'New Insight' } })
    fireEvent.change(contentInput, { target: { value: 'New content' } })
    fireEvent.click(screen.getByRole('button', { name: /create_node/i }))

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith('http://savant.local/api/knowledge/nodes', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'sk-test', 'Content-Type': 'application/json' }),
      }))
    })
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/knowledge/graph'), expect.anything())
  })
```

#### After:
```tsx
  it('creates a new knowledge node and reloads the graph', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)

    // Click the "+" (Add Node) button in the toolbar
    const addButton = screen.getByTitle('Add Node')
    expect(addButton).toBeInTheDocument()
    fireEvent.click(addButton)

    // Verify modal has opened
    await screen.findByText('// Add Node')

    // Fill form elements inside the modal
    const titleInput = screen.getByText('Node Title').parentElement?.querySelector('input') as HTMLInputElement
    const contentInput = screen.getByText('Content').parentElement?.querySelector('textarea') as HTMLTextAreaElement
    expect(titleInput).toBeTruthy()
    expect(contentInput).toBeTruthy()
    fireEvent.change(titleInput, { target: { value: 'New Insight' } })
    fireEvent.change(contentInput, { target: { value: 'New content' } })
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /create_node/i }))

    // Verify creation API request is made
    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith('http://savant.local/api/knowledge/nodes', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'sk-test', 'Content-Type': 'application/json' }),
      }))
    })

    // Verify graph is refreshed and new node is auto-selected (details panel opens)
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/knowledge/graph'), expect.anything())
    await waitFor(() => expect(screen.getByText('// Node Details')).toBeInTheDocument())
  })
```

---

## 4. Proposed Source Code Patch File

We have created the precise changes as a unified diff format. These can be applied cleanly using git patch or standard replace tools when implementing.

### 4.1 Diff for `KnowledgeView.tsx`
```diff
--- src/renderer/components/tabs/KnowledgeView.tsx
+++ src/renderer/components/tabs/KnowledgeView.tsx
@@ -584,5 +584,6 @@
     if (res.ok) {
       const created = await res.json();
       setNewNodeTitle(""); setNewNodeContent("");
+      setIsAddModalOpen(false);
       await loadGraph();
       setSelectedNode(created);
@@ -717,5 +718,6 @@
         <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-0.5">
+          <button onClick={() => setIsAddModalOpen(true)} title="Add Node" className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"><Plus size={14} /></button>
           <button onClick={triggerUpload} title="Upload" className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"><Upload size={14} /></button>
           <button onClick={triggerDownload} title="Download" className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"><Download size={14} /></button>
           <button onClick={loadGraph} title="Reload" className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"><RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /></button>
           <button onClick={handlePurgeGraph} title="Purge" className="p-1 text-red-400 hover:text-red-300 transition-all cursor-pointer"><Trash2 size={14} /></button>
         </div>
@@ -750,23 +752,14 @@
-      <div className="w-80 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden" style={{ animation: "slideInRight 0.2s ease-out" }}>
-
-        <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] px-4 py-3 items-center justify-between">
-          <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--cp-cyan)]">
-            {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : selectedNode ? "// Node Details" : "// Add Node"}
-          </span>
-          {(selectedNode || selectedNodes.size > 0) && (
-            <button onClick={() => { setSelectedNode(null); setSelectedNodes(new Map()); }} className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer">✕</button>
-          )}
-        </div>
-        <div className="flex-1 p-4 overflow-y-auto">
-          {selectedNodes.size >= 2 ? (
+      {(selectedNode || selectedNodes.size >= 2) && (
+        <div className="w-80 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden" style={{ animation: "slideInRight 0.2s ease-out" }}>
+          <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] px-4 py-3 items-center justify-between">
+            <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--cp-cyan)]">
+              {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : "// Node Details"}
+            </span>
+            <button onClick={() => { setSelectedNode(null); setSelectedNodes(new Map()); }} className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer">✕</button>
+          </div>
+          <div className="flex-1 p-4 overflow-y-auto">
+            {selectedNodes.size >= 2 ? (
               // ... (keep merge details block as-is)
-          ) : selectedNode ? (
+            ) : (
               // ... (keep node details block as-is)
-          ) : (
-            <form onSubmit={handleAddNode} className="space-y-4">
-              <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Title</label><input type="text" required value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs" /></div>
-              <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Type</label><select value={newNodeType} onChange={(e) => setNewNodeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">{["domain", "service", "library", "technology", "concept", "session"].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
-              <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Content</label><textarea rows={4} value={newNodeContent} onChange={(e) => setNewNodeContent(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] resize-none font-mono text-xs" /></div>
-              <div className="pt-2"><button type="submit" disabled={isSubmittingNode} className="w-full py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"><Plus size={14} />{isSubmittingNode ? "CREATING..." : "CREATE_NODE"}</button></div>
-            </form>
-          )}
-        </div>
-        <div className="p-4 border-t border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
-          <button onClick={handleDeleteSelected} disabled={!selectedNode} title="Delete" className="w-full py-2 border border-red-500/30 text-red-500 disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase hover:bg-red-950/20"><Trash2 size={14} />DELETE_NODE</button>
-        </div>
-      </div>
+            )}
+          </div>
+          <div className="p-4 border-t border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
+            <button onClick={handleDeleteSelected} disabled={!selectedNode} title="Delete" className="w-full py-2 border border-red-500/30 text-red-500 disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase hover:bg-red-950/20"><Trash2 size={14} />DELETE_NODE</button>
+          </div>
+        </div>
+      )}
     </div>
+    {isAddModalOpen && (
+      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
+        <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 rounded shadow-2xl space-y-4">
+          <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2"><h3 className="text-sm font-mono text-[var(--cp-cyan)] tracking-wider font-bold">// Add Node</h3><button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button></div>
+          <form onSubmit={handleAddNode} className="space-y-4">
+            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Title</label><input type="text" required value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs" /></div>
+            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Type</label><select value={newNodeType} onChange={(e) => setNewNodeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">{["domain", "service", "library", "technology", "concept", "session"].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
+            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Content</label><textarea rows={4} value={newNodeContent} onChange={(e) => setNewNodeContent(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] resize-none font-mono text-xs" /></div>
+            <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono text-foreground hover:bg-[var(--cp-bg-2)]">Cancel</button><button type="submit" disabled={isSubmittingNode} className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"><Plus size={14} />{isSubmittingNode ? "CREATING..." : "CREATE_NODE"}</button></div>
+          </form>
+        </div>
+      </div>
+    )}
```
