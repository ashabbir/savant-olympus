import { useEffect, useState, useRef } from "react";
import { X, Plus, Trash2, GripVertical, Folder, RefreshCw, CheckCircle, XCircle, WifiOff, Bot, Terminal, Code2, FileText } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { getStoredApiKey } from "../services/auth";
import { runtimeService } from "../services/runtimeService";
import { createAbilitiesService } from "../services/abilitiesService";
import { TagInput } from "./ui/tag-input";
import { ATHENA_MODEL_CHANGED_EVENT, athenaModelFromSettings, reconcileAthenaModel, thinkingLevelsFor, invalidateCatalogCache } from "../lib/athenaModel";
import { suggestMcpEndpoints, McpDeploymentMode, McpServiceName } from "../services/agentSetupService";
import { AppVariablesManager } from "./shared/AppVariablesManager";

interface ProviderChainItem {
  id: string;
  provider: string;
  model: string;
  thinkingLevel?: string;
}

interface ProviderOption {
  id: string;
  label: string;
  defaultModel?: string;
  models: string[];
  configuredModel?: string;
  thinkingLevels?: string[];
  modelThinkingLevels?: Record<string, string[]>;
  defaultThinkingLevel?: string;
  source: "gateway" | "terminal";
  installed: boolean;
}

interface AgentItem {
  id: string;
  name: string;
  persona: string;
  prompt: string;
  tags: string[];
}

type ConnectionStatus = "idle" | "checking" | "connected" | "failed";

interface ServiceConfig {
  url: string;
  enabled: boolean;
  status: ConnectionStatus;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSettingsChanged?: () => void;
  isAdmin?: boolean;
}

const TABS = [
  { id: "system", label: "system" },
  { id: "gateway", label: "gateway" },
  { id: "server", label: "server" },
  { id: "agents", label: "agents" },
] as const;

type TabId = typeof TABS[number]["id"];

const MODELS = ["gpt", "sonnet", "gemini", "3.5"];

function createId(prefix: string, existingIds: Set<string>) {
  let id = "";
  do {
    id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  } while (existingIds.has(id));
  return id;
}

const inputStyle = {
  background: "var(--cp-bg-3)",
  border: "1px solid var(--cp-border)",
  color: "var(--foreground)",
  fontFamily: "'Share Tech Mono', monospace",
} as const;

const labelStyle = {
  color: "var(--cp-cyan)",
  fontFamily: "'Share Tech Mono', monospace",
} as const;

function normalizeServiceUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function toLiveServiceConfig(value: any, fallback: ServiceConfig): ServiceConfig {
  return {
    ...fallback,
    ...(value || {}),
    status: "idle",
  };
}

function CyberpunkInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
      className={`px-3 py-2 text-xs w-full focus:outline-none focus:border-[var(--cp-cyan)] placeholder:opacity-30 ${className}`}
    />
  );
}

function ServicePanel({
  description,
  config,
  onChange,
  healthPath,
  apiKey,
  includeApiKey = false,
}: {
  description: string;
  config: ServiceConfig;
  onChange: (patch: Partial<ServiceConfig>) => void;
  healthPath: string;
  apiKey?: string;
  includeApiKey?: boolean;
}) {
  const [serviceVersion, setServiceVersion] = useState<string | null>(null);

  async function checkHealth() {
    onChange({ status: "checking" });
    setServiceVersion(null);
    try {
      const health = await runtimeService.checkHealthInfo(config.url, healthPath, includeApiKey ? apiKey : "", 4_000);
      setServiceVersion(health.online ? health.version || null : null);
      onChange({ status: health.online ? "connected" : "failed" });
    } catch (_e) {
      onChange({ status: "failed" });
    }
  }

  const statusColor =
    config.status === "connected" ? "var(--cp-cyan)" :
    config.status === "failed" ? "var(--cp-magenta)" :
    "var(--foreground)";

  const StatusIcon =
    config.status === "connected" ? CheckCircle :
    config.status === "failed" ? XCircle :
    config.status === "checking" ? RefreshCw :
    WifiOff;

  return (
    <div className="space-y-4">
      <p style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }} className="text-sm opacity-60">
        {description}
      </p>

      {/* Enable/Disable toggle */}
      <div className="flex items-center gap-3">
        <label style={labelStyle} className="text-xs opacity-70">Status</label>
        <button
          onClick={() => onChange({ enabled: !config.enabled })}
          style={{
            background: config.enabled ? "var(--cp-cyan)" : "var(--cp-bg-3)",
            border: "1px solid var(--cp-border)",
            color: config.enabled ? "var(--cp-bg-0)" : "var(--foreground)",
            fontFamily: "'Share Tech Mono', monospace",
          }}
          className="px-3 py-1 text-xs transition-all"
        >
          {config.enabled ? "ENABLED" : "DISABLED"}
        </button>
      </div>

      {/* URL */}
      <div>
        <label style={labelStyle} className="block text-xs mb-2 opacity-70">URL</label>
        <CyberpunkInput
          value={config.url}
          onChange={url => onChange({ url })}
          placeholder="http://..."
        />
      </div>

      {/* Health check */}
      <div>
        <label style={labelStyle} className="block text-xs mb-2 opacity-70">Health Endpoint</label>
        <div
          style={{ background: "var(--cp-bg-3)", border: "1px solid var(--cp-border)", color: "var(--foreground)", fontFamily: "'Share Tech Mono', monospace" }}
          className="px-3 py-2 text-xs opacity-50"
        >
          {normalizeServiceUrl(config.url)}{healthPath}
        </div>
      </div>

      {/* Check + status */}
      <div className="flex items-center gap-3">
        <button
          onClick={checkHealth}
          disabled={!config.enabled || config.status === "checking"}
          style={{
            background: "var(--cp-bg-3)",
            border: "1px solid var(--cp-cyan)",
            color: "var(--cp-cyan)",
            fontFamily: "'Share Tech Mono', monospace",
          }}
          className="px-3 py-1.5 text-xs flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-30"
        >
          <RefreshCw size={12} className={config.status === "checking" ? "animate-spin" : ""} />
          Check Connection
        </button>

        {config.status !== "idle" && (
          <div className="flex items-center gap-1.5" style={{ color: statusColor, fontFamily: "'Share Tech Mono', monospace" }}>
            <StatusIcon size={13} className={config.status === "checking" ? "animate-spin" : ""} />
            <span className="text-xs uppercase">
              {config.status === "checking" ? "checking..." : config.status}
            </span>
          </div>
        )}
        {config.status === "connected" && serviceVersion && (
          <span className="text-xs" style={{ color: "var(--foreground)", fontFamily: "'Share Tech Mono', monospace" }}>
            SERVER v{serviceVersion}
          </span>
        )}
      </div>
    </div>
  );
}

