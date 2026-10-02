import { SavantHttpClient } from "./httpClient";

export interface AppVariableEffectiveInfo {
  key: string;
  is_set: boolean;
  source: "db" | "env" | "none";
  db_configured: boolean;
  env_configured: boolean;
}

export interface AppVariablesResponse {
  variables: Record<string, string>;
  effective: Record<string, AppVariableEffectiveInfo>;
}

export class AppVariablesService {
  private readonly client: SavantHttpClient;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.client = new SavantHttpClient(baseUrl, apiKey);
  }

  async list(raw = true): Promise<AppVariablesResponse> {
    return this.client.request<AppVariablesResponse>(`/api/app-variables${raw ? "?raw=true" : ""}`);
  }

  async get(key: string, raw = true): Promise<{ key: string; value: string; effective_info: AppVariableEffectiveInfo }> {
    return this.client.request(`/api/app-variables/${encodeURIComponent(key)}${raw ? "?raw=true" : ""}`);
  }

  async set(key: string, value: string): Promise<any> {
    return this.client.request("/api/app-variables", {
      method: "POST",
      body: { key, value },
    });
  }

  async setBatch(variables: Record<string, string>): Promise<any> {
    return this.client.request("/api/app-variables", {
      method: "POST",
      body: { variables },
    });
  }

  async delete(key: string): Promise<any> {
    return this.client.request(`/api/app-variables/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
  }
}

export const createAppVariablesService = (baseUrl?: string, apiKey?: string) =>
  new AppVariablesService(baseUrl, apiKey);
