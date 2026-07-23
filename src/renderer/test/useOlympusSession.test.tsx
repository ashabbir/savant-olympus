import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOlympusSession } from "../hooks/useOlympusSession";
import { runtimeService } from "../services/runtimeService";

describe("useOlympusSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(window.system.getSettings).mockResolvedValue({});
    vi.spyOn(runtimeService, "checkGateway").mockResolvedValue(true);
    vi.spyOn(runtimeService, "validateApiKey").mockResolvedValue({
      user_id: "user-1",
      name: "Olympus User",
      role: "admin",
    });
  });

  it("stops at login without probing the gateway when no credential exists", async () => {
    const { result } = renderHook(() => useOlympusSession());

    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(runtimeService.checkGateway).not.toHaveBeenCalled();
  });

  it("logs in through the selected server and exposes the derived runtime configuration", async () => {
    const { result } = renderHook(() => useOlympusSession());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(() => result.current.login(" sk-login ", "http://server.test"));
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(runtimeService.validateApiKey).toHaveBeenCalledWith("http://server.test", "sk-login");
    expect(result.current.runtime.serverUrl).toBe("http://server.test");
    expect(result.current.runtime.isAdmin).toBe(true);
  });
});
