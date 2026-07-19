import { buildAuthHeaders, normalizeBaseUrl, SavantHttpClient } from "./httpClient";

export interface ToolDefinition {
  name: string;
  description?: string;
  input_schema?: Record<string, any>;
  schema?: Record<string, any>;
  source?: string;
}

export class ToolsService {
  private readonly client: SavantHttpClient;
  private readonly baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:8090", private readonly apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.client = new SavantHttpClient(baseUrl, apiKey);
  }

  async listTools(): Promise<ToolDefinition[]> {
    const data = await this.client.request<any>(`/api/tools?_=${Date.now()}`);
    return Array.isArray(data.tools) ? data.tools : Array.isArray(data) ? data : [];
  }

  runTool(name: string, args: Record<string, string>): Promise<any> {
    return this.client.request("/api/mcp/tools/run", { method: "POST", body: { name, arguments: args } });
  }

  async createTool(tool: ToolDefinition): Promise<ToolDefinition> {
    const data = await this.client.request<any>("/api/tools", { method: "POST", body: tool });
    return data.tool || data;
  }

  deleteTool(name: string): Promise<any> {
    return this.client.request(`/api/tools/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  async downloadArchive(name: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/tools/${encodeURIComponent(name)}/archive`, {
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!response.ok) throw new Error(`Unable to download tool (${response.status}).`);
    return response.blob();
  }
}

export const createToolsService = (baseUrl?: string, apiKey?: string) => new ToolsService(baseUrl, apiKey);
