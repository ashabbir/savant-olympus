import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextService } from "../services/contextService";

function jsonResponse(payload: unknown) {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(payload) };
}

describe("ContextService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("normalizes repository and status response envelopes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ repos: [{ name: "olympus" }] }))
      .mockResolvedValueOnce(jsonResponse({ status: { olympus: { status: "ready" } } }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ContextService("http://localhost:8090/", "secret");

    await expect(service.listRepositories()).resolves.toEqual([{ name: "olympus" }]);
    await expect(service.getIndexingStatus()).resolves.toEqual({ olympus: { status: "ready" } });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8090/api/context/repos", expect.any(Object));
  });

  it("encodes repository identifiers and delegates lifecycle operations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ queued: true }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ContextService("http://localhost:8090", "secret");

    await service.refreshRepository("repo with spaces");
    await service.syncCodeGraph("repo/id");
    await service.startIndexing("olympus");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8090/api/context/repos/repo%20with%20spaces/refresh", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:8090/api/context/code-intelligence/repos/repo%2Fid/sync", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ mode: "create_or_sync" }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:8090/api/context/repos/index", expect.objectContaining({
      body: JSON.stringify({ name: "olympus" }),
    }));
  });

  it("owns Graphify import and AST/code retrieval contracts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ nodes_imported: 2 }))
      .mockResolvedValueOnce(jsonResponse({ nodes: [{ path: "src/App.tsx" }] }))
      .mockResolvedValueOnce(jsonResponse({ language: "typescript", content: "export {}" }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ContextService("http://localhost:8090", "secret");

    await service.importGraphify("repo-1", "olympus", { nodes: [] }, { version: 1 });
    await expect(service.listAst("repo-1", "olympus")).resolves.toEqual([{ path: "src/App.tsx" }]);
    await expect(service.readCode("olympus:src/App.tsx")).resolves.toEqual({ language: "typescript", content: "export {}" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8090/api/graphify/import", expect.objectContaining({
      body: JSON.stringify({ repo_id: "repo-1", workspace_id: "olympus", graph: { nodes: [] }, meta: { version: 1 } }),
    }));
  });

  it("owns shell context browsing and CodeGraph exploration", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ resources: [{ uri: "memory://one" }] }))
      .mockResolvedValueOnce(jsonResponse([{ path: "repo" }]))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "main", name: "main", kind: "function", location: { file_path: "a.ts" } }] }))
      .mockResolvedValueOnce(jsonResponse({ symbols: [{ id: "main", name: "main", kind: "function", location: { file_path: "a.ts" } }], edges: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "match", name: "match", kind: "class", location: { file_path: "b.ts" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new ContextService("http://localhost:8090", "secret");

    await expect(service.listMemoryResources("repo/name")).resolves.toEqual([{ uri: "memory://one" }]);
    await expect(service.browseDirectory("code folder")).resolves.toEqual([{ path: "repo" }]);
    await service.getGraphifyMainEntities("repo/id", "workspace", 20);
    await service.searchGraphify("repo/id", "workspace", "main entity", 5);

    expect(fetchMock.mock.calls[0][0]).toContain("repo=repo%2Fname");
    expect(fetchMock.mock.calls[1][0]).toContain("path=code%20folder");
    expect(fetchMock.mock.calls[2][0]).toContain("/api/context/code-intelligence/repos/repo%2Fid/symbols?limit=250");
    expect(fetchMock.mock.calls[3][0]).toContain("/api/context/code-intelligence/repos/repo%2Fid/subgraph");
    expect(fetchMock.mock.calls[3][1].body).toBe(JSON.stringify({ roots: [{ id: "main" }], mode: "neighbors", depth: 1, limit: 20 }));
    expect(fetchMock.mock.calls[4][0]).toContain("/api/context/code-intelligence/repos/repo%2Fid/symbols?q=main%20entity&limit=5");
  });
});
