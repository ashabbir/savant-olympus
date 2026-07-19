import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthHeaders, normalizeBaseUrl, SavantHttpClient } from "../services/httpClient";

describe("SavantHttpClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("normalizes URLs and builds the shared Olympus auth contract", () => {
    expect(normalizeBaseUrl("http://localhost:8090///")).toBe("http://localhost:8090");
    expect(buildAuthHeaders("key", "")).toEqual({
      "X-App-Name": "savant-olympus",
      "X-API-Key": "key",
    });
  });

  it("serializes request bodies and returns JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ saved: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new SavantHttpClient("http://localhost:8090/", "secret");
    await expect(client.request("/api/example", { method: "POST", body: { value: 1 } })).resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8090/api/example", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ value: 1 }),
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "X-API-Key": "secret",
        "X-App-Name": "savant-olympus",
      }),
    }));
  });

  it("surfaces backend error details and supports empty responses", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: vi.fn().mockResolvedValue({ error: "Invalid asset" }),
      })
      .mockResolvedValueOnce({ ok: true, status: 204 }));

    const client = new SavantHttpClient("http://localhost:8090", "secret");
    await expect(client.request("/bad")).rejects.toThrow("Invalid asset");
    await expect(client.request("/empty", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
