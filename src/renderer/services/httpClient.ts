export interface SavantRequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: HeadersInit;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function buildAuthHeaders(apiKey: string, contentType = "application/json"): Record<string, string> {
  const headers: Record<string, string> = { "X-App-Name": "savant-olympus" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

export class SavantHttpClient {
  readonly baseUrl: string;

  constructor(baseUrl: string, private readonly apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async request<T>(path: string, options: SavantRequestOptions = {}): Promise<T> {
    const hasBody = options.body !== undefined;
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...buildAuthHeaders(this.apiKey, hasBody ? "application/json" : ""),
        ...options.headers,
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let detail = response.statusText || `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        detail = payload.error || payload.message || detail;
      } catch {
        // The status text is the best available error detail.
      }
      throw new Error(detail);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
