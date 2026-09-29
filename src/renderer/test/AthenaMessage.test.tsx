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

  it("renders a collapsed Facts accordion with summary pills and per-MCP details", () => {
    const mcpMessage = {
      id: "message-2",
      sender: "assistant" as const,
      text: [
        '● search (MCP: savant-knowledge) · query: "ahmed"',
        "  └ [1,2,3]",
        "",
        '✗ list_jira_tickets (MCP: savant-workspace) · assignee: "ahmed"',
        "  └ workspace_id is required.",
        "",
        "Analysis completed.",
      ].join("\n"),
      timestamp: "2026-09-20T12:00:00.000Z",
    };

    render(<AthenaMessage message={mcpMessage} variant="standard" />);

    expect(screen.getByText(/Analysis completed\./)).toBeInTheDocument();
    expect(screen.queryByText(/workspace_id is required/)).not.toBeInTheDocument();
    expect(screen.getByText("2 MCP")).toBeInTheDocument();
    expect(screen.getByText("2 calls")).toBeInTheDocument();
    expect(screen.getByText("3 facts")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Facts/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("list_jira_tickets")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("list_jira_tickets")).toBeInTheDocument();
    expect(screen.getByText("ERR")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText("list_jira_tickets")).not.toBeInTheDocument();
  });
});
