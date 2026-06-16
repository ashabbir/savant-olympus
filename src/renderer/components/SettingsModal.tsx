import { useEffect, useState, useRef } from "react";
import { X, Plus, Trash2, GripVertical, Folder, RefreshCw, CheckCircle, XCircle, WifiOff } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { getStoredApiKey } from "../services/auth";
import { TagInput } from "./ui/tag-input";

interface ProviderChainItem {
  id: string;
  provider: string;
  model: string;
}

interface ProviderOption {
  id: string;
  label: string;
  defaultModel?: string;
  models: string[];
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
}

const TABS = [
  { id: "system", label: "system" },
  { id: "gateway", label: "gateway" },
  { id: "server", label: "server" },
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
  async function checkHealth() {
    onChange({ status: "checking" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${normalizeServiceUrl(config.url)}${healthPath}`, {
        signal: controller.signal,
        headers: includeApiKey && apiKey ? { "X-API-Key": apiKey } : undefined,
      });
      clearTimeout(timer);
      onChange({ status: res.ok ? "connected" : "failed" });
    } catch (_e) {
      clearTimeout(timer);
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
      </div>
    </div>
  );
}

export function SettingsModal({ open, onClose, onSettingsChanged }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("system");
  const [defaultDirectory, setDefaultDirectory] = useState<string>("");
  const [moderatorPrompt, setModeratorPrompt] = useState<string>("");
  const [providerChain, setProviderChain] = useState<ProviderChainItem[]>([
    { id: "p1", provider: "claude", model: "sonnet" },
    { id: "p2", provider: "gemini", model: "3.5" },
  ]);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
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

      backupRef.current = {
        "system:defaultDirectory": settings["system:defaultDirectory"] || "",
        "moderator:prompt": settings["moderator:prompt"] || "",
        "provider:chain": settings["provider:chain"] || "",
        "agents:list": settings["agents:list"] || [],
        "gateway:config": settings["gateway:config"] || { url: "http://localhost:3100", enabled: true },
        "server:config": settings["server:config"] || { url: "http://127.0.0.1:8090", enabled: true },
      };
      initializedRef.current = true;

      await refreshProviders(nextGateway);
      await refreshAbilities(nextServer);
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
      await window.system.saveSetting("server:config", { ...server, status: "idle", url: normalizeServiceUrl(server.url) });
      if (onSettingsChanged) onSettingsChanged();
    }, 500);

    return () => clearTimeout(saveTimer);
  }, [defaultDirectory, moderatorPrompt, providerChain, agents, gateway, server]);

  async function handleSave() {
    await window.system.saveSetting("system:defaultDirectory", defaultDirectory);
    await window.system.saveSetting("moderator:prompt", moderatorPrompt);
    await window.system.saveSetting("provider:chain", providerChain);
    await window.system.saveSetting("agents:list", agents);
    await window.system.saveSetting("gateway:config", { ...gateway, status: "idle", url: normalizeServiceUrl(gateway.url) });
    await window.system.saveSetting("server:config", { ...server, status: "idle", url: normalizeServiceUrl(server.url) });
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
    await window.system.saveSetting("server:config", backupRef.current["server:config"]);
    if (onSettingsChanged) onSettingsChanged();
    onClose();
  }

  const selectedProviderOptions = providerOptions.length > 0
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
        const validIds = new Set(result.providers.map(provider => provider.id));
        return prev.map((item, index) => {
          if (validIds.has(item.provider)) return item;
          const replacement = result.providers[index] || result.providers[0];
          return {
            ...item,
            provider: replacement.id,
            model: replacement.defaultModel || replacement.models[0] || item.model,
          };
        });
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
      const res = await fetch(`${normalizeServiceUrl(serverConfig.url)}/api/abilities/assets`, {
        headers: {
          "X-API-Key": apiKey || "",
        }
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const payload = await res.json();
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

                <div className="pt-2">
                  <label style={labelStyle} className="block text-xs mb-2 opacity-70">Active AI Model</label>
                  <select
                    value={providerChain[0] ? `${providerChain[0].provider}/${providerChain[0].model}` : "gemini/3.5"}
                    onChange={(e) => {
                      const [provider, model] = e.target.value.split("/");
                      setProviderChain([{ id: "p1", provider, model }]);
                    }}
                    style={{ ...inputStyle, width: "100%", outline: "none", border: "1px solid var(--cp-border)", borderRadius: "4px" }}
                    className="px-3 py-2 text-xs cursor-pointer"
                  >
                    {selectedProviderOptions.flatMap(p => 
                      p.models.map(m => ({
                        provider: p.id,
                        model: m,
                        label: `${p.label || p.id.toUpperCase()}: ${m}`
                      }))
                    ).map((opt, i) => (
                      <option key={i} value={`${opt.provider}/${opt.model}`} className="bg-[var(--cp-bg-3)]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}


            {/* ── GATEWAY ── */}
            {activeTab === "gateway" && (
              <ServicePanel
                description="API gateway routing and connection settings"
                config={gateway}
                onChange={patch => setGateway(prev => ({ ...prev, ...patch }))}
                healthPath="/health"
                apiKey={userApiKey}
              />
            )}

            {/* ── SERVER ── */}
            {activeTab === "server" && (
              <ServicePanel
                description="Backend server connection settings"
                config={server}
                onChange={patch => setServer(prev => ({ ...prev, ...patch }))}
                healthPath="/health/ready"
                apiKey={userApiKey}
                includeApiKey
              />
            )}
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
