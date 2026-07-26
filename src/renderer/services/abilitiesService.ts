import { buildAuthHeaders, SavantHttpClient } from "./httpClient";

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

  constructor(baseUrl = "http://127.0.0.1:8090", private readonly apiKey = "") {
    this.client = new SavantHttpClient(baseUrl, apiKey);
  }

  private async archiveError(response: Response): Promise<never> {
    let message = response.statusText || `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      // Status text is the best available detail.
    }
    throw new Error(message);
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
    const assets = await this.listAssets();
    return assets.persona || assets.personas || [];
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

  async exportArchive(format: "zip" | "tar"): Promise<{ blob: Blob; filename: string; count: number }> {
    const response = await fetch(`${this.client.baseUrl}/api/abilities/export?format=${format}`, {
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!response.ok) return this.archiveError(response);
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `savant-abilities.${format}`;
    return {
      blob: await response.blob(),
      filename,
      count: Number(response.headers.get("X-Abilities-Count") || 0),
    };
  }

  async importArchive(file: File): Promise<any> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${this.client.baseUrl}/api/abilities/import`, {
      method: "POST",
      headers: buildAuthHeaders(this.apiKey, ""),
      body: form,
    });
    if (!response.ok) return this.archiveError(response);
    return response.json();
  }
}

export const createAbilitiesService = (baseUrl?: string, apiKey?: string) =>
  new AbilitiesService(baseUrl, apiKey);
