import { SavantHttpClient } from "./httpClient";

export interface AbilityPayload {
  name: string;
  description?: string;
  category?: string;
  schema?: Record<string, any>;
  enabled?: boolean;
}

export interface AbilityAssetPayload {
  id?: string;
  type?: string;
  name?: string;
  priority?: number;
  tags?: string[];
  includes?: string[];
  body?: string;
}

export class AbilitiesService {
  private client: SavantHttpClient;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.client = new SavantHttpClient(baseUrl, apiKey);
  }

  async listAbilities(): Promise<any[]> {
    return this.client.request<any[]>("/api/abilities");
  }

  async createAbility(payload: AbilityPayload): Promise<any> {
    return this.client.request<any>("/api/abilities", { method: "POST", body: payload });
  }

  async updateAbility(abilityId: string, updates: Partial<AbilityPayload>): Promise<any> {
    return this.client.request<any>(`/api/abilities/${encodeURIComponent(abilityId)}`, { method: "PUT", body: updates });
  }

  async deleteAbility(abilityId: string): Promise<any> {
    return this.client.request<any>(`/api/abilities/${encodeURIComponent(abilityId)}`, { method: "DELETE" });
  }

  async listPersonas(): Promise<any[]> {
    return this.client.request<any[]>("/api/abilities/personas");
  }

  listAssets(): Promise<Record<string, any[]>> {
    return this.client.request(`/api/abilities/assets?_=${Date.now()}`);
  }

  readAsset(assetId: string): Promise<any> {
    return this.client.request(`/api/abilities/assets/${encodeURIComponent(assetId)}`);
  }

  createAsset(payload: AbilityAssetPayload): Promise<any> {
    return this.client.request("/api/abilities/assets", { method: "POST", body: payload });
  }

  updateAsset(assetId: string, payload: AbilityAssetPayload): Promise<any> {
    return this.client.request(`/api/abilities/assets/${encodeURIComponent(assetId)}`, { method: "PUT", body: payload });
  }

  deleteAsset(assetId: string): Promise<void> {
    return this.client.request(`/api/abilities/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
  }

  resolve(payload: { persona: string; tags: string[]; repo_id?: string }): Promise<any> {
    return this.client.request("/api/abilities/resolve", { method: "POST", body: payload });
  }

  bootstrap(): Promise<any> {
    return this.client.request("/api/abilities/bootstrap", { method: "POST" });
  }

  validate(): Promise<{ ok: boolean; error?: string }> {
    return this.client.request("/api/abilities/validate");
  }
}

export const createAbilitiesService = (baseUrl?: string, apiKey?: string) =>
  new AbilitiesService(baseUrl, apiKey);
