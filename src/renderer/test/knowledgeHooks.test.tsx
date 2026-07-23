import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useKnowledgeEventSubscriptions,
  useKnowledgeKeyboardShortcuts,
} from "../components/tabs/knowledge/hooks/useKnowledgeSubscriptions";
import { reportKnowledgeError } from "../components/tabs/knowledge/utils/errors";
import { useKnowledgeGraphActions } from "../components/tabs/knowledge/hooks/useKnowledgeGraphActions";

describe("knowledge side-effect boundaries", () => {
  it("routes keyboard shortcuts and ignores editable targets", () => {
    const actions = {
      fitToGraph: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      clearExploreMode: vi.fn(),
    };
    renderHook(() => useKnowledgeKeyboardShortcuts(actions));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "-" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(actions.fitToGraph).toHaveBeenCalledOnce();
    expect(actions.zoomIn).toHaveBeenCalledOnce();
    expect(actions.zoomOut).toHaveBeenCalledOnce();
    expect(actions.clearExploreMode).toHaveBeenCalledOnce();

    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true })));
    expect(actions.fitToGraph).toHaveBeenCalledOnce();
    input.remove();
  });

  it("maps application events to graph actions and removes listeners on unmount", () => {
    const actions = {
      reload: vi.fn(),
      openAddNode: vi.fn(),
      commitAll: vi.fn(),
      purge: vi.fn(),
      upload: vi.fn(),
      download: vi.fn(),
      openChatHistory: vi.fn(),
    };
    const { unmount } = renderHook(() => useKnowledgeEventSubscriptions(actions));

    act(() => {
      window.dispatchEvent(new Event("knowledge-reload"));
      window.dispatchEvent(new Event("knowledge-add-node"));
      window.dispatchEvent(new Event("knowledge-download"));
    });
    expect(actions.reload).toHaveBeenCalledOnce();
    expect(actions.openAddNode).toHaveBeenCalledOnce();
    expect(actions.download).toHaveBeenCalledOnce();

    unmount();
    act(() => window.dispatchEvent(new Event("knowledge-reload")));
    expect(actions.reload).toHaveBeenCalledOnce();
  });

  it("reports action context with normalized errors", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(reportKnowledgeError("purge workspace", new Error("offline"))).toBe("offline");
    expect(consoleError).toHaveBeenCalledWith(
      "[KnowledgeView] purge workspace failed:",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("runs graph actions through one loading and error lifecycle", async () => {
    const setLoading = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useKnowledgeGraphActions(setLoading));

    await act(() => result.current.runGraphAction(
      "prune graph",
      async () => {
        throw new Error("offline");
      },
      onError,
    ));

    expect(setLoading.mock.calls).toEqual([[true], [false]]);
    expect(onError).toHaveBeenCalledWith("offline");
  });
});
