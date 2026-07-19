import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

export interface ReminderPayload {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  status?: "pending" | "completed" | "dismissed";
  start_date: string;
  due_date: string;
  remind_before_hrs?: number;
}

export class RemindersService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
  }

  private get headers(): Record<string, string> {
    return buildAuthHeaders(this.apiKey);
  }

  async listReminders(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/reminders`, {
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to list reminders: ${res.statusText}`);
    return res.json();
  }

  async createReminder(payload: ReminderPayload): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/reminders`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create reminder: ${res.statusText}`);
    return res.json();
  }

  async updateReminder(reminderId: string, updates: Partial<ReminderPayload>): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/reminders/${reminderId}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update reminder: ${res.statusText}`);
    return res.json();
  }

  async deleteReminder(reminderId: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/reminders/${reminderId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(this.apiKey, ""),
    });
    if (!res.ok) throw new Error(`Failed to delete reminder: ${res.statusText}`);
    return res.json();
  }
}

export const createRemindersService = (baseUrl?: string, apiKey?: string) =>
  new RemindersService(baseUrl, apiKey);
