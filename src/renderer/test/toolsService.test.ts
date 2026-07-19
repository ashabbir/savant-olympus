import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolsService } from "../services/toolsService";

const jsonResponse = (payload: unknown) => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(payload) });

describe("ToolsService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("normalizes the registry response and executes tools", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ tools: [{ name: "search_context" }] }))
      .mockResolvedValueOnce(jsonResponse({ result: "found" }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ToolsService("http://localhost:8090/", "secret");

    await expect(service.listTools()).resolves.toEqual([{ name: "search_context" }]);
    await expect(service.runTool("search_context", { query: "Olympus" })).resolves.toEqual({ result: "found" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:8090/api/mcp/tools/run", expect.objectContaining({
      body: JSON.stringify({ name: "search_context", arguments: { query: "Olympus" } }),
    }));
  });

  it("encodes tool names for deletion and archive download", async () => {
    const archive = new Blob(["zip"]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ deleted: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(archive) });
    vi.stubGlobal("fetch", fetchMock);
    const service = new ToolsService("http://localhost:8090", "secret");

    await service.deleteTool("tool/name");
    await expect(service.downloadArchive("tool/name")).resolves.toBe(archive);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8090/api/tools/tool%2Fname",
      "http://localhost:8090/api/tools/tool%2Fname/archive",
    ]);
  });
});
