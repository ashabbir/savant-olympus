import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

export interface WorkspacePayload {
  name: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  status?: "open" | "active" | "archived" | "closed";
  user_id?: string;
}

export interface TaskPayload {
  title: string;
  description?: string;
  workspace_id: string;
  status?: "todo" | "in-progress" | "review" | "done";
  priority?: "low" | "medium" | "high" | "critical";
  date?: string;
}

export class WorkspaceService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return buildAuthHeaders(this.apiKey);
  }

  async listWorkspaces(includeArchived = false): Promise<any[]> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces?include_archived=${includeArchived}`,
      { headers: buildAuthHeaders(this.apiKey, "") }
    );
    if (!res.ok) throw new Error(`Failed to list workspaces: ${res.statusText}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.workspaces || []);
  }

  async createWorkspace(payload: WorkspacePayload): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create workspace: ${res.statusText}`);
    return res.json();
  }

  async updateWorkspace(workspaceId: string, updates: Partial<WorkspacePayload>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update workspace: ${res.statusText}`);
    return res.json();
  }

  async deleteWorkspace(workspaceId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to delete workspace: ${res.statusText}`);
    return res.json();
  }

  async listTasks(workspaceId?: string): Promise<any[]> {
    const url = workspaceId
      ? `${this.baseUrl}/api/tasks?workspace_id=${workspaceId}`
      : `${this.baseUrl}/api/tasks`;
    const res = await fetch(url, { headers: buildAuthHeaders(this.apiKey, "") });
    if (!res.ok) throw new Error(`Failed to list tasks: ${res.statusText}`);
    return res.json();
  }

  async createTask(payload: TaskPayload): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/tasks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create task: ${res.statusText}`);
    return res.json();
  }

  async updateTask(taskId: string, updates: Partial<TaskPayload>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update task: ${res.statusText}`);
    return res.json();
  }

  async deleteTask(taskId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${taskId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to delete task: ${res.statusText}`);
    return res.json();
  }
}

export const createWorkspaceService = (baseUrl?: string, apiKey?: string) =>
  new WorkspaceService(baseUrl, apiKey);
