import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AthenaMessage } from "../components/shared/AthenaMessage";

const assistantMessage = {
  id: "message-1",
  sender: "assistant" as const,
  text: "## Result\n\n- Reuse this component",
  timestamp: "2026-07-19T12:00:00.000Z",
};

describe("AthenaMessage", () => {
  it.each(["standard", "skill", "compact"] as const)("renders the %s presentation", (variant) => {
    render(<AthenaMessage message={assistantMessage} variant={variant} />);
    expect(screen.getByText(/Reuse this component/)).toBeInTheDocument();
  });

  it("provides shared copy and delete actions with accessible labels", () => {
    const onCopy = vi.fn();
    const onDelete = vi.fn();
    render(<AthenaMessage message={assistantMessage} onCopy={onCopy} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy message text" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete message" }));

    expect(onCopy).toHaveBeenCalledWith(assistantMessage.text);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("renders feature-specific actions through its action slot", () => {
    render(<AthenaMessage message={assistantMessage} actions={<button type="button">Export message</button>} />);
    expect(screen.getByRole("button", { name: "Export message" })).toBeInTheDocument();
  });

  it("renders MCP Activity banner, server badges, and supports trace collapse/expand", () => {
    const mcpMessage = {
      id: "message-2",
      sender: "assistant" as const,
      text: "Analysis completed.\n\n### Savant MCP Execution & Audit\n\n| MCP Server | Tool | When (UTC) | Why (Rationale) | How (Query / Params) | Result (Evidence) |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n| `savant-abilities` | `resolve_abilities` | 2026-09-20T12:00:00Z | Load rules | `persona=\"engineer\"` | engineer loaded |\n| `savant-knowledge` | `search` | 2026-09-20T12:00:00Z | Find nodes | `query=\"test\"` | 2 nodes |\n| `savant-context` | `research` | 2026-09-20T12:00:00Z | AST scan | `query=\"test\"` | 3 files |\n| `savant-workspace` | `list_tasks` | 2026-09-20T12:00:00Z | Sync tasks | `workspace_id=\"123\"` | 5 tasks |\n| `savant-reminders` | `list_reminders` | 2026-09-20T12:00:00Z | Check alerts | `status=\"active\"` | 1 alert |",
      timestamp: "2026-09-20T12:00:00.000Z",
    };

    render(<AthenaMessage message={mcpMessage} variant="standard" />);

    expect(screen.getByText(/Analysis completed\./)).toBeInTheDocument();
    expect(screen.getByText(/MCP Activity/)).toBeInTheDocument();
    expect(screen.getByText("abilities")).toBeInTheDocument();
    expect(screen.getByText("knowledge")).toBeInTheDocument();
    expect(screen.getByText("context")).toBeInTheDocument();
    expect(screen.getByText("workspace")).toBeInTheDocument();
    expect(screen.getByText("reminders")).toBeInTheDocument();

    // Trace is expanded by default
    expect(screen.getByText("Hide Trace")).toBeInTheDocument();
    expect(screen.getByText(/When \(UTC\)/)).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByTitle("Collapse MCP execution audit"));
    expect(screen.getByText("View Trace")).toBeInTheDocument();
    expect(screen.queryByText(/When \(UTC\)/)).not.toBeInTheDocument();

    // Click to expand again
    fireEvent.click(screen.getByTitle("Expand MCP execution audit"));
    expect(screen.getByText("Hide Trace")).toBeInTheDocument();
    expect(screen.getByText(/When \(UTC\)/)).toBeInTheDocument();
  });
});

