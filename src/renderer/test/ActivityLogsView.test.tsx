import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActivityLogsView, didGitHashChange, formatDuration, sortActivitiesNewestFirst,
} from "../components/tabs/ActivityLogsView";

const logs = [
  {
    id: 1, repo_name: "repo-x", operation: "periodic_refresh", trigger: "scheduled",
    actor_id: "system", source_app: "savant-server", status: "success",
    before_commit: "aaaa", after_commit: "bbbb", created_at: "2026-07-26T12:00:00Z",
    duration_ms: 200, files_changed: { added: ["new.ts"], modified: [], deleted: [] },
    change_stats: {
      files_total: 1, insertions: 5, deletions: 0, files_indexed: 12,
      files_skipped: 4, files_removed_from_index: 2, chunks_indexed: 30, index_errors: 1,
    }, details: "Indexed",
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

  it("detects Git hash changes and formats activity duration", () => {
    expect(didGitHashChange(logs[0])).toBe(true);
    expect(didGitHashChange(logs[1])).toBe(false);
    expect(formatDuration(850)).toBe("850 ms");
    expect(formatDuration(2500)).toBe("2.5 s");
    expect(formatDuration(125000)).toBe("2m 5s");
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
    fireEvent.change(screen.getByLabelText("Git hash change"), { target: { value: "changed" } });
    expect(screen.queryAllByText("repo-y")).toHaveLength(1);
    expect(screen.getByText("200 ms")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("repo-x").at(-1)!);
    expect(screen.getByRole("dialog", { name: "Activity information" })).toBeInTheDocument();
    expect(screen.getByText("new.ts")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Files removed from index")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not load audit data for a non-admin", () => {
    render(<ActivityLogsView serverUrl="http://server.test" apiKey="key" isAdmin={false} />);
    expect(screen.getByText("Administrator access required.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