const MCP_SERVICES: Array<{ name: McpServiceName; label: string }> = [
  { name: "workspace", label: "Workspace" },
  { name: "abilities", label: "Abilities" },
  { name: "context", label: "Context" },
  { name: "knowledge", label: "Knowledge" },
  { name: "reminders", label: "Reminders" },
];

function McpEndpointsPanel({
  endpoints,
  autoFilled,
  deployment,
  detecting,
  detectError,
  onChange,
  onRedetect,
}: {
  endpoints: Record<McpServiceName, string>;
  autoFilled: Set<McpServiceName>;
  deployment: McpDeploymentMode | null;
  detecting: boolean;
  detectError: string;
  onChange: (name: McpServiceName, url: string) => void;
  onRedetect: () => void;
}) {
  return (
    <div className="space-y-3 pt-2 border-t" style={{ borderColor: "var(--cp-border)" }}>
      <div className="flex items-center justify-between">
        <div>
          <label style={labelStyle} className="block text-xs opacity-70">MCP Endpoints</label>
          <p style={{ color: "var(--foreground)" }} className="text-[11px] opacity-50 mt-0.5">
            {deployment
              ? deployment === "kubernetes"
                ? "Server looks like it's running in Kubernetes/Okteto — URLs below are a best guess. Please confirm or edit."
                : `Server looks like it's running ${deployment === "docker" ? "in Docker" : "locally"} — URLs below were auto-filled.`
              : "Where each MCP tool (Workspace, Abilities, Context, Knowledge, Reminders) is reachable. Auto-detected from the server, always editable."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRedetect}
          disabled={detecting}
          style={{ background: "var(--cp-bg-3)", border: "1px solid var(--cp-cyan)", color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }}
          className="px-3 py-1.5 text-xs flex items-center gap-1.5 hover:opacity-80 transition-opacity disabled:opacity-30 shrink-0"
        >
          <RefreshCw size={12} className={detecting ? "animate-spin" : ""} />
          Re-detect
        </button>
      </div>

      {detectError && (
        <p style={{ color: "var(--cp-magenta)" }} className="text-[11px]">{detectError}</p>
      )}

      <div className="space-y-2">
        {MCP_SERVICES.map(({ name, label }) => (
          <div key={name} className="flex items-center gap-2">
            <span style={labelStyle} className="text-xs w-20 shrink-0 opacity-70">{label}</span>
            <CyberpunkInput
              value={endpoints[name] || ""}
              onChange={url => onChange(name, url)}
              placeholder="http://127.0.0.1:819x/mcp"
            />
            {autoFilled.has(name) && endpoints[name] && (
              <span className="text-[9px] uppercase opacity-40 shrink-0" style={labelStyle}>guessed</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AthenaMentalMode({ value, options, loading, onRefresh, onChange, labelStyle, inputStyle }: {
  value: { provider: string; model: string; thinkingLevel: string };
  options: ProviderOption[];
  loading: boolean;
  onRefresh: () => void;
  onChange: (next: { provider: string; model: string; thinkingLevel: string }) => void;
  labelStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
}) {
  const provider = options.find(option => option.id === value.provider);
  const models = provider?.models.length ? provider.models : [value.model];
  const levels = thinkingLevelsFor(provider, value.model);
  const selectStyle = { ...inputStyle, width: "100%", outline: "none", border: "1px solid var(--cp-border)", borderRadius: "4px" };
  const modelLabel = (model: string) => (model === "configured" && provider?.configuredModel ? `configured (${provider.configuredModel})` : model);

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between mb-2">
        <label style={labelStyle} className="block text-xs opacity-70">ATHENA Mental Mode</label>
        <button type="button" onClick={onRefresh} className="flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100" title="Reload providers and models from gateway">
          <RefreshCw size={10} className={loading ? "animate-spin" : ""} /> refresh
        </button>
      </div>
      <div className="grid grid-cols-[1fr_2fr_1fr] gap-2">
        <div>
          <span className="block text-[9px] uppercase tracking-wider opacity-50 mb-1">Provider</span>
          <select
            aria-label="ATHENA provider"
            value={value.provider}
            onChange={(e) => onChange(reconcileAthenaModel({ ...value, provider: e.target.value, model: "" }, options))}
            style={selectStyle}
            className="px-2 py-2 text-xs cursor-pointer"
          >
            {options.length === 0 && <option value="">No providers enabled</option>}
            {options.map(option => (
              <option key={option.id} value={option.id} className="bg-[var(--cp-bg-3)]">{option.label || option.id}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="block text-[9px] uppercase tracking-wider opacity-50 mb-1">Model <span className="opacity-60">({models.length})</span></span>
          <select
            aria-label="ATHENA model"
            value={value.model}
            onChange={(e) => onChange(reconcileAthenaModel({ ...value, model: e.target.value }, options))}
            style={selectStyle}
            className="px-2 py-2 text-xs cursor-pointer"
          >
            {models.map(model => (
              <option key={model} value={model} className="bg-[var(--cp-bg-3)]">{modelLabel(model)}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="block text-[9px] uppercase tracking-wider opacity-50 mb-1">Effort</span>
          <select
            aria-label="ATHENA effort"
            value={levels.length ? value.thinkingLevel : ""}
            disabled={!levels.length}
            title={levels.length ? undefined : "This model does not support an effort setting"}
            onChange={(e) => onChange({ ...value, thinkingLevel: e.target.value })}
            style={selectStyle}
            className="px-2 py-2 text-xs cursor-pointer"
          >
            {!levels.length && <option value="">n/a</option>}
            {levels.length > 0 && !levels.includes(value.thinkingLevel) && <option value={value.thinkingLevel}>{value.thinkingLevel}</option>}
            {levels.map(level => (
              <option key={level} value={level} className="bg-[var(--cp-bg-3)]">{level}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ open, onClose, onSettingsChanged, isAdmin = false }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("system");
  const [defaultDirectory, setDefaultDirectory] = useState<string>("");
  const [moderatorPrompt, setModeratorPrompt] = useState<string>("");
  const [providerChain, setProviderChain] = useState<ProviderChainItem[]>([
    { id: "p1", provider: "claude", model: "sonnet" },
    { id: "p2", provider: "gemini", model: "3.5" },
  ]);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [enabledProviders, setEnabledProviders] = useState<string[] | null>(null);
  const [enabledAgents, setEnabledAgents] = useState<string[] | null>(null);
  const [providerSource, setProviderSource] = useState<"gateway" | "terminal">("terminal");
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState("");
  const [abilitiesLoading, setAbilitiesLoading] = useState(false);
  const [abilitiesError, setAbilitiesError] = useState("");
  const [userApiKey, setUserApiKey] = useState("");
  const [agents, setAgents] = useState<AgentItem[]>([
    { id: "a1", name: "agent_01", persona: "engineer", prompt: "", tags: ["backend"] },
  ]);
  const [personas, setPersonas] = useState<string[]>(["engineer", "product", "support"]);
  const [agentTags, setAgentTags] = useState<string[]>(["backend", "frontend", "qa"]);
  const [gateway, setGateway] = useState<ServiceConfig>({
    url: "http://localhost:3100",
    enabled: true,
    status: "idle",
  });
  const [server, setServer] = useState<ServiceConfig>({
    url: "http://127.0.0.1:8090",
    enabled: true,
    status: "idle",
  });
  const [mcpEndpoints, setMcpEndpoints] = useState<Record<McpServiceName, string>>({
    workspace: "", abilities: "", context: "", knowledge: "", reminders: "",
  });
  const [mcpAutoFilled, setMcpAutoFilled] = useState<Set<McpServiceName>>(new Set());
  const [mcpDeployment, setMcpDeployment] = useState<McpDeploymentMode | null>(null);
  const [mcpDetectLoading, setMcpDetectLoading] = useState(false);
  const [mcpDetectError, setMcpDetectError] = useState("");
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<Record<string, any>>({});
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadSettings() {
      const settings = await window.system.getSettings();
      if (cancelled) return;

      if (settings["system:defaultDirectory"]) setDefaultDirectory(settings["system:defaultDirectory"]);
      if (settings["moderator:prompt"]) setModeratorPrompt(settings["moderator:prompt"]);
      if (settings["provider:chain"]) setProviderChain(settings["provider:chain"]);
      setUserApiKey(getStoredApiKey() || settings["user:apiKey"] || "");
      if (settings["agents:list"]) {
        setAgents(settings["agents:list"].map((agent: any) => ({
          ...agent,
          tags: Array.isArray(agent.tags) ? agent.tags : [],
        })));
      }

      const savedProviders = settings["gateway:enabledProviders"];
      setEnabledProviders(Array.isArray(savedProviders) ? savedProviders : null);

      const savedAgents = settings["agents:enabledList"] ?? settings["agents:enabled"];
      setEnabledAgents(Array.isArray(savedAgents) ? savedAgents : null);

      const nextGateway = toLiveServiceConfig(settings["gateway:config"], {
        url: "http://localhost:3100",
        enabled: true,
        status: "idle",
      });
      const nextServer = toLiveServiceConfig(settings["server:config"], {
        url: "http://127.0.0.1:8090",
        enabled: true,
        status: "idle",
      });

      setGateway(nextGateway);
      setServer(nextServer);

      const nextMcpEndpoints = {
        workspace: "", abilities: "", context: "", knowledge: "", reminders: "",
        ...(settings["mcp:endpoints"] || {}),
      };
      setMcpEndpoints(nextMcpEndpoints);

      backupRef.current = {
        "system:defaultDirectory": settings["system:defaultDirectory"] || "",
        "moderator:prompt": settings["moderator:prompt"] || "",
        "provider:chain": settings["provider:chain"] || "",
        "agents:list": settings["agents:list"] || [],
        "gateway:config": settings["gateway:config"] || { url: "http://localhost:3100", enabled: true },
        "gateway:enabledProviders": Array.isArray(savedProviders) ? savedProviders : null,
        "agents:enabledList": Array.isArray(savedAgents) ? savedAgents : null,
        "server:config": settings["server:config"] || { url: "http://127.0.0.1:8090", enabled: true },
        "mcp:endpoints": settings["mcp:endpoints"] || {},
      };
      initializedRef.current = true;

      await refreshProviders(nextGateway);
      await refreshAbilities(nextServer);

      // First time setup: nothing saved yet, so auto-detect and prefill (still fully editable/overridable).
      if (!settings["mcp:endpoints"] && nextServer.enabled) {
        await detectMcpEndpoints(nextServer, nextMcpEndpoints);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!initializedRef.current) return;

    const saveTimer = setTimeout(async () => {
      await window.system.saveSetting("system:defaultDirectory", defaultDirectory);
      await window.system.saveSetting("moderator:prompt", moderatorPrompt);
      await window.system.saveSetting("provider:chain", providerChain);
      await window.system.saveSetting("agents:list", agents);
      await window.system.saveSetting("gateway:config", { ...gateway, status: "idle", url: normalizeServiceUrl(gateway.url) });
      await window.system.saveSetting("gateway:enabledProviders", enabledProviders);
      await window.system.saveSetting("agents:enabledList", enabledAgents);
      await window.system.saveSetting("server:config", { ...server, status: "idle", url: normalizeServiceUrl(server.url) });
      await window.system.saveSetting("mcp:endpoints", mcpEndpoints);
      window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
      if (onSettingsChanged) onSettingsChanged();
    }, 500);

    return () => clearTimeout(saveTimer);
  }, [defaultDirectory, moderatorPrompt, providerChain, agents, gateway, server, mcpEndpoints, enabledProviders, enabledAgents]);

  async function detectMcpEndpoints(serverConfig: ServiceConfig = server, currentEndpoints: Record<McpServiceName, string> = mcpEndpoints) {
    setMcpDetectLoading(true);
    setMcpDetectError("");
    try {
      const suggestion = await suggestMcpEndpoints(serverConfig.url, userApiKey || getStoredApiKey() || "");
      setMcpDeployment(suggestion.deployment);
      setMcpEndpoints(prev => {
        const next = { ...prev };
        const nowAutoFilled = new Set(mcpAutoFilled);
        for (const [name, url] of Object.entries(suggestion.endpoints)) {
          const serviceName = name as McpServiceName;
          const current = currentEndpoints[serviceName] ?? prev[serviceName];
          if (!current || mcpAutoFilled.has(serviceName)) {
            next[serviceName] = url as string;
            nowAutoFilled.add(serviceName);
          }
        }
        setMcpAutoFilled(nowAutoFilled);
        return next;
      });
    } catch (error: any) {
      setMcpDetectError(error?.message || "Failed to detect MCP endpoints from server.");
    } finally {
      setMcpDetectLoading(false);
    }
  }

  function handleMcpEndpointChange(name: McpServiceName, url: string) {
    setMcpAutoFilled(prev => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    setMcpEndpoints(prev => ({ ...prev, [name]: url }));
  }

  async function handleSave() {
    await window.system.saveSetting("system:defaultDirectory", defaultDirectory);
    await window.system.saveSetting("moderator:prompt", moderatorPrompt);
    await window.system.saveSetting("provider:chain", providerChain);
    await window.system.saveSetting("agents:list", agents);
    await window.system.saveSetting("gateway:config", { ...gateway, status: "idle", url: normalizeServiceUrl(gateway.url) });
    await window.system.saveSetting("gateway:enabledProviders", enabledProviders);
    await window.system.saveSetting("agents:enabledList", enabledAgents);
    await window.system.saveSetting("server:config", { ...server, status: "idle", url: normalizeServiceUrl(server.url) });
    await window.system.saveSetting("mcp:endpoints", mcpEndpoints);
    invalidateCatalogCache();
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
    onClose();
  }

  async function handleCancel() {
    if (Object.keys(backupRef.current).length === 0) {
      onClose();
      return;
    }
    await window.system.saveSetting("system:defaultDirectory", backupRef.current["system:defaultDirectory"]);
    await window.system.saveSetting("moderator:prompt", backupRef.current["moderator:prompt"]);
    await window.system.saveSetting("provider:chain", backupRef.current["provider:chain"]);
    await window.system.saveSetting("agents:list", backupRef.current["agents:list"]);
    await window.system.saveSetting("gateway:config", backupRef.current["gateway:config"]);
    await window.system.saveSetting("gateway:enabledProviders", backupRef.current["gateway:enabledProviders"]);
    await window.system.saveSetting("agents:enabledList", backupRef.current["agents:enabledList"]);
    await window.system.saveSetting("server:config", backupRef.current["server:config"]);
    await window.system.saveSetting("mcp:endpoints", backupRef.current["mcp:endpoints"]);
    invalidateCatalogCache();
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
    onClose();
  }

  const allDiscoveredProviders = providerOptions.length > 0
    ? providerOptions
    : [
      { id: "codex", label: "Codex", defaultModel: "o4-mini", models: ["o4-mini", "gpt-5-mini", "gpt-5", "gpt-5-codex", "o3"] },
      { id: "gemini", label: "Gemini", defaultModel: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-exp"] },
      { id: "claude", label: "Claude", defaultModel: "haiku", models: ["haiku", "sonnet", "opus", "claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-7"] },
      { id: "copilot", label: "Copilot", defaultModel: "claude-haiku-4.5", models: ["claude-haiku-4.5", "claude-sonnet-4.6", "claude-opus-4.7", "gpt-4.1", "gpt-5-mini"] },
    ].map(provider => ({
      ...provider,
      source: "terminal" as const,
      installed: true,
    }));

  const selectedProviderOptions = allDiscoveredProviders.filter(
    provider => enabledProviders === null || enabledProviders.includes(provider.id)
  );

  async function toggleProviderEnabled(providerId: string) {
    const currentEnabled = enabledProviders !== null
      ? [...enabledProviders]
      : allDiscoveredProviders.map(p => p.id);

    const nextEnabled = currentEnabled.includes(providerId)
      ? currentEnabled.filter(id => id !== providerId)
      : [...currentEnabled, providerId];

    setEnabledProviders(nextEnabled);
    invalidateCatalogCache();
    await window.system.saveSetting("gateway:enabledProviders", nextEnabled);
    window.dispatchEvent(new CustomEvent("savant:settings-changed", { detail: { "gateway:enabledProviders": nextEnabled } }));
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
  }

  async function enableAllProviders() {
    const nextEnabled = allDiscoveredProviders.map(p => p.id);
    setEnabledProviders(nextEnabled);
    invalidateCatalogCache();
    await window.system.saveSetting("gateway:enabledProviders", nextEnabled);
    window.dispatchEvent(new CustomEvent("savant:settings-changed", { detail: { "gateway:enabledProviders": nextEnabled } }));
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
  }

  async function disableAllProviders() {
    setEnabledProviders([]);
    invalidateCatalogCache();
    await window.system.saveSetting("gateway:enabledProviders", []);
    window.dispatchEvent(new CustomEvent("savant:settings-changed", { detail: { "gateway:enabledProviders": [] } }));
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
  }

  const displayAgents = [
    { id: "copilot", label: "GitHub Copilot", description: "GitHub Copilot Chat, CLI, and Agent Mode integration", icon: Bot },
    { id: "claude", label: "Claude Code / Desktop", description: "Anthropic Claude Code CLI & Desktop Agent integration", icon: Terminal },
    { id: "hermes", label: "Hermes Agent", description: "Hermes autonomous agent execution runtime", icon: Code2 },
    { id: "codex", label: "Codex Agent", description: "Codex CLI & OpenAI developer environment", icon: FileText },
  ];

  async function toggleAgentEnabled(agentId: string) {
    const current = enabledAgents !== null
      ? [...enabledAgents]
      : displayAgents.map(a => a.id);
    const next = current.includes(agentId)
      ? current.filter(id => id !== agentId)
      : [...current, agentId];
    setEnabledAgents(next);
    await window.system.saveSetting("agents:enabledList", next);
    window.dispatchEvent(new CustomEvent("savant:settings-changed", { detail: { "agents:enabledList": next } }));
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
  }

  async function enableAllAgents() {
    const next = displayAgents.map(a => a.id);
    setEnabledAgents(next);
    await window.system.saveSetting("agents:enabledList", next);
    window.dispatchEvent(new CustomEvent("savant:settings-changed", { detail: { "agents:enabledList": next } }));
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
  }

  async function disableAllAgents() {
    setEnabledAgents([]);
    await window.system.saveSetting("agents:enabledList", []);
    window.dispatchEvent(new CustomEvent("savant:settings-changed", { detail: { "agents:enabledList": [] } }));
    window.dispatchEvent(new Event(ATHENA_MODEL_CHANGED_EVENT));
    if (onSettingsChanged) onSettingsChanged();
  }

  useEffect(() => {
    if (selectedProviderOptions.length > 0) {
      const current = athenaModelFromSettings({ "provider:chain": providerChain });
      if (!selectedProviderOptions.some(p => p.id === current.provider)) {
        const athena = reconcileAthenaModel(current, selectedProviderOptions);
        setProviderChain(prev => [{ ...(prev[0] || { id: "p1" }), ...athena }, ...prev.slice(1)]);
      }
    }
  }, [selectedProviderOptions]);

  async function refreshProviders(gatewayConfig: ServiceConfig = gateway) {
    setProvidersLoading(true);
    setProvidersError("");
    try {
      const result = await window.system.listProviders(gatewayConfig.enabled ? normalizeServiceUrl(gatewayConfig.url) : undefined);
      setProviderSource(result.source);
      setProviderOptions(result.providers);
      setGateway(prev => ({
        ...prev,
        status: result.source === "gateway" && result.providers.length > 0 ? "connected" : prev.status,
      }));
      if (result.providers.length === 0) {
        setProvidersError("No gateway providers or supported terminal providers detected.");
      }
      setProviderChain(prev => {
        if (result.providers.length === 0) return prev;
        const activeProviders = enabledProviders === null
          ? result.providers
          : result.providers.filter((p: any) => enabledProviders.includes(p.id));
        const effectiveProviders = activeProviders.length ? activeProviders : result.providers;
        // Keep the ATHENA mental mode valid against the live catalog (drops stale models/efforts)
        const athena = reconcileAthenaModel(athenaModelFromSettings({ "provider:chain": prev }), effectiveProviders);
        return [{ ...(prev[0] || { id: "p1" }), ...athena }, ...prev.slice(1)];
      });
    } catch (error: any) {
      setProvidersError(error?.message || "Failed to load provider list.");
    } finally {
      setProvidersLoading(false);
    }
  }

  async function refreshAbilities(serverConfig: ServiceConfig = server) {
    if (!serverConfig.enabled) return;
    setAbilitiesLoading(true);
    setAbilitiesError("");
    const settings = await window.system.getSettings();
    const apiKey = getStoredApiKey() || settings["user:apiKey"] || userApiKey;
    setUserApiKey(apiKey || "");
    try {
      if (!apiKey) {
        throw new Error("Savant API key is required. Add it in Profile before loading abilities.");
      }
      const payload = await createAbilitiesService(serverConfig.url, apiKey).listAssets();
      const assets = Array.isArray(payload)
        ? payload
        : Object.values(payload || {}).flatMap((value: any) => Array.isArray(value) ? value : []);
      
      const fetchedPersonas = assets
        .filter((a: any) => a.type === "persona")
        .map((a: any) => a.name || a.id);
      
      // Include all other assets (rules, policies, styles, repos) as potential tags
      const assetTags = assets
        .filter((a: any) => a.type !== "persona")
        .map((a: any) => a.id || a.name);
      
      // Also include metadata tags from all assets
      const metaTags = assets.flatMap((a: any) => a.tags || []);
      
      const allTags = Array.from(new Set<string>([...assetTags, ...metaTags]));

      if (fetchedPersonas.length > 0) setPersonas(fetchedPersonas);
      if (allTags.length > 0) setAgentTags(allTags);
    } catch (e: any) {
      const message = e?.message === "Failed to fetch"
        ? "Cannot reach Savant server abilities. Check that savant-server is running and allows X-API-Key CORS preflight."
        : e?.message || "Failed to fetch abilities.";
      setAbilitiesError(message);
      console.error("Failed to fetch abilities:", e);
    } finally {
      setAbilitiesLoading(false);
    }
  }

  // Provider chain
  function addProvider() {
    const provider = selectedProviderOptions[0];
    setProviderChain(prev => {
      const existingIds = new Set(prev.map(item => item.id));
      return [...prev, { id: createId("provider", existingIds), provider: provider.id, model: provider.defaultModel || provider.models[0] || MODELS[0] }];
    });
  }
  function removeProvider(id: string) {
    setProviderChain(prev => prev.filter(p => p.id !== id));
  }
  function updateProvider(id: string, field: "provider" | "model", value: string) {
    setProviderChain(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (field === "provider") {
        const provider = selectedProviderOptions.find(option => option.id === value);
        return { ...p, provider: value, model: provider?.defaultModel || provider?.models[0] || p.model };
      }
      return { ...p, [field]: value };
    }));
  }

  // Agents
  function addAgent() {
    setAgents(prev => {
      const existingIds = new Set(prev.map(agent => agent.id));
      const nextIndex = prev.length + 1;
      return [...prev, {
        id: createId("agent", existingIds),
        name: `agent_${String(nextIndex).padStart(2, "0")}`,
        persona: personas[0] || "engineer",
        prompt: "",
        tags: [],
      }];
    });
  }
  function removeAgent(id: string) {
    setAgents(prev => prev.filter(a => a.id !== id));
  }
  function updateAgent(id: string, patch: Partial<AgentItem>) {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }

  // Directory
  function handleDirectorySelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const path = files[0].webkitRelativePath;
      setDefaultDirectory(path.substring(0, path.lastIndexOf("/")) || path);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ background: "rgba(0,0,0,0.7)" }} className="fixed inset-0 z-[100]" />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleCancel();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
              handleSave();
            }
          }}
          style={{
            background: "var(--cp-bg-2)",
            border: "1px solid var(--cp-border)",
            boxShadow: "0 0 20px rgba(0,229,255,0.2)",
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-3xl max-h-[80vh] flex flex-col"
        >
          {/* header */}
          <div style={{ borderBottom: "1px solid var(--cp-border)" }} className="flex items-center justify-between p-6 shrink-0">
            <div>
              <Dialog.Title style={{ color: "var(--cp-cyan)", fontFamily: "'Orbitron', sans-serif" }} className="text-lg font-medium">
                Settings
              </Dialog.Title>
              <Dialog.Description style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }} className="text-xs opacity-50 mt-1">
                Configure system preferences and agent settings
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button style={{ color: "var(--cp-cyan)" }} className="opacity-60 hover:opacity-100 transition-opacity">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* tabs */}
          <div style={{ borderBottom: "1px solid var(--cp-border)" }} className="flex gap-1 px-6 shrink-0 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  color: activeTab === tab.id ? "var(--cp-cyan)" : "var(--foreground)",
                  borderBottom: activeTab === tab.id ? "2px solid var(--cp-cyan)" : "2px solid transparent",
                  fontFamily: "'Share Tech Mono', monospace",
                  opacity: activeTab === tab.id ? 1 : 0.5,
                }}
                className="px-3 py-2 text-xs uppercase tracking-wide hover:opacity-100 transition-opacity whitespace-nowrap"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* content */}
          <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,229,255,0.1) transparent" }}>

            {/* ── SYSTEM ── */}
            {activeTab === "system" && (
              <div className="space-y-4">
                <p style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }} className="text-sm opacity-60">
                  System configuration and preferences
                </p>
                <div>
                  <label style={labelStyle} className="block text-xs mb-2 opacity-70">Default Directory</label>
                  <div className="flex gap-2">
                    <div style={{ ...inputStyle }} className="flex-1 px-3 py-2 text-xs flex items-center">
                      {defaultDirectory ? <span className="truncate">{defaultDirectory}</span> : <span className="opacity-50">No directory selected</span>}
                    </div>
                    <button
                      onClick={() => directoryInputRef.current?.click()}
                      style={{ background: "var(--cp-cyan)", color: "var(--cp-bg-0)", fontFamily: "'Share Tech Mono', monospace" }}
                      className="px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0"
                    >
                      <Folder size={12} />
                      Browse
                    </button>
                  </div>
                  <input ref={directoryInputRef} type="file" onChange={handleDirectorySelect} className="hidden" {...({ webkitdirectory: "", directory: "" } as any)} />
                </div>

                <AthenaMentalMode
                  value={athenaModelFromSettings({ "provider:chain": providerChain })}
                  options={selectedProviderOptions}
                  loading={providersLoading}
                  onRefresh={() => refreshProviders()}
                  onChange={(next) => setProviderChain(prev => [{ ...(prev[0] || { id: "p1" }), ...next }, ...prev.slice(1)])}
                  labelStyle={labelStyle}
                  inputStyle={inputStyle}
                />
              </div>
            )}


            {/* ── GATEWAY ── */}
            {activeTab === "gateway" && (
              <div className="space-y-6">
                <ServicePanel
                  description="API gateway routing and connection settings"
                  config={gateway}
                  onChange={patch => setGateway(prev => ({ ...prev, ...patch }))}
                  healthPath="/health"
                  apiKey={userApiKey}
                />

                <div className="p-4 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 style={{ color: "var(--cp-cyan)", fontFamily: "'Orbitron', sans-serif" }} className="text-xs uppercase tracking-wider font-semibold">
                        Enabled Providers Override (Athena / Chat)
                      </h4>
                      <p className="text-[11px] opacity-60 mt-0.5" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                        Enable or disable specific gateway providers (e.g. Hermes, Codex, Copilot, Claude). Controls what providers and models are available for Athena mental mode and chat.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={enableAllProviders}
                        style={{ border: "1px solid var(--cp-cyan)", color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }}
                        className="px-2.5 py-1 text-[10px] uppercase hover:bg-[var(--cp-cyan)] hover:text-[var(--cp-bg-0)] transition-all cursor-pointer"
                      >
                        Enable All
                      </button>
                      <button
                        type="button"
                        onClick={disableAllProviders}
                        style={{ border: "1px solid var(--cp-border)", color: "var(--foreground)", fontFamily: "'Share Tech Mono', monospace" }}
                        className="px-2.5 py-1 text-[10px] uppercase hover:border-red-400 hover:text-red-400 transition-all opacity-80 cursor-pointer"
                      >
                        Disable All
                      </button>
                    </div>
                  </div>

                  {providersLoading ? (
                    <div className="flex items-center gap-2 py-4 text-xs opacity-60">
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Loading gateway providers...</span>
                    </div>
                  ) : allDiscoveredProviders.length === 0 ? (
                    <div className="py-4 text-xs opacity-50 italic">
                      No gateway providers discovered. Check gateway connection.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {allDiscoveredProviders.map(provider => {
                        const isEnabled = enabledProviders === null || enabledProviders.includes(provider.id);
                        return (
                          <div
                            key={provider.id}
                            onClick={() => toggleProviderEnabled(provider.id)}
                            style={{
                              background: isEnabled ? "var(--cp-bg-2)" : "var(--cp-bg-3)",
                              borderColor: isEnabled ? "var(--cp-cyan)" : "var(--cp-border)",
                            }}
                            className={`p-3 border rounded cursor-pointer flex items-center justify-between transition-all select-none ${
                              isEnabled ? "shadow-[0_0_8px_rgba(0,229,255,0.15)]" : "opacity-50"
                            }`}
                          >
                            <div className="flex flex-col min-w-0 pr-2">
                              <span style={{ fontFamily: "'Share Tech Mono', monospace" }} className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] truncate">
                                {provider.label || provider.id}
                              </span>
                              <span className="text-[10px] opacity-60 truncate">
                                ID: {provider.id} · {provider.models?.length || 0} models
                              </span>
                            </div>
                            <span
                              style={{
                                background: isEnabled ? "var(--cp-cyan)" : "var(--cp-bg-0)",
                                color: isEnabled ? "var(--cp-bg-0)" : "var(--foreground)",
                                border: "1px solid var(--cp-border)",
                                fontFamily: "'Share Tech Mono', monospace",
                              }}
                              className="px-2 py-0.5 text-[10px] font-bold uppercase rounded shrink-0"
                            >
                              {isEnabled ? "ENABLED" : "DISABLED"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SERVER ── */}
            {activeTab === "server" && (
              <div className="space-y-4">
                <ServicePanel
                  description="Backend server connection settings"
                  config={server}
                  onChange={patch => setServer(prev => ({ ...prev, ...patch }))}
                  healthPath="/health/ready"
                  apiKey={userApiKey}
                  includeApiKey
                />
                <McpEndpointsPanel
                  endpoints={mcpEndpoints}
                  autoFilled={mcpAutoFilled}
                  deployment={mcpDeployment}
                  detecting={mcpDetectLoading}
                  detectError={mcpDetectError}
                  onChange={handleMcpEndpointChange}
                  onRedetect={() => detectMcpEndpoints()}
                />
                {isAdmin && (
                  <AppVariablesManager
                    serverUrl={server.url}
                    apiKey={userApiKey || getStoredApiKey() || ""}
                    onVariablesChanged={onSettingsChanged}
                  />
                )}
              </div>
            )}

            {/* ── AGENTS ── */}
            {activeTab === "agents" && (
              <div className="space-y-6">
                <div>
                  <p style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }} className="text-sm opacity-60">
                    Configure Model Context Protocol, Learning Instructions, and Knowledge Commit for external AI coding assistants.
                  </p>
                </div>

                <div className="p-4 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 style={{ color: "var(--cp-cyan)", fontFamily: "'Orbitron', sans-serif" }} className="text-xs uppercase tracking-wider font-semibold">
                        Enabled Coding Agents Override
                      </h4>
                      <p className="text-[11px] opacity-60 mt-0.5" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                        Enable or disable specific coding agents (Hermes, Codex, Copilot, Claude). Disabled agents are hidden from the Agent Setup view and cannot be triggered.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={enableAllAgents}
                        style={{ border: "1px solid var(--cp-cyan)", color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }}
                        className="px-2.5 py-1 text-[10px] uppercase hover:bg-[var(--cp-cyan)] hover:text-[var(--cp-bg-0)] transition-all cursor-pointer"
                      >
                        Enable All
                      </button>
                      <button
                        type="button"
                        onClick={disableAllAgents}
                        style={{ border: "1px solid var(--cp-border)", color: "var(--foreground)", fontFamily: "'Share Tech Mono', monospace" }}
                        className="px-2.5 py-1 text-[10px] uppercase hover:border-red-400 hover:text-red-400 transition-all opacity-80 cursor-pointer"
                      >
                        Disable All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {displayAgents.map(agent => {
                      const isEnabled = enabledAgents === null || enabledAgents.includes(agent.id);
                      const Icon = agent.icon;
                      return (
                        <div
                          key={agent.id}
                          onClick={() => toggleAgentEnabled(agent.id)}
                          style={{
                            background: isEnabled ? "var(--cp-bg-2)" : "var(--cp-bg-3)",
                            borderColor: isEnabled ? "var(--cp-cyan)" : "var(--cp-border)",
                          }}
                          className={`p-3 border rounded cursor-pointer flex items-center justify-between transition-all select-none ${
                            isEnabled ? "shadow-[0_0_8px_rgba(0,229,255,0.15)]" : "opacity-50"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 pr-2">
                            <div className={`p-1.5 rounded mt-0.5 shrink-0 ${isEnabled ? "text-[var(--cp-cyan)] bg-[var(--cp-bg-0)]" : "text-muted-foreground bg-[var(--cp-bg-2)]"}`}>
                              <Icon size={16} />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span style={{ fontFamily: "'Share Tech Mono', monospace" }} className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] truncate">
                                {agent.label}
                              </span>
                              <span className="text-[10px] opacity-60 line-clamp-1">
                                {agent.description}
                              </span>
                            </div>
                          </div>
                          <span
                            style={{
                              background: isEnabled ? "var(--cp-cyan)" : "var(--cp-bg-0)",
                              color: isEnabled ? "var(--cp-bg-0)" : "var(--foreground)",
                              border: "1px solid var(--cp-border)",
                              fontFamily: "'Share Tech Mono', monospace",
                            }}
                            className="px-2 py-0.5 text-[10px] font-bold uppercase rounded shrink-0"
                          >
                            {isEnabled ? "ENABLED" : "DISABLED"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--cp-cyan)] uppercase">Knowledge Graph Integration</span>
                    <span className="text-muted-foreground">Automated MCP Bridge</span>
                  </div>
                  <p className="text-muted-foreground font-sans text-[11px]">
                    Every enabled agent is wired to automatically persist durable insights, bug root causes, and architectural patterns directly to Savant Knowledge.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (enabledAgents !== null) {
                        await window.system.saveSetting("agents:enabledList", enabledAgents);
                      }
                      if (onSettingsChanged) onSettingsChanged();
                      onClose();
                      window.dispatchEvent(new CustomEvent("switch-tab", { detail: "Agents" }));
                    }}
                    style={{ background: "var(--cp-cyan)", color: "var(--cp-bg-0)", fontFamily: "'Share Tech Mono', monospace" }}
                    className="w-full py-2 px-3 text-xs font-bold uppercase tracking-wider rounded hover:opacity-90 transition-opacity mt-2 cursor-pointer text-center block"
                  >
                    Open Full Agent Setup View
                  </button>
                </div>
              </div>
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
