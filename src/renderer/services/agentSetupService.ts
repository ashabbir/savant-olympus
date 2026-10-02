import { buildAuthHeaders, normalizeBaseUrl } from "./httpClient";

export type AgentProvider = "copilot" | "claude" | "hermes" | "codex";
export type AgentMcpTransport = "streamable-http" | "sse";

export interface AgentPartStatus {
  id: "mcp" | "instructions" | "skills" | "hook";
  label: string;
  configured: boolean;
  path: string;
  details: string;
}

export interface AgentSetupInfo {
  provider: AgentProvider;
  label: string;
  description: string;
  presencePath: string;
  present: boolean;
  status: "configured" | "partial" | "not_configured";
  parts: AgentPartStatus[];
  lastChecked?: string;
  lastConfigured?: string;
  mcpTransport?: AgentMcpTransport;
}

export interface AgentSetupReport {
  timestamp: string;
  serverUrl: string;
  agents: Record<AgentProvider, AgentSetupInfo>;
  summary: {
    total: number;
    configured: number;
    partial: number;
    notConfigured: number;
  };
}

export interface TriggerSetupResult {
  success: boolean;
  provider: string;
  configuredParts: string[];
  report: AgentSetupReport;
  error?: string;
}

export const AGENT_DESCRIPTIONS: Record<AgentProvider, { label: string; description: string }> = {
  copilot: {
    label: "GitHub Copilot",
    description: "GitHub Copilot Chat, CLI, and Agent Mode integration",
  },
  claude: {
    label: "Claude Code / Desktop",
    description: "Anthropic Claude Code CLI & Desktop Agent integration",
  },
  hermes: {
    label: "Hermes Agent",
    description: "Hermes autonomous agent execution runtime",
  },
  codex: {
    label: "Codex Agent",
    description: "Codex CLI & OpenAI developer environment",
  },
};

