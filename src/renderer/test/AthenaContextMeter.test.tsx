import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AthenaContextMeter } from "../components/shared/AthenaContextMeter";

describe("AthenaContextMeter", () => {
  it("hides for empty chats and warns when the context window floods", async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({ "provider:chain": [{ provider: "claude", model: "opus", thinkingLevel: "high" }] });
    const { rerender, container } = render(<AthenaContextMeter sessionKey="t" messages={[]} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AthenaContextMeter sessionKey="t" messages={[{ sender: "user", text: "x".repeat(4 * 190_000) }]} />);
    expect(await screen.findByText(/Context flooding/)).toBeInTheDocument();
    expect(screen.getByTestId("athena-context-meter")).toHaveTextContent("/200k");
  });
});
