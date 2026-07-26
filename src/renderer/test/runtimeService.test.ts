import { afterEach, describe, expect, it, vi } from "vitest";
import { isAbortError, RuntimeService } from "../services/runtimeService";

describe("RuntimeService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("checks service health and sends API keys only when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const service = new RuntimeService();

    await expect(service.checkHealth("http://localhost:8090/", "/health/ready", "secret")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8090/health/ready", expect.objectContaining({
      headers: expect.objectContaining({ "X-API-Key": "secret", "X-App-Name": "savant-olympus" }),
      signal: expect.any(AbortSignal),
    }));
  });

  it("validates authentication and preserves user-facing failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ user: { role: "admin" } }) })
      .mockResolvedValueOnce({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);
    const service = new RuntimeService();

    await expect(service.validateApiKey("http://localhost:8090", "valid")).resolves.toEqual({ user: { role: "admin" } });
    await expect(service.validateApiKey("http://localhost:8090", "invalid")).rejects.toThrow("Invalid Savant API key");
  });

  it("owns gateway run listing, event retrieval, and cancellation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue([{ id: "run/1" }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue([{ type: "done" }]) })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    const service = new RuntimeService();

    await expect(service.listGatewayRuns("http://localhost:3100/")).resolves.toEqual([{ id: "run/1" }]);
    await expect(service.getGatewayRunEvents("http://localhost:3100", "run/1")).resolves.toEqual([{ type: "done" }]);
    await service.cancelGatewayRun("http://localhost:3100", "run/1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3100/runs",
      "http://localhost:3100/runs/run%2F1/events",
      "http://localhost:3100/runs/run%2F1",
    ]);
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({ method: "DELETE" }));
  });

  it("identifies expected request timeout aborts", () => {
    expect(isAbortError(new DOMException("signal is aborted without reason", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("gateway unavailable"))).toBe(false);
  });
});
