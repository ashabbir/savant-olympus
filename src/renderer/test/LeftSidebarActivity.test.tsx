import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeftSidebar } from "../components/LeftSidebar";

const props = {
  onSettingsChanged: vi.fn(),
  onLogout: vi.fn(),
  activeTab: "Workspace",
  onChangeTab: vi.fn(),
};

describe("LeftSidebar jobs navigation", () => {
  it("shows the jobs icon only to administrators and consolidates activity into jobs", () => {
    const { rerender } = render(<LeftSidebar {...props} isAdmin={false} />);
    expect(screen.queryByTitle("Jobs")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Activity Log")).not.toBeInTheDocument();

    rerender(<LeftSidebar {...props} isAdmin />);
    expect(screen.getByTitle("Jobs")).toBeInTheDocument();
    expect(screen.queryByTitle("Activity Log")).not.toBeInTheDocument();
  });
});
