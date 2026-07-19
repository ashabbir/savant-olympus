import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AthenaThreadStore, createScopedLocalAthenaThreadStore, useAthenaThread } from "../hooks/useAthenaThread";

interface TestMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
}

function createStore(initial: TestMessage[] = []) {
  const store: AthenaThreadStore<TestMessage> = {
    load: vi.fn().mockResolvedValue(initial),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return store;
}

describe("useAthenaThread", () => {
  it("loads the selected thread and persists message operations", async () => {
    const initial: TestMessage[] = [{ id: "one", sender: "user", text: "Hello" }];
    const store = createStore(initial);
    const { result } = renderHook(() => useAthenaThread({ threadId: "thread-a", store }));

    await waitFor(() => expect(result.current.isHistoryLoading).toBe(false));
    expect(result.current.messages).toEqual(initial);

    act(() => result.current.appendMessage({ id: "two", sender: "assistant", text: "Hi" }));
    expect(result.current.messages).toHaveLength(2);
    expect(store.save).toHaveBeenLastCalledWith("thread-a", expect.arrayContaining([expect.objectContaining({ id: "two" })]));

    act(() => result.current.removeMessage("one"));
    expect(result.current.messages.map((message) => message.id)).toEqual(["two"]);

    act(() => result.current.clearMessages());
    expect(result.current.messages).toEqual([]);
    expect(store.save).toHaveBeenLastCalledWith("thread-a", []);
  });

  it("reloads when the thread id changes", async () => {
    const store = createStore([]);
    const { result, rerender } = renderHook(
      ({ threadId }) => useAthenaThread({ threadId, store }),
      { initialProps: { threadId: "thread-a" } },
    );
    await waitFor(() => expect(result.current.isHistoryLoading).toBe(false));

    rerender({ threadId: "thread-b" });
    await waitFor(() => expect(store.load).toHaveBeenCalledWith("thread-b"));
  });

  it("isolates scoped local histories while migrating unscoped messages", async () => {
    localStorage.setItem("athena-history", JSON.stringify([
      { id: "legacy", sender: "user", text: "Legacy" },
      { id: "knowledge", sender: "assistant", text: "Other", scope: "knowledge" },
    ]));
    const store = createScopedLocalAthenaThreadStore<TestMessage>("athena-history", "skills");

    await expect(store.load("skills")).resolves.toEqual([
      { id: "legacy", sender: "user", text: "Legacy" },
    ]);
    await store.save("skills", [{ id: "new", sender: "assistant", text: "New" }]);

    expect(JSON.parse(localStorage.getItem("athena-history") || "[]")).toEqual([
      { id: "knowledge", sender: "assistant", text: "Other", scope: "knowledge" },
      { id: "new", sender: "assistant", text: "New", scope: "skills" },
    ]);
  });
});
