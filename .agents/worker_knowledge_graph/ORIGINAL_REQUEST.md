## 2026-06-15T02:36:31Z

You are a Worker (teamwork_preview_worker). Your task is to implement the Knowledge Graph refinements in Savant Olympus.
Please read:
- The requirements in /Users/home/code/project-x/savant-olympus/.agents/ORIGINAL_REQUEST.md (specifically the Follow-up section from 2026-06-15)
- The explorer reports:
  - /Users/home/code/project-x/savant-olympus/.agents/explorer_knowledge_graph_1/analysis.md
  - /Users/home/code/project-x/savant-olympus/.agents/explorer_knowledge_graph_1/changes.patch
  - /Users/home/code/project-x/savant-olympus/.agents/explorer_knowledge_graph_2/analysis.md
  - /Users/home/code/project-x/savant-olympus/.agents/explorer_knowledge_graph_3/analysis.md

Your implementation must fulfill:
1. R1: Domain Bubble & Canvas Visibility. SVG container background uses bg-[var(--cp-bg-1)] or bg-[var(--cp-bg-2)]. Domain bubble (D3 hulls) fill-opacity increased to 0.28, stroke-opacity increased to 0.85 or higher.
2. R2: Responsive Screen-Wide Canvas Layout. Right-hand details panel must be hidden entirely when no node is selected, allowing the graph container to span the full available width.
3. R3: Collapsible & Toggleable Node Details Panel. Add a collapse toggle button in the details panel header. When collapsed, panel hides. Add an expand toggle button (ArrowLeft) on the right edge of the graph container. If a new node is selected while collapsed, automatically expand it.
4. R4: Modal-Based Node Creation. Move the 'Add Node' form from the details panel into a clean dialog modal. Add a '+' button in the top action bar next to Upload/Download/Reload/Purge to trigger this modal. Creating a node via the modal must refresh the graph and auto-select the created node.
5. Verification: Update the tests in src/renderer/test/KnowledgeView.test.tsx. Update the existing 'creates a new knowledge node and reloads the graph' test (it must open the modal first by clicking the '+' button). Add tests for the collapse/expand toggle controls and selection auto-expansion. Run the test command `npm test -- --run` and verify everything passes cleanly.
