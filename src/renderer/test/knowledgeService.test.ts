import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeService } from "../services/knowledgeService";

const response = (payload: unknown = {}) => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(payload) });

describe("KnowledgeService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("owns graph and encoded node detail retrieval", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ nodes: [], edges: [] }))
      .mockResolvedValueOnce(response({ node_id: "node/id" }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new KnowledgeService("http://localhost:8090/", "secret");

    await service.fetchGraph(true, true, "olympus");
    await service.getNode("node/id");

    expect(fetchMock.mock.calls[0][0]).toContain("/api/knowledge/graph?slim=true&include_staged=true&workspace_id=olympus");
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:8090/api/knowledge/nodes/node%2Fid");
  });

  it("delegates bulk node and edge operations with canonical payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new KnowledgeService("http://localhost:8090", "secret");

    await service.mergeNodes(["one", "two"], "insight");
    await service.bulkConnect("one", ["two"], "depends_on");
    await service.commitNodes(["one"]);
    await service.disconnectEdge("one", "two", "depends_on");

    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:8090/api/knowledge/nodes/merge", expect.objectContaining({ body: JSON.stringify({ node_ids: ["one", "two"], node_type: "insight" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "http://localhost:8090/api/knowledge/edges/bulk", expect.objectContaining({ body: JSON.stringify({ source_id: "one", target_ids: ["two"], edge_type: "depends_on" }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "http://localhost:8090/api/knowledge/nodes/commit", expect.objectContaining({ body: JSON.stringify({ node_ids: ["one"] }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "http://localhost:8090/api/knowledge/edges/disconnect", expect.objectContaining({ body: JSON.stringify({ source_id: "one", target_id: "two", edge_type: "depends_on" }) }));
  });

  it("owns the workspace purge lifecycle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ to_delete: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new KnowledgeService("http://localhost:8090", "secret");

    await service.previewWorkspacePurge("olympus");
    await service.purgeWorkspace("olympus");
    await service.pruneWorkspace("olympus");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:8090/api/knowledge/purge-workspace-preview",
      "http://localhost:8090/api/knowledge/purge-workspace",
      "http://localhost:8090/api/knowledge/prune",
    ]);
  });
});
