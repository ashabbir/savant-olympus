import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

export interface UserPayload {
  user_id: string;
  username?: string;
  name: string;
  email?: string;
  role?: string;
  is_active?: boolean;
}

export interface ToolUsage {
  mcp_server: string;
  tool_name: string;
  calls: number;
  active_days: number;
  avg_calls_per_active_day: number;
  last_called_at: string | null;
}

export interface UserUsage {
  user_id: string;
  days: number;
  last_login_at: string | null;
  total_calls: number;
  tools: ToolUsage[];
  daily: { day: string; mcp_server: string; tool_name: string; calls: number }[];
  logins_per_day: { day: string; logins: number }[];
  projects: {
    project_type: "repo" | "workspace";
    project: string;
    project_name: string;
    calls: number;
    active_days: number;
    last_used_at: string | null;
  }[];
  recent_queries: { mcp_server: string; tool_name: string; query: string; repo: string; created_at: string }[];
}

export interface UserContributions {
  user_id: string;
  node_count: number;
  committed_count: number;
  staged_count: number;
  latest_created_at: string | null;
  by_type: { node_type: string; node_count: number }[];
}

export class UsersService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return buildAuthHeaders(this.apiKey);
  }

  async validateApiKey(key?: string): Promise<any> {
    const activeKey = key || this.apiKey;
    const res = await fetch(`${this.baseUrl}/api/auth/validate`, {
      headers: buildAuthHeaders(activeKey, ""),
    });
    if (!res.ok) throw new Error(`API key validation failed: ${res.statusText}`);
    return res.json();
  }

  async listUsers(includeInactive = true): Promise<any[]> {
    const res = await fetch(
      `${this.baseUrl}/api/users?include_inactive=${includeInactive}`,
      { headers: this.headers }
    );
    if (!res.ok) throw new Error(`Failed to list users: ${res.statusText}`);
    return res.json();
  }

  async createUser(payload: UserPayload): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/users`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create user: ${res.statusText}`);
    return res.json();
  }

  async updateUser(userId: string, updates: Partial<UserPayload>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update user: ${res.statusText}`);
    return res.json();
  }

  async deleteUser(userId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to delete user: ${res.statusText}`);
    return res.status === 204 ? null : res.json();
  }

  async rotateApiKey(userId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}/api-key`, {
      method: "POST",
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`Failed to rotate API key: ${res.statusText}`);
    return res.json();
  }

  async listUserDomains(userId: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}/domains`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to list user domains: ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.domains || []);
  }

  async listAvailableDomains(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/knowledge/graph?node_type=domain&slim=true`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to list domains: ${res.statusText}`);
    const data = await res.json();
    return (data.nodes || []).filter((node: any) => node.node_type === "domain");
  }

  async assignDomain(userId: string, domainNodeId: string, canWrite = true): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}/domains`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ domain_node_id: domainNodeId, can_write: canWrite }),
    });
    if (!res.ok) throw new Error(`Failed to assign domain: ${res.statusText}`);
  }

  async getUserUsage(userId: string, days = 30): Promise<UserUsage> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}/usage?days=${days}`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to load user usage: ${res.statusText}`);
    return res.json();
  }

  async getUserContributions(userId: string): Promise<UserContributions> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}/contributions`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to load user contributions: ${res.statusText}`);
    return res.json();
  }

  async removeDomain(userId: string, domainNodeId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/users/${userId}/domains/${domainNodeId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to remove domain: ${res.statusText}`);
  }
}

export const createUsersService = (baseUrl?: string, apiKey?: string) =>
  new UsersService(baseUrl, apiKey);
