import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

export interface SkillPayload {
  name: string;
  description?: string;
  files: Array<{ path: string; content: string }>;
}

const DEFAULT_SAVANT_SKILLS = new Set([
  "savant-session-workspace",
  "savant-knowledge-commit",
  "savant-code-analysis",
]);

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

  async createSkill(payload: SkillPayload): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/skills`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create skill: ${res.statusText}`);
    return res.json();
  }

  async updateSkill(skillId: string, updates: Partial<SkillPayload>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/skills/${skillId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update skill: ${res.statusText}`);
    return res.json();
  }

  async deleteSkill(skillId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/skills/${skillId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to delete skill: ${res.statusText}`);
    return res.json();
  }

  async listSkillFiles(skillId: string): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(skillId)}/files`, {
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to list skill files: ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data.files) ? data.files : [];
  }

  async getSkillFile(skillId: string, path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(skillId)}/file?path=${encodeURIComponent(path)}`, {
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to read skill file: ${res.statusText}`);
    const data = await res.json();
    return typeof data.content === "string" ? data.content : "";
  }

  async updateSkillFile(skillId: string, path: string, content: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/skills/${encodeURIComponent(skillId)}/file?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Failed to update skill file: ${res.statusText}`);
  }

  async installDefaultSkillsForPresentProviders(): Promise<void> {
    const listed = await this.listSkills();
    const defaults = listed.filter((skill) => DEFAULT_SAVANT_SKILLS.has(String(skill.id)));
    if (defaults.length === 0) return;

    const skills = await Promise.all(defaults.map(async (skill) => {
      const paths = await this.listSkillFiles(String(skill.id));
      const files = await Promise.all(paths.map(async (filePath) => ({
        path: filePath,
        content: await this.getSkillFile(String(skill.id), filePath),
      })));
      return { id: String(skill.id), files };
    }));
    await window.system.installDefaultSkills({ skills });
  }
}

export const createSkillsService = (baseUrl?: string, apiKey?: string) =>
  new SkillsService(baseUrl, apiKey);