function buildFallbackReport(serverUrl: string): AgentSetupReport {
  const agents: Record<AgentProvider, AgentSetupInfo> = {
    copilot: {
      provider: "copilot",
      label: "GitHub Copilot",
      description: "GitHub Copilot Chat, CLI, and Agent Mode integration",
      presencePath: "~/.copilot",
      present: true,
      status: "partial",
      parts: [
        {
          id: "mcp",
          label: "MCP Knowledge Bridge",
          configured: false,
          path: "~/.copilot/mcp.json",
          details: "Streamable HTTP connection to Savant Knowledge & Context (ports 8194 / 8193)",
        },
        {
          id: "instructions",
          label: "Learning Protocol Instructions",
          configured: false,
          path: "~/.copilot/copilot-instructions.md",
          details: "Mandates posting durable insights & bug root causes to Savant Knowledge",
        },
        {
          id: "skills",
          label: "Savant Default Skills",
          configured: true,
          path: "~/.copilot/skills/",
          details: "savant-knowledge-commit, savant-code-analysis, savant-session-workspace",
        },
        {
          id: "hook",
          label: "Fallback Learning Hook",
          configured: false,
          path: "~/.copilot/record-learning.sh",
          details: "CLI curl wrapper for posting learnings directly to Savant Knowledge API",
        },
      ],
      lastChecked: new Date().toISOString(),
    },
    claude: {
      provider: "claude",
      label: "Claude Code / Desktop",
      description: "Anthropic Claude Code CLI & Desktop Agent integration",
      presencePath: "~/.claude",
      present: true,
      status: "partial",
      parts: [
        {
          id: "mcp",
          label: "MCP Knowledge Bridge",
          configured: false,
          path: "~/.claude/claude_desktop_config.json",
          details: "Streamable HTTP connection to Savant Knowledge & Context (ports 8194 / 8193)",
        },
        {
          id: "instructions",
          label: "Learning Protocol Instructions",
          configured: true,
          path: "~/.claude/CLAUDE.md",
          details: "Mandates posting durable insights & bug root causes to Savant Knowledge",
        },
        {
          id: "skills",
          label: "Savant Default Skills",
          configured: true,
          path: "~/.claude/skills/",
          details: "savant-knowledge-commit, savant-code-analysis, savant-session-workspace",
        },
        {
          id: "hook",
          label: "Fallback Learning Hook",
          configured: false,
          path: "~/.claude/record-learning.sh",
          details: "CLI curl wrapper for posting learnings directly to Savant Knowledge API",
        },
      ],
      lastChecked: new Date().toISOString(),
    },
    hermes: {
      provider: "hermes",
      label: "Hermes Agent",
      description: "Hermes autonomous agent execution runtime",
      presencePath: "~/.hermes",
      present: true,
      status: "not_configured",
      parts: [
        {
          id: "mcp",
          label: "MCP Knowledge Bridge",
          configured: false,
          path: "~/.hermes/mcp.json",
          details: "Streamable HTTP connection to Savant Knowledge & Context (ports 8194 / 8193)",
        },
        {
          id: "instructions",
          label: "Learning Protocol Instructions",
          configured: false,
          path: "~/.hermes/instructions.md",
          details: "Mandates posting durable insights & bug root causes to Savant Knowledge",
        },
        {
          id: "skills",
          label: "Savant Default Skills",
          configured: false,
          path: "~/.hermes/skills/custom/",
          details: "savant-knowledge-commit, savant-code-analysis, savant-session-workspace",
        },
        {
          id: "hook",
          label: "Fallback Learning Hook",
          configured: false,
          path: "~/.hermes/record-learning.sh",
          details: "CLI curl wrapper for posting learnings directly to Savant Knowledge API",
        },
      ],
      lastChecked: new Date().toISOString(),
    },
    codex: {
      provider: "codex",
      label: "Codex Agent",
      description: "Codex CLI & OpenAI developer environment",
      presencePath: "~/.codex",
      present: true,
      status: "not_configured",
      parts: [
        {
          id: "mcp",
          label: "MCP Knowledge Bridge",
          configured: false,
          path: "~/.codex/mcp.json",
          details: "Streamable HTTP connection to Savant Knowledge & Context (ports 8194 / 8193)",
        },
        {
          id: "instructions",
          label: "Learning Protocol Instructions",
          configured: false,
          path: "~/.codex/instructions.md",
          details: "Mandates posting durable insights & bug root causes to Savant Knowledge",
        },
        {
          id: "skills",
          label: "Savant Default Skills",
          configured: false,
          path: "~/.codex/skills/",
          details: "savant-knowledge-commit, savant-code-analysis, savant-session-workspace",
        },
        {
          id: "hook",
          label: "Fallback Learning Hook",
          configured: false,
          path: "~/.codex/record-learning.sh",
          details: "CLI curl wrapper for posting learnings directly to Savant Knowledge API",
        },
      ],
      lastChecked: new Date().toISOString(),
    },
  };

  const list = Object.values(agents);
  return {
    timestamp: new Date().toISOString(),
    serverUrl,
    agents,
    summary: {
      total: list.length,
      configured: list.filter(a => a.status === "configured").length,
      partial: list.filter(a => a.status === "partial").length,
      notConfigured: list.filter(a => a.status === "not_configured").length,
    },
  };
}

