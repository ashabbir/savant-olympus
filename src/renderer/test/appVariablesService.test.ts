import { afterEach, describe, expect, it, vi } from "vitest";
import { AppVariablesService } from "../services/appVariablesService";

const jsonResponse = (payload: unknown) => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(payload) });

describe("AppVariablesService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists variables and fetches single variable", async () => {
    const listPayload = {
      variables: { GITHUB_TOKEN: "ghp_123" },
      effective: {
        GITHUB_TOKEN: { key: "GITHUB_TOKEN", is_set: true, source: "db", db_configured: true, env_configured: false },
      },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(listPayload))
      .mockResolvedValueOnce(jsonResponse({ key: "GITHUB_TOKEN", value: "ghp_123" }));
    vi.stubGlobal("fetch", fetchMock);

    const service = new AppVariablesService("http://localhost:8090/", "test-key");

    await expect(service.list(true)).resolves.toEqual(listPayload);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8090/api/app-variables?raw=true", expect.anything());

    await expect(service.get("GITHUB_TOKEN", true)).resolves.toEqual({ key: "GITHUB_TOKEN", value: "ghp_123" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:8090/api/app-variables/GITHUB_TOKEN?raw=true", expect.anything());
  });

  it("sets, batch sets, and deletes variables", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "saved" }))
      .mockResolvedValueOnce(jsonResponse({ status: "saved", updated: { GITHUB_TOKEN: "val1" } }))
      .mockResolvedValueOnce(jsonResponse({ status: "deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    const service = new AppVariablesService("http://localhost:8090", "test-key");

    await service.set("GITHUB_TOKEN", "ghp_abc");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8090/api/app-variables", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ key: "GITHUB_TOKEN", value: "ghp_abc" }),
    }));

    await service.setBatch({ GITHUB_TOKEN: "val1" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:8090/api/app-variables", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ variables: { GITHUB_TOKEN: "val1" } }),
    }));

    await service.delete("GITHUB_TOKEN");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:8090/api/app-variables/GITHUB_TOKEN", expect.objectContaining({
      method: "DELETE",
    }));
  });
});
