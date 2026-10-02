import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JobsView,
  formatJobDuration,
  statusColor,
  type JobRecord,
} from "../components/tabs/JobsView";

const mockJobs: JobRecord[] = [
  {
    id: "job-1111-aaaa",
    job_type: "index",
    target: "savant-core",
    status: "running",
    progress: 45,
    phase: "Embedding chunks",
    message: "Processed 450/1000 chunks",
    created_at: "2026-10-01T12:00:00Z",
    started_at: "2026-10-01T12:00:05Z",
    finished_at: null,
    result: { chunks: 450 },
  },
  {
    id: "job-2222-bbbb",
    job_type: "ast",
    target: "savant-app",
    status: "queued",
    progress: 0,
    phase: "Queued",
    message: "",
    created_at: "2026-10-01T12:05:00Z",
    started_at: null,
    finished_at: null,
  },
  {
    id: "job-3333-cccc",
    job_type: "codegraph_sync",
    target: "savant-olympus",
    status: "done",
    progress: 100,
    phase: "Complete",
    message: "CodeGraph sync finished",
    created_at: "2026-10-01T11:50:00Z",
    started_at: "2026-10-01T11:50:02Z",
    finished_at: "2026-10-01T11:51:30Z",
    result: { nodes_indexed: 1200 },
  },
  {
    id: "job-4444-dddd",
    job_type: "differential_sync",
    target: "savant-trader",
    status: "failed",
    progress: 30,
    phase: "Failed",
    message: "Git pull merge conflict in branch main",
    created_at: "2026-10-01T11:40:00Z",
    started_at: "2026-10-01T11:40:02Z",
    finished_at: "2026-10-01T11:40:20Z",
  },
];

describe("JobsView", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: any) => {
        if (url.includes("/api/jobs/cancel")) {
          return { ok: true, status: 200, json: async () => ({ cancelled: true }) };
        }
        if (url.includes("/api/jobs/") && options?.method === "DELETE") {
          return { ok: true, status: 200, json: async () => ({ deleted: true }) };
        }
        if (url.includes("/api/jobs/list")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              jobs: mockJobs,
              summary: {
                total: 4,
                running: 1,
                queued: 1,
                completed: 1,
                failed: 1,
              },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      })
    );
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats duration and colors correctly", () => {
    expect(formatJobDuration("2026-10-01T12:00:00Z", "2026-10-01T12:00:02.500Z")).toBe("2.5 s");
    expect(formatJobDuration("2026-10-01T12:00:00Z", "2026-10-01T12:02:15Z")).toBe("2m 15s");
    expect(statusColor("done")).toBe("#27f2a4");
    expect(statusColor("running")).toBe("#7dd3fc");
    expect(statusColor("queued")).toBe("#ffbd59");
    expect(statusColor("failed")).toBe("#ff4d78");
  });

  it("renders non-admin fallback message", () => {
    render(<JobsView serverUrl="http://server.test" apiKey="key" isAdmin={false} />);
    expect(screen.getByText(/Administrator access required/i)).toBeInTheDocument();
  });

  it("renders the jobs table with summary KPIs and allows filtering", async () => {
    render(<JobsView serverUrl="http://server.test" apiKey="key" isAdmin />);
    await waitFor(() => {
      expect(screen.getByText("savant-core")).toBeInTheDocument();
    });

    expect(screen.getByText("savant-olympus")).toBeInTheDocument();
    expect(screen.getByText("savant-app")).toBeInTheDocument();

    // Filter by type
    const typeSelect = screen.getByLabelText("Filter by Job Type");
    fireEvent.change(typeSelect, { target: { value: "index" } });
    expect(screen.getByText("savant-core")).toBeInTheDocument();
    expect(screen.queryByText("savant-olympus")).not.toBeInTheDocument();

    // Reset filter
    fireEvent.change(typeSelect, { target: { value: "all" } });
    expect(screen.getByText("savant-olympus")).toBeInTheDocument();
  });

  it("cancels an active job via API", async () => {
    render(<JobsView serverUrl="http://server.test" apiKey="key" isAdmin />);
    await waitFor(() => {
      expect(screen.getByText("savant-core")).toBeInTheDocument();
    });

    const cancelButtons = screen.getAllByTitle("Cancel Job");
    expect(cancelButtons.length).toBeGreaterThan(0);
    fireEvent.click(cancelButtons[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/jobs/cancel"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("opens job details drawer and displays metadata", async () => {
    render(<JobsView serverUrl="http://server.test" apiKey="key" isAdmin />);
    await waitFor(() => {
      expect(screen.getByText("savant-olympus")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("savant-olympus"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Job Details" })).toBeInTheDocument();
    });

    expect(screen.getByText(/nodes_indexed/)).toBeInTheDocument();

    // Close drawer
    fireEvent.click(screen.getByLabelText("Close job details"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Job Details" })).not.toBeInTheDocument();
    });
  });
});
