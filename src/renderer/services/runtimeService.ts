import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

const APP_HEADERS = { "X-App-Name": "savant-olympus" };

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 1_500): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export class RuntimeService {
  async checkHealth(baseUrl: string, healthPath: string, apiKey = "", timeoutMs = 4_000): Promise<boolean> {
    const response = await timedFetch(`${normalizeBaseUrl(baseUrl)}${healthPath}`, {
      headers: apiKey ? buildAuthHeaders(apiKey, "") : APP_HEADERS,
    }, timeoutMs);
    return response.ok;
  }

  checkGateway(gatewayUrl: string, timeoutMs = 1_500): Promise<boolean> {
    return this.checkHealth(gatewayUrl, "/health", "", timeoutMs);
  }

  checkSavant(serverUrl: string, timeoutMs = 1_500): Promise<boolean> {
    return this.checkHealth(serverUrl, "/health/ready", "", timeoutMs);
  }

  async validateApiKey(serverUrl: string, apiKey: string): Promise<any> {
    let response: Response;
    try {
      response = await timedFetch(`${normalizeBaseUrl(serverUrl)}/api/auth/validate`, {
        headers: buildAuthHeaders(apiKey, ""),
      }, 4_000);
    } catch {
      throw new Error("Cannot reach Savant server auth. Check that savant-server is running and allows X-API-Key CORS preflight.");
    }
    if (!response.ok) {
      throw new Error(response.status === 401 ? "Invalid Savant API key." : `Savant auth failed with ${response.status}.`);
    }
    return response.json();
  }

  async listGatewayRuns(gatewayUrl: string, timeoutMs = 1_500): Promise<any[]> {
    const response = await timedFetch(`${normalizeBaseUrl(gatewayUrl)}/runs`, { headers: APP_HEADERS }, timeoutMs);
    if (!response.ok) throw new Error(`Failed to list gateway runs (${response.status}).`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async getGatewayRunEvents(gatewayUrl: string, runId: string): Promise<any> {
    const response = await timedFetch(`${normalizeBaseUrl(gatewayUrl)}/runs/${encodeURIComponent(runId)}/events`, { headers: APP_HEADERS }, 4_000);
    if (!response.ok) throw new Error(`Failed to load run events (${response.status}).`);
    return response.json();
  }

  async cancelGatewayRun(gatewayUrl: string, runId: string): Promise<void> {
    const response = await timedFetch(`${normalizeBaseUrl(gatewayUrl)}/runs/${encodeURIComponent(runId)}`, {
      method: "DELETE",
      headers: APP_HEADERS,
    }, 4_000);
    if (!response.ok) throw new Error(`Failed to cancel run (${response.status}).`);
  }
}

export const runtimeService = new RuntimeService();
