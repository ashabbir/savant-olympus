import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  KnowledgeAddModal,
  KnowledgeImportExportPanel,
} from "../components/tabs/knowledge/components/KnowledgeDialogs";

describe("knowledge presentation boundaries", () => {
  it("submits node fields through the add modal contract", () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <KnowledgeAddModal
        isOpen
        title="Node"
        nodeType="concept"
        content="Body"
        isSubmitting={false}
        nodeTypes={["concept", "service"]}
        onTitleChange={vi.fn()}
        onNodeTypeChange={vi.fn()}
        onContentChange={vi.fn()}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.submit(screen.getByRole("button", { name: /create_node/i }).closest("form")!);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("renders import counts and routes confirmation", () => {
    const onConfirm = vi.fn();
    render(
      <KnowledgeImportExportPanel
        pendingImport={{ newNodes: [{ node_id: "n1" }], newEdges: [], existingNodeCount: 2, existingEdgeCount: 3 }}
        importNodes
        importEdges={false}
        isLoading={false}
        onImportNodesChange={vi.fn()}
        onImportEdgesChange={vi.fn()}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText("2 existing nodes will be skipped.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ok, let's do this/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
