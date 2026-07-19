import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

export interface UserPayload {
  user_id: string;
  username?: string;
  name: string;
  email?: string;
  role?: string;
  is_active?: boolean;
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
    return data.domains || [];
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