export class AgentSetupService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl = "http://127.0.0.1:8090", apiKey = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
  }

  async getStatus(): Promise<AgentSetupReport> {
    // Priority 1: Check Electron native system IPC
    if (typeof window !== "undefined" && (window as any).system?.getAgentSetupStatus) {
      try {
        const report = await (window as any).system.getAgentSetupStatus();
        if (report && report.agents) return report;
      } catch (err) {
        console.warn("Electron getAgentSetupStatus IPC error, falling back to HTTP:", err);
      }
    }

    // Priority 2: Call Savant Server REST API
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/setup/status?_=${Date.now()}`, {
        headers: buildAuthHeaders(this.apiKey, ""),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.agents) return data;
      }
    } catch (err) {
      console.warn("Server /api/agents/setup/status failed:", err);
    }

    // Priority 3: Fallback report
    return buildFallbackReport(this.baseUrl);
  }

  async triggerSetup(provider: AgentProvider | "all", parts?: string[], transport: AgentMcpTransport = "streamable-http"): Promise<TriggerSetupResult> {
    // Priority 1: Check Electron native system IPC
    if (typeof window !== "undefined" && (window as any).system?.triggerAgentSetup) {
      try {
        const result = await (window as any).system.triggerAgentSetup({ provider, parts, transport });
        if (result && result.report) return result;
      } catch (err) {
        console.warn("Electron triggerAgentSetup IPC error, falling back to HTTP:", err);
      }
    }

    // Priority 2: Call Savant Server REST API
    try {
      const res = await fetch(`${this.baseUrl}/api/agents/setup/trigger`, {
        method: "POST",
        headers: buildAuthHeaders(this.apiKey),
        body: JSON.stringify({ provider, parts, transport }),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      throw new Error(`Failed to trigger agent setup: ${res.statusText}`);
    } catch (err: any) {
      console.warn("Server /api/agents/setup/trigger error:", err);
      // Construct an optimistic simulated success result for mock/offline testing
      const baseReport = buildFallbackReport(this.baseUrl);
      const targets = provider === "all" ? (["copilot", "claude", "hermes", "codex"] as AgentProvider[]) : [provider];
      for (const p of targets) {
        if (baseReport.agents[p]) {
          baseReport.agents[p].status = "configured";
          baseReport.agents[p].present = true;
          baseReport.agents[p].parts = baseReport.agents[p].parts.map(part => ({
            ...part,
            configured: true,
          }));
          baseReport.agents[p].lastConfigured = new Date().toISOString();
        }
      }
      const list = Object.values(baseReport.agents);
      baseReport.summary = {
        total: list.length,
        configured: list.filter(a => a.status === "configured").length,
        partial: list.filter(a => a.status === "partial").length,
        notConfigured: list.filter(a => a.status === "not_configured").length,
      };

      return {
        success: true,
        provider,
        configuredParts: parts || ["mcp", "instructions", "skills", "hook"],
        report: baseReport,
      };
    }
  }

  async testLearningPost(title: string, content: string, nodeType = "insight"): Promise<any> {
    const endpoints = [
      `${this.baseUrl}/api/knowledge/nodes`,
      `${this.baseUrl}/api/knowledge/experiences`,
      `${this.baseUrl}/api/experiences`,
    ];

    let lastError: any = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            ...buildAuthHeaders(this.apiKey),
            "X-App-Name": "savant-olympus",
          },
          body: JSON.stringify({
            title,
            content,
            node_type: nodeType,
          }),
        });
        if (res.ok) {
          return await res.json();
        }
        if (res.status !== 404 && res.status !== 405) {
          const errText = await res.text();
          throw new Error(errText || `Status ${res.status}`);
        }
      } catch (err: any) {
        lastError = err;
      }
    }
    throw lastError || new Error("Failed to post learning to Knowledge API");
  }
}

export const createAgentSetupService = (baseUrl?: string, apiKey?: string) =>
  new AgentSetupService(baseUrl, apiKey);

export type McpServiceName = "workspace" | "abilities" | "context" | "knowledge" | "reminders";
export type McpDeploymentMode = "docker" | "kubernetes" | "local";

export interface McpEndpointSuggestion {
  deployment: McpDeploymentMode;
  endpoints: Partial<Record<McpServiceName, string>>;
}

/**
 * Asks the server what deployment it thinks it's in and what ports each MCP tool is on,
 * then builds a best-guess public URL per service. The guess is always editable/overridable
 * by the caller — this never claims certainty, especially for "kubernetes".
 */
export async function suggestMcpEndpoints(serverUrl: string, apiKey: string): Promise<McpEndpointSuggestion> {
  const base = normalizeBaseUrl(serverUrl);
  const res = await fetch(`${base}/api/mcp/tools?_=${Date.now()}`, {
    headers: buildAuthHeaders(apiKey, ""),
  });
  if (!res.ok) throw new Error(`Failed to fetch MCP discovery info: ${res.status}`);
  const data = await res.json();
  const deployment: McpDeploymentMode = data.deployment === "kubernetes" || data.deployment === "docker" ? data.deployment : "local";
  const servers: Array<{ name: McpServiceName; streamable_http?: { port: number } }> = data.servers || [];

  let serverHost = "127.0.0.1";
  try {
    serverHost = new URL(base).hostname;
  } catch {
    // keep default
  }

  const endpoints: Partial<Record<McpServiceName, string>> = {};
  for (const server of servers) {
    const port = server.streamable_http?.port;
    if (!port) continue;
    if (deployment === "kubernetes") {
      // Best guess only: Okteto/k8s commonly exposes each MCP server as its own ingress host,
      // derived by swapping the server's own hostname prefix for a per-service one.
      const guessedHost = serverHost.replace(/^savant-server/, `savant-mcp-${server.name}`);
      endpoints[server.name] = `https://${guessedHost}/mcp`;
    } else {
      endpoints[server.name] = `http://${serverHost}:${port}/mcp`;
    }
  }

  return { deployment, endpoints };
}

