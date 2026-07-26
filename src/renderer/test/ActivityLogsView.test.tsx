import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityLogsView, sortActivitiesNewestFirst } from "../components/tabs/ActivityLogsView";

const logs = [
  {
    id: 1, repo_name: "repo-x", operation: "periodic_refresh", trigger: "scheduled",
    actor_id: "system", source_app: "savant-server", status: "success",
    before_commit: "aaaa", after_commit: "bbbb", created_at: "2026-07-26T12:00:00Z",
    duration_ms: 200, files_changed: { added: ["new.ts"], modified: [], deleted: [] },
    change_stats: { files_total: 1, insertions: 5, deletions: 0 }, details: "Indexed",
  },
  {
    id: 2, repo_name: "repo-y", operation: "analysis", trigger: "user",
    status: "failed", created_at: "2026-07-26T13:00:00Z",
    files_changed: { added: [], modified: ["src/app.ts"], deleted: [] }, error: "failed",
  },
];

describe("ActivityLogsView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => url.includes("sync-logs") ? { logs } : { repos: [{ name: "repo-x" }, { name: "repo-y" }] },
    })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sorts without mutating the source list", () => {
    const source = [...logs];
    expect(sortActivitiesNewestFirst(source).map((item) => item.id)).toEqual([2, 1]);
    expect(source.map((item) => item.id)).toEqual([1, 2]);
  });

  it("shows all activities, applies filters, and opens a dismissible detail drawer", async () => {
    render(<ActivityLogsView serverUrl="http://server.test" apiKey="key" isAdmin />);
    await waitFor(() => expect(screen.getAllByText("repo-x").length).toBeGreaterThan(0));
    expect(screen.getAllByText("repo-y").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "6h" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: "repo-x" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("repo_name=repo-x"), expect.anything()
    ));

    fireEvent.click(screen.getAllByText("repo-x").at(-1)!);
    expect(screen.getByRole("dialog", { name: "Activity information" })).toBeInTheDocument();
    expect(screen.getByText("new.ts")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not load audit data for a non-admin", () => {
    render(<ActivityLogsView serverUrl="http://server.test" apiKey="key" isAdmin={false} />);
    expect(screen.getByText("Administrator access required.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
