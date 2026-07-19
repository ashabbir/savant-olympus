import { SavantHttpClient, normalizeBaseUrl } from "./httpClient";

export interface WorkspaceMcpHealth {
  online: boolean;
  port: number;
  raw: any;
}

export class WorkspaceMcpService {
  private readonly client: SavantHttpClient;
  private readonly baseUrl: string;

  constructor(baseUrl = "http://127.0.0.1:8090", private readonly apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.client = new SavantHttpClient(baseUrl, apiKey);
  }

  async getHealth(): Promise<WorkspaceMcpHealth> {
    const data = await this.client.request<any>("/api/mcp/health/workspace");
    return {
      online: Boolean(data && (data.ok || data.status === "ok" || data.alive)),
      port: Number(data?.port) || 8091,
      raw: data,
    };
  }

  async runTool(name: string, args: Record<string, any>, sessionId = "default", timeoutMs = 15_000): Promise<any> {
    let port = 8091;
    try {
      port = (await this.getHealth()).port;
    } catch (error) {
      console.error("Failed to query workspace MCP port, using 8091:", error);
    }

    const url = new URL(this.baseUrl);
    const origin = `${url.protocol}//${url.hostname}:${port}`;
    const sseUrl = `${origin}/sse?api_key=${encodeURIComponent(this.apiKey)}&session_id=${encodeURIComponent(sessionId)}`;

    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(sseUrl);
      const requestId = 1;
      const initializeId = 2;
      let messageUrl = "";
      const close = () => eventSource.close();
      const fail = (error: unknown) => {
        window.clearTimeout(timeout);
        close();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const post = async (payload: unknown) => {
        const response = await fetch(messageUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-App-Name": "savant-olympus" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Workspace MCP request failed (${response.status}).`);
      };
      const timeout = window.setTimeout(() => fail(new Error("Timeout waiting for MCP execution results")), timeoutMs);

      eventSource.addEventListener("endpoint", (event: MessageEvent) => {
        messageUrl = `${origin}${event.data}`;
        void post({
          jsonrpc: "2.0",
          id: initializeId,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "savant-olympus-client", version: "1.0.0" },
          },
        }).catch(fail);
      });

      eventSource.addEventListener("message", (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data);
          if (response.id === initializeId) {
            void post({ jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name, arguments: args } }).catch(fail);
          } else if (response.id === requestId) {
            window.clearTimeout(timeout);
            close();
            if (response.error) reject(new Error(response.error.message || JSON.stringify(response.error)));
            else resolve(response.result);
          }
        } catch (error) {
          console.error("Workspace MCP message parse failed:", error);
        }
      });

      eventSource.onerror = () => fail(new Error("SSE endpoint connection failed. Make sure savant-server is running."));
    });
  }
}

export const createWorkspaceMcpService = (baseUrl?: string, apiKey?: string) => new WorkspaceMcpService(baseUrl, apiKey);
