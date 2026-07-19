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
});
