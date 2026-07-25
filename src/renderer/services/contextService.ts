import { SavantHttpClient } from "./httpClient";

export interface ContextRepositoryInput {
  source: string;
  directory?: string;
  url?: string;
}

export class ContextService {
  private readonly client: SavantHttpClient;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.client = new SavantHttpClient(baseUrl, apiKey);
  }

  async listRepositories(): Promise<any[]> {
    const data = await this.client.request<any>("/api/context/repos");
    return data.repos || data || [];
  }

  async getIndexingStatus(): Promise<Record<string, any>> {
    const data = await this.client.request<any>("/api/context/repos/indexing-status");
    return data.status || data || {};
  }

  getRepositorySources(): Promise<any> {
    return this.client.request("/api/context/repos/sources");
  }

  addRepository(payload: ContextRepositoryInput): Promise<any> {
    return this.client.request("/api/context/repos", { method: "POST", body: payload });
  }

  refreshRepository(name: string): Promise<any> {
    return this.client.request(`/api/context/repos/${encodeURIComponent(name)}/refresh`, { method: "POST" });
  }

  startIndexing(name: string): Promise<any> {
    return this.client.request("/api/context/repos/index", { method: "POST", body: { name } });
  }

  stopIndexing(name: string): Promise<any> {
    return this.client.request("/api/context/repos/stop", { method: "POST", body: { name } });
  }

  cancelJob(jobId: string): Promise<any> {
    return this.client.request("/api/jobs/cancel", { method: "POST", body: { job_id: jobId } });
  }

  listJobs(status?: string): Promise<any> {
    const url = status ? `/api/jobs/list?status=${encodeURIComponent(status)}` : "/api/jobs/list";
    return this.client.request(url);
  }


  purgeRepository(name: string): Promise<any> {
    return this.client.request("/api/context/repos/purge", { method: "POST", body: { name } });
  }

  deleteRepository(name: string): Promise<any> {
    return this.client.request(`/api/context/repos/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  getStructuralHealth(repoId: string): Promise<any> {
    return this.client.request(`/api/context/code-intelligence/repos/${encodeURIComponent(repoId)}/health`);
  }

  syncCodeGraph(repoId: string): Promise<any> {
    return this.client.request(`/api/context/code-intelligence/repos/${encodeURIComponent(repoId)}/sync`, {
      method: "POST",
      body: { mode: "create_or_sync" },
    });
  }

  getGraphifyStats(repoId: string, workspaceId: string): Promise<any> {
    void workspaceId;
    return this.getStructuralHealth(repoId).then((health) => ({
      total: health.nodes || 0,
      total_edges: health.edges || 0,
      generated_at: health.indexed_at,
      stats: {},
      provider: health.provider,
      freshness: health.freshness,
    }));
  }

  importGraphify(repoId: string, workspaceId: string, graph: any, meta?: any): Promise<any> {
    return this.client.request("/api/graphify/import", {
      method: "POST",
      body: { repo_id: repoId, workspace_id: workspaceId, graph, ...(meta ? { meta } : {}) },
    });
  }

  async listAst(repoId: string, repoName: string): Promise<any[]> {
    const data = await this.client.request<any>(`/api/context/ast/list?repo_id=${encodeURIComponent(repoId)}&repo=${encodeURIComponent(repoName)}`);
    return data.nodes || [];
  }

  readCode(uri: string): Promise<any> {
    return this.client.request(`/api/context/code/read?uri=${encodeURIComponent(uri)}`);
  }

  async listMemoryResources(repo?: string): Promise<any[]> {
    const query = repo ? `?repo=${encodeURIComponent(repo)}` : "";
    const data = await this.client.request<any>(`/api/context/memory/list${query}`);
    return data.resources || data.banks || data || [];
  }

  async readMemoryResource(uri: string): Promise<string> {
    const data = await this.client.request<any>(`/api/context/memory/read?uri=${encodeURIComponent(uri)}`);
    return data.content || data.text || JSON.stringify(data, null, 2);
  }

  async listCodeFiles(repo: string): Promise<any[]> {
    const data = await this.client.request<any>(`/api/context/code/list?repo=${encodeURIComponent(repo)}`);
    return data.files || data || [];
  }

  async readCodeContent(uri: string): Promise<string> {
    const data = await this.readCode(uri);
    return data.content || data.text || JSON.stringify(data, null, 2);
  }

  async search(query: string, repo?: string): Promise<any[]> {
    const repoQuery = repo ? `&repo=${encodeURIComponent(repo)}` : "";
    const data = await this.client.request<any>(`/api/context/search?q=${encodeURIComponent(query)}${repoQuery}`);
    return data.results || data || [];
  }

  browseDirectory(path: string): Promise<any[]> {
    return this.client.request(`/api/context/repos/browse?path=${encodeURIComponent(path)}`);
  }

  getGraphifyMainEntities(repoId: string, workspaceId: string, limit = 100): Promise<any> {
    void workspaceId;
    const repo = encodeURIComponent(repoId);
    const normalizeNode = (symbol: any) => ({
      node_id: symbol.id,
      title: symbol.qualified_name || symbol.name,
      node_type: symbol.kind,
      content: symbol.docstring || symbol.signature || "",
      metadata: {
        ...(symbol.metadata || {}),
        language: symbol.language,
        path: symbol.location?.file_path,
        start_line: symbol.location?.start_line,
        end_line: symbol.location?.end_line,
      },
    });
    const normalizeEdge = (edge: any) => ({
      edge_id: `${edge.source_id}:${edge.kind}:${edge.target_id}`,
      source_id: edge.source_id,
      target_id: edge.target_id,
      edge_type: edge.kind,
      metadata: edge.metadata || {},
    });

    return this.client.request<any>(`/api/context/code-intelligence/repos/${repo}/symbols?limit=250`).then(async (listed) => {
      const items = listed.items || [];
      const preferred = items.filter((item: any) => ["class", "function", "method", "file"].includes(item.kind));
      const roots = (preferred.length ? preferred : items).slice(0, Math.min(24, limit));
      const graphs = await Promise.all(roots.map((root: any) =>
        this.client.request<any>(`/api/context/code-intelligence/repos/${repo}/subgraph`, {
          method: "POST",
          body: { roots: [{ id: root.id }], mode: "neighbors", depth: 1, limit },
        }).catch(() => ({ symbols: [root], edges: [] }))
      ));
      const nodeMap = new Map<string, any>();
      const edgeMap = new Map<string, any>();
      for (const root of roots) nodeMap.set(root.id, normalizeNode(root));
      for (const graph of graphs) {
        for (const symbol of graph.symbols || []) nodeMap.set(symbol.id, normalizeNode(symbol));
        for (const edge of graph.edges || []) {
          const normalized = normalizeEdge(edge);
          edgeMap.set(normalized.edge_id, normalized);
        }
      }
      return { nodes: [...nodeMap.values()].slice(0, limit), edges: [...edgeMap.values()] };
    });
  }

  getGraphifyNeighbors(repoId: string, workspaceId: string, nodeId: string): Promise<any> {
    void workspaceId;
    return this.client.request<any>(`/api/context/code-intelligence/repos/${encodeURIComponent(repoId)}/subgraph`, {
      method: "POST",
      body: { roots: [{ id: nodeId }], mode: "neighbors", depth: 1, limit: 150 },
    }).then((graph) => ({
      nodes: (graph.symbols || []).map((symbol: any) => ({
        node_id: symbol.id,
        title: symbol.qualified_name || symbol.name,
        node_type: symbol.kind,
        content: symbol.docstring || symbol.signature || "",
        metadata: { ...(symbol.metadata || {}), language: symbol.language, path: symbol.location?.file_path,
          start_line: symbol.location?.start_line, end_line: symbol.location?.end_line },
      })),
      edges: (graph.edges || []).map((edge: any) => ({
        edge_id: `${edge.source_id}:${edge.kind}:${edge.target_id}`,
        source_id: edge.source_id,
        target_id: edge.target_id,
        edge_type: edge.kind,
        metadata: edge.metadata || {},
      })),
    }));
  }

  searchGraphify(repoId: string, workspaceId: string, query: string, limit = 10): Promise<any[]> {
    void workspaceId;
    return this.client.request<any>(`/api/context/code-intelligence/repos/${encodeURIComponent(repoId)}/symbols?q=${encodeURIComponent(query)}&limit=${limit}`)
      .then((result) => (result.items || []).map((symbol: any) => ({
        node_id: symbol.id,
        title: symbol.qualified_name || symbol.name,
        node_type: symbol.kind,
        content: symbol.docstring || symbol.signature || "",
        metadata: { ...(symbol.metadata || {}), language: symbol.language, path: symbol.location?.file_path,
          start_line: symbol.location?.start_line, end_line: symbol.location?.end_line },
      })));
  }

  getPeriodicSyncStatus(): Promise<any> {
    return this.client.request("/api/context/repos/periodic-sync/status");
  }

  getPeriodicSyncLogs(repoName?: string, limit = 50): Promise<any> {
    const q = repoName ? `?repo_name=${encodeURIComponent(repoName)}&limit=${limit}` : `?limit=${limit}`;
    return this.client.request(`/api/context/repos/periodic-sync/logs${q}`);
  }

  triggerPeriodicSyncAll(): Promise<any> {
    return this.client.request("/api/context/repos/periodic-sync/run", { method: "POST" });
  }

  triggerPeriodicSyncProject(repoName: string): Promise<any> {
    return this.client.request("/api/context/repos/periodic-sync/run", {
      method: "POST",
      body: { name: repoName, repo_name: repoName, trigger: "manual", mode: "manual", manual: true }
    });
  }
}

export const createContextService = (baseUrl?: string, apiKey?: string) => new ContextService(baseUrl, apiKey);