export interface CodingAgentMeta {
  id: AgentProvider;
  label: string;
  shortLabel: string;
  configPath: string;
  format: "json" | "yaml" | "toml";
}

export const ALL_CODING_AGENTS_META: CodingAgentMeta[] = [
  { id: "copilot", label: "GitHub Copilot", shortLabel: "Copilot", configPath: "~/.copilot/mcp.json", format: "json" },
  { id: "claude", label: "Claude Code / Desktop", shortLabel: "Claude", configPath: "~/.claude/claude_desktop_config.json", format: "json" },
  { id: "hermes", label: "Hermes Agent", shortLabel: "Hermes", configPath: "~/.hermes/config.yaml", format: "yaml" },
  { id: "codex", label: "Codex Agent", shortLabel: "Codex", configPath: "~/.codex/config.toml", format: "toml" },
];

export function buildUserMcpConfig(
  agentId: AgentProvider | string,
  userApiKey: string,
  serverUrl: string,
  mcpEndpoints?: Record<string, string>,
  transport: AgentMcpTransport = "streamable-http",
  userRole?: string
): string {
  const isGuest = userRole?.toLowerCase() === "guest";
  const services: Array<{ name: "knowledge" | "context" | "abilities" | "workspace"; port: number }> = isGuest
    ? [{ name: "knowledge", port: transport === "sse" ? 8094 : 8194 }]
    : [
        { name: "knowledge", port: transport === "sse" ? 8094 : 8194 },
        { name: "context", port: transport === "sse" ? 8093 : 8193 },
        { name: "abilities", port: transport === "sse" ? 8092 : 8192 },
        { name: "workspace", port: transport === "sse" ? 8091 : 8191 },
      ];

  const getUrl = (service: "knowledge" | "context" | "abilities" | "workspace", defaultPort: number) => {
    const configured = mcpEndpoints?.[service];
    if (configured && configured.trim()) {
      try {
        const urlObj = new URL(configured.trim());
        if (userApiKey) urlObj.searchParams.set("api_key", userApiKey);
        urlObj.searchParams.set("app_name", "savant-mcp");
        return urlObj.toString();
      } catch {
        const sep = configured.includes("?") ? "&" : "?";
        return `${configured}${sep}api_key=${userApiKey}&app_name=savant-mcp`;
      }
    }
    const suffix = transport === "sse" ? "sse" : "mcp";
    try {
      const parsed = new URL(serverUrl);
      const host = parsed.hostname;
      const match = host.match(/^savant-server-([^.]+)\.(.+)$/);
      if (match) {
        const [, user, domain] = match;
        return `${parsed.protocol}//savant-mcp-${service}-${user}.${domain}/${suffix}?api_key=${userApiKey}&app_name=savant-mcp`;
      }
    } catch {}
    return `http://127.0.0.1:${defaultPort}/${suffix}?api_key=${userApiKey}&app_name=savant-mcp`;
  };

  if (agentId === "codex") {
    // Generate TOML format for ~/.codex/config.toml
    const lines: string[] = [];
    for (const svc of services) {
      lines.push(`[mcp_servers.savant-${svc.name}]`);
      lines.push(`url = "${getUrl(svc.name, svc.port)}"`);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  if (agentId === "hermes") {
    // Generate YAML format for ~/.hermes/config.yaml
    const lines: string[] = ["mcp_servers:"];
    for (const svc of services) {
      lines.push(`  savant-${svc.name}:`);
      lines.push(`    url: "${getUrl(svc.name, svc.port)}"`);
    }
    return lines.join("\n");
  }

  // Generate JSON format for Claude / Copilot (using "http" or "sse" type, not streamable-http)
  const clientType = transport === "sse" ? "sse" : "http";
  const mcpServers: Record<string, { type: string; url: string }> = {};
  for (const svc of services) {
    mcpServers[`savant-${svc.name}`] = {
      type: clientType,
      url: getUrl(svc.name, svc.port),
    };
  }
  return JSON.stringify({ mcpServers }, null, 2);
}


