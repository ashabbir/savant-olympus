import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

export interface SkillPayload {
  name: string;
  description?: string;
  status?: "audited" | "unlocked" | "archived";
  files?: Record<string, string>;
}

export class SkillsService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return buildAuthHeaders(this.apiKey);
  }

  async listSkills(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/skills?_=${Date.now()}`, {
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to list skills: ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data.skills) ? data.skills : Array.isArray(data) ? data : [];
  }

  async saveSkills(skills: any[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/skills`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ skills }),
    });
    if (!res.ok) throw new Error(`Failed to save skills: ${res.statusText}`);
  }

  async createSkill(payload: SkillPayload): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/abilities/skills`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create skill: ${res.statusText}`);
    return res.json();
  }

  async updateSkill(skillId: string, updates: Partial<SkillPayload>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/abilities/skills/${skillId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update skill: ${res.statusText}`);
    return res.json();
  }

  async deleteSkill(skillId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/abilities/skills/${skillId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to delete skill: ${res.statusText}`);
    return res.json();
  }
}

export const createSkillsService = (baseUrl?: string, apiKey?: string) =>
  new SkillsService(baseUrl, apiKey);
