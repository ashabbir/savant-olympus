# Handoff Report: Knowledge Graph R4 Design & Update

## 1. Observation
- **State Variable**: `isAddModalOpen` is already defined in `KnowledgeView.tsx:43`:
  ```tsx
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  ```
- **Toolbar Action Bar**: Located in `KnowledgeView.tsx:717-722`, currently containing Upload, Download, Reload, and Purge buttons:
  ```tsx
  <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-0.5">
    <button onClick={triggerUpload} title="Upload" ...
  ```
- **Node Creation Handler**: Located in `KnowledgeView.tsx:574-591`, where success triggers graph reload and auto-selection of the new node:
  ```tsx
  if (res.ok) {
    const created = await res.json();
    setNewNodeTitle(""); setNewNodeContent("");
    await loadGraph();
    setSelectedNode(created);
  }
  ```
- **Right details panel layout**: Rendered at `KnowledgeView.tsx:750-820` showing the "Add Node" form under a fallback else-branch (lines 808-815) when no node is selected.
- **Unit Test for Node Creation**: Located in `KnowledgeView.test.tsx:55-74`, which expects the `// Add Node` panel to be present upon rendering:
  ```tsx
  it('creates a new knowledge node and reloads the graph', async () => {
    render(<KnowledgeView serverUrl="http://savant.local" apiKey="sk-test" />)

    await screen.findByText('// Add Node')
  ```
- **Test Command and Baseline**: Running `npm test -- --run` runs 37 tests successfully. `test/KnowledgeView.test.tsx` passes with 3 tests.

---

## 2. Logic Chain
1. **Details Panel Layout Change**: Moving the "Add Node" form out of the details panel is required because the details panel will be hidden entirely when no node is selected (`selectedNode === null && selectedNodes.size < 2`). Keeping the form there is impossible under this constraint.
2. **Modal Integration**: Migrating the form to a modal controlled by `isAddModalOpen` is logical and follows the styling layout of the existing `isConnectModalOpen` link-creation modal (lines 822-834).
3. **Closing Modal**: The node creation handler `handleAddNode` must set `setIsAddModalOpen(false)` upon a successful POST request (`res.ok`) to close the modal automatically after saving.
4. **Triggering the Modal**: To allow the user to open the modal, we add a `+` button in the top action bar triggering `setIsAddModalOpen(true)`.
5. **Fixing the Unit Test**: The unit test `creates a new knowledge node and reloads the graph` will fail because `// Add Node` is no longer on screen by default. To fix this, the test must simulate a click on the new `+` button (with `title="Add Node"`) to open the modal before querying inputs or submitting.
6. **Validating Auto-Select**: We can assert that the details panel (displaying `// Node Details`) opens automatically on creation by checking for `screen.getByText('// Node Details')` after form submission.

---

## 3. Caveats
- **D3 Simulation**: Adding a new node re-runs the D3 simulation on state/ref change in the actual UI. The test mock does not simulate D3 layouts or actual SVG rendering details, only DOM text structures and fetch calls, which remains unchanged.
- **Merge View Interactions**: Clicking other nodes on the canvas while the modal is open is prevented by the modal's backdrop class `fixed inset-0 bg-black/70`.

---

## 4. Conclusion
The proposed R4 implementation strategy is clean, modular, and achieves complete parity with Olympus styling guidelines. By migrating the "Add Node" form to the modal, we allow the details panel to remain hidden when no nodes are selected. The unit test updates successfully adapt to the modal flow by triggering it via the toolbar `+` button.

---

## 5. Verification Method
1. **Unit Test Execution**:
   Verify implementation by running:
   ```bash
   npm test -- --run
   ```
   All tests, including `test/KnowledgeView.test.tsx`, must pass cleanly.
2. **Visual Verification (Code Review)**:
   Verify that:
   - `KnowledgeView.tsx` renders a modal with title `// Add Node` when `isAddModalOpen` is true.
   - The toolbar container includes `<button title="Add Node" ...><Plus ... /></button>`.
   - The details panel container has condition `{(selectedNode || selectedNodes.size >= 2) && ...}` so it hides when there is no selection.
