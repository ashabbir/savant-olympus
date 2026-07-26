import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeftSidebar } from "../components/LeftSidebar";

const props = {
  onSettingsChanged: vi.fn(),
  onLogout: vi.fn(),
  activeTab: "Workspace",
  onChangeTab: vi.fn(),
};

describe("LeftSidebar activity navigation", () => {
  it("shows the activity log icon only to administrators", () => {
    const { rerender } = render(<LeftSidebar {...props} isAdmin={false} />);
    expect(screen.queryByTitle("Activity Log")).not.toBeInTheDocument();

    rerender(<LeftSidebar {...props} isAdmin />);
    expect(screen.getByTitle("Activity Log")).toBeInTheDocument();
  });
});
