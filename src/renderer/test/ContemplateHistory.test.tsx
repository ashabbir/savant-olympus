import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContemplateHistory } from "@/components/tabs/knowledge/components/ContemplateHistory";
import type { KnowledgeService } from "@/services/knowledgeService";

const run = {
  id: 42, status: "success", trigger: "manual", started_at: "2026-10-10T12:00:00Z",
  nodes_promoted: 1, duplicates_merged: 10, nodes_expired: 0, edges_pruned: 2,
  report_available: true, details: { affected_node_count: 20, deferred_operations: 1, limit_reached: true },
};

describe("ContemplateHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads on open, paginates on the server, and explicitly refreshes", async () => {
    const getMaintenanceRuns = vi.fn().mockResolvedValueOnce({ runs: [run], total: 21, page: 1, page_size: 20 })
      .mockResolvedValue({ runs: [{ ...run, id: 1, report_available: false }], total: 21, page: 2, page_size: 20 });
    const service = { getMaintenanceRuns } as unknown as KnowledgeService;
    const close = vi.fn();
    render(<ContemplateHistory service={service} onClose={close} />);
    expect(await screen.findByText(/20\/20 merge\/delete nodes/)).toHaveTextContent("Limit reached");
    expect(getMaintenanceRuns).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Undo report unavailable")).toBeInTheDocument();
    expect(getMaintenanceRuns).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(getMaintenanceRuns).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("downloads the complete report and shows download errors", async () => {
    const report = { schema_version: 1, run_id: 42, changes: { kg_nodes: [{ before: { metadata: "raw" }, after: null }] } };
    const getMaintenanceReport = vi.fn().mockResolvedValueOnce(report).mockRejectedValueOnce(new Error("Report unavailable"));
    const createUrl = vi.fn().mockReturnValue("blob:report");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const service = {
      getMaintenanceRuns: vi.fn().mockResolvedValue({ runs: [run], total: 1, page: 1, page_size: 20 }),
      getMaintenanceReport,
    } as unknown as KnowledgeService;
    render(<ContemplateHistory service={service} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Download report" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(getMaintenanceReport).toHaveBeenCalledWith(42);
    expect(createUrl.mock.calls[0][0]).toBeInstanceOf(Blob);
    fireEvent.click(await screen.findByRole("button", { name: "Download report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Report unavailable");
  });

  it("shows history loading errors", async () => {
    const service = { getMaintenanceRuns: vi.fn().mockRejectedValue(new Error("Access denied")) } as unknown as KnowledgeService;
    render(<ContemplateHistory service={service} onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  });
});
