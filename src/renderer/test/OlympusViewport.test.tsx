import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OlympusViewport } from "../components/OlympusViewport";

const baseProps = {
  serverUrl: "http://server.test",
  apiKey: "sk-test",
  activeModel: { provider: "codex", model: "gpt-5" },
  isAdmin: false,
  activeUserId: "user-1",
  selectedProject: null,
  onSelectProject: vi.fn(),
  onSettingsChanged: vi.fn(),
};

describe("OlympusViewport", () => {
  it("routes a known tab to its feature view", () => {
    render(<OlympusViewport {...baseProps} activeTab="Reminders" />);
    expect(screen.getByText(/SYSTEM REMINDERS/i)).toBeInTheDocument();
  });

  it("falls back to Workspace and refuses the admin-only Users view", () => {
    render(<OlympusViewport {...baseProps} activeTab="Users" />);
    expect(screen.getByText(/SAVANT-WORKSPACE/i)).toBeInTheDocument();
  });
});
