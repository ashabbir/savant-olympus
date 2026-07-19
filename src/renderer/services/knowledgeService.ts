import { SavantHttpClient } from "./httpClient";

export interface KGNodePayload {
  title: string;
  node_type: string;
  content?: string;
  metadata?: Record<string, any>;
  status?: string;
}

export interface KGEdgePayload {
  source_id: string;
  target_id: string;
  edge_type: string;
  label?: string;
  weight?: number;
}

export class KnowledgeService {
  private readonly client: SavantHttpClient;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.client = new SavantHttpClient(baseUrl, apiKey);
  }

  fetchGraph(includeStaged = true, slim = false, workspaceId?: string): Promise<{ nodes: any[]; edges: any[] }> {
    const workspace = workspaceId ? `&workspace_id=${encodeURIComponent(workspaceId)}` : "";
    return this.client.request(`/api/knowledge/graph?slim=${slim}&include_staged=${includeStaged}${workspace}&_=${Date.now()}`);
  }

  getNode(nodeId: string): Promise<any> {
    return this.client.request(`/api/knowledge/nodes/${encodeURIComponent(nodeId)}`);
  }

  createNode(payload: KGNodePayload): Promise<any> {
    return this.client.request("/api/knowledge/nodes", { method: "POST", body: payload });
  }

  updateNode(nodeId: string, updates: Partial<KGNodePayload>): Promise<any> {
    return this.client.request(`/api/knowledge/nodes/${encodeURIComponent(nodeId)}`, { method: "PUT", body: updates });
  }

  deleteNode(nodeId: string): Promise<void> {
    return this.client.request(`/api/knowledge/nodes/${encodeURIComponent(nodeId)}`, { method: "DELETE" });
  }

  mergeNodes(nodeIds: string[], nodeType?: string): Promise<any> {
    return this.client.request("/api/knowledge/nodes/merge", {
      method: "POST",
      body: { node_ids: nodeIds, ...(nodeType ? { node_type: nodeType } : {}) },
    });
  }

  bulkDeleteNodes(nodeIds: string[]): Promise<any> {
    return this.client.request("/api/knowledge/nodes/bulk-delete", { method: "POST", body: { node_ids: nodeIds } });
  }

  commitNodes(nodeIds: string[]): Promise<any> {
    return this.client.request("/api/knowledge/nodes/commit", { method: "POST", body: { node_ids: nodeIds } });
  }

  commitWorkspace(workspaceId: string): Promise<any> {
    return this.client.request("/api/knowledge/nodes/commit", { method: "POST", body: { workspace_id: workspaceId } });
  }

  createEdge(payload: KGEdgePayload): Promise<any> {
    return this.client.request("/api/knowledge/edges", { method: "POST", body: payload });
  }

  bulkConnect(sourceId: string, targetIds: string[], edgeType: string): Promise<any> {
    return this.client.request("/api/knowledge/edges/bulk", {
      method: "POST",
      body: { source_id: sourceId, target_ids: targetIds, edge_type: edgeType },
    });
  }

  deleteEdge(edgeId: string): Promise<void> {
    return this.client.request(`/api/knowledge/edges/${encodeURIComponent(edgeId)}`, { method: "DELETE" });
  }

  disconnectEdge(sourceId: string, targetId: string, edgeType: string): Promise<any> {
    return this.client.request("/api/knowledge/edges/disconnect", {
      method: "POST",
      body: { source_id: sourceId, target_id: targetId, edge_type: edgeType },
    });
  }

  previewWorkspacePurge(workspaceId: string): Promise<any> {
    return this.client.request("/api/knowledge/purge-workspace-preview", { method: "POST", body: { workspace_id: workspaceId } });
  }

  purgeWorkspace(workspaceId: string): Promise<any> {
    return this.client.request("/api/knowledge/purge-workspace", { method: "POST", body: { workspace_id: workspaceId } });
  }

  pruneWorkspace(workspaceId: string): Promise<any> {
    return this.client.request("/api/knowledge/prune", { method: "POST", body: { workspace_id: workspaceId } });
  }
}

export const createKnowledgeService = (baseUrl?: string, apiKey?: string) => new KnowledgeService(baseUrl, apiKey);
