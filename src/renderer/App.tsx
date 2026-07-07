import { useState, useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightPanel } from "./components/RightPanel";
import { BottomBar } from "./components/BottomBar";
import StartupScreen from "./components/StartupScreen";
import { LoginScreen } from "./components/LoginScreen";
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from "./services/auth";
import { WorkspaceView } from "./components/tabs/WorkspaceView";
import { KnowledgeView } from "./components/tabs/KnowledgeView";
import { ContextView } from "./components/tabs/ContextView";
import { ToolsView } from "./components/tabs/ToolsView";
import { SkillsView } from "./components/tabs/SkillsView";
import { AbilitiesView } from "./components/tabs/AbilitiesView";
import { UsersView } from "./components/tabs/UsersView";
import { RemindersView } from "./components/tabs/RemindersView";
import { Toaster } from "sonner";

export interface Thinking {
  id: string;
  agent: string;
  thought: string;
  timestamp: number;
  type?: "thought" | "mcp_call" | "mcp_response" | "shell" | "worker_start" | "worker_end" | "data_transfer" | "redecision" | "timeout" | "loop_check" | "error";
}

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [startupProgress, setStartupProgress] = useState("BOOTING_SYSTEM");
  const [startupSubtext, setStartupSubtext] = useState("Initializing Olympus control surface...");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [thinking, setThinking] = useState<Thinking[]>([]);
  const [statusText, setStatusText] = useState("IDLE");
  const [activeTab, setActiveTab] = useState<string>("Workspace");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const serverUrl = settings["server:config"]?.url || "http://127.0.0.1:8090";
  const apiKey = settings["user:apiKey"] || getStoredApiKey() || "";
  const providerChain = settings["provider:chain"] || [];
  const activeModel = providerChain[0] || { provider: "gemini", model: "3.5" };

  const addThinking = (agent: string, thought: string, type: Thinking["type"] = "thought") => {
    setThinking(prev => [{
      id: Math.random().toString(36).slice(2),
      agent,
      thought,
      type,
      timestamp: Date.now(),
    }, ...prev]);
  };

  const handleSettingsChanged = async () => {
    const loadedSettings = await window.system.getSettings();
    const localApiKey = getStoredApiKey();
    if (localApiKey && loadedSettings["user:apiKey"] !== localApiKey) {
      loadedSettings["user:apiKey"] = localApiKey;
    }
    setSettings(loadedSettings);
    addThinking("System", "SETTINGS_UPDATED_FROM_DATABASE");
  };

  const validateSavantApiKey = async (candidateApiKey: string, loadedSettings: Record<string, any>) => {
    const targetServerUrl = loadedSettings["server:config"]?.url || "http://127.0.0.1:8090";
    let res: Response;
    try {
      res = await fetch(`${targetServerUrl.replace(/\/+$/, "")}/api/auth/validate`, {
        headers: { "X-API-Key": candidateApiKey },
      });
    } catch (_e) {
      throw new Error("Cannot reach Savant server auth. Check that savant-server is running and allows X-API-Key CORS preflight.");
    }
    if (!res.ok) {
      throw new Error(res.status === 401 ? "Invalid Savant API key." : `Savant auth failed with ${res.status}.`);
    }
    return await res.json();
  };

  const initializeOlympus = async (loadedSettings: Record<string, any>) => {
    setIsInitializing(true);
    setStartupProgress("CONNECTING_TO_CONTROL_PLANE");
    setStartupSubtext("Loading Savant settings and service endpoints...");
    setSettings(loadedSettings);
    setStatusText("INITIALIZING");

    const gatewayUrl = loadedSettings["gateway:config"]?.url || "http://127.0.0.1:3100";
    const gatewayEnabled = loadedSettings["gateway:config"]?.enabled !== false;

    if (gatewayEnabled) {
      try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/health`);
        addThinking("System", res.ok ? `GATEWAY_LINK_ESTABLISHED (${gatewayUrl})` : `GATEWAY_RESPONDED_WITH_ERROR (${res.status})`, res.ok ? "mcp_response" : "timeout");
      } catch (_e) {
        addThinking("System", `GATEWAY_OFFLINE: ${gatewayUrl}`, "timeout");
      }
    } else {
      addThinking("System", "GATEWAY_DISABLED");
    }

    setStartupProgress("SYSTEM_READY");
    setStartupSubtext("Olympus control surface ready.");
    setStatusText("READY");
    setTimeout(() => setIsInitializing(false), 500);
  };

  useEffect(() => {
    const init = async () => {
      setStartupProgress("AUTHENTICATING_USER");
      setStartupSubtext("Checking local Savant credential...");

      const loadedSettings = await window.system.getSettings();
      const localApiKey = getStoredApiKey();
      const persistedApiKey = String(loadedSettings["user:apiKey"] || "").trim();
      const effectiveApiKey = localApiKey || persistedApiKey;

      if (!effectiveApiKey) {
        setSettings(loadedSettings);
        setIsAuthenticated(false);
        setIsInitializing(false);
        return;
      }

      try {
        const auth = await validateSavantApiKey(effectiveApiKey, loadedSettings);
        if (auth?.user_id) {
          loadedSettings["user:id"] = auth.user_id;
          await window.system.saveSetting("user:id", auth.user_id);
        }
        if (auth?.name && !loadedSettings["user:name"]) {
          loadedSettings["user:name"] = auth.name;
          await window.system.saveSetting("user:name", auth.name);
        }
      } catch (_e) {
        clearStoredApiKey();
        await window.system.saveSetting("user:apiKey", "");
        await window.system.saveSetting("user:id", "");
        await window.system.saveSetting("user:name", "");
        setSettings({ ...loadedSettings, "user:apiKey": "", "user:id": "", "user:name": "" });
        setIsAuthenticated(false);
        setIsInitializing(false);
        return;
      }

      setStoredApiKey(effectiveApiKey);
      if (persistedApiKey !== effectiveApiKey) {
        await window.system.saveSetting("user:apiKey", effectiveApiKey);
        loadedSettings["user:apiKey"] = effectiveApiKey;
      }
      setIsAuthenticated(true);
      await initializeOlympus(loadedSettings);
    };
    init();
  }, []);

  const handleLogin = async (candidateApiKey: string, candidateServerUrl?: string) => {
    const trimmed = candidateApiKey.trim();
    const loadedSettings = await window.system.getSettings();
    const validationSettings = {
      ...loadedSettings,
      "server:config": candidateServerUrl
        ? { url: candidateServerUrl.trim(), enabled: true, status: "idle" }
        : loadedSettings["server:config"]
    };
    const auth = await validateSavantApiKey(trimmed, validationSettings);
    setStoredApiKey(trimmed);
    await window.system.saveSetting("user:apiKey", trimmed);
    if (candidateServerUrl) {
      const serverConfig = { url: candidateServerUrl.trim(), enabled: true, status: "idle" };
      await window.system.saveSetting("server:config", serverConfig);
      loadedSettings["server:config"] = serverConfig;
    }
    if (auth?.user_id) {
      await window.system.saveSetting("user:id", auth.user_id);
      loadedSettings["user:id"] = auth.user_id;
    }
    if (auth?.name) {
      await window.system.saveSetting("user:name", auth.name);
      loadedSettings["user:name"] = auth.name;
    }
    loadedSettings["user:apiKey"] = trimmed;
    setIsAuthenticated(true);
    await initializeOlympus(loadedSettings);
  };

  const handleLogout = async () => {
    clearStoredApiKey();
    await window.system.saveSetting("user:apiKey", "");
    await window.system.saveSetting("user:id", "");
    await window.system.saveSetting("user:name", "");
    setIsAuthenticated(false);
    setIsInitializing(false);
    setSettings(prev => ({ ...prev, "user:apiKey": "", "user:id": "", "user:name": "" }));
    setThinking([]);
    setSelectedProject(null);
    setStatusText("IDLE");
  };

  useEffect(() => {
    const handleSwitch = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) {
        setActiveTab(tab);
      }
    };
    window.addEventListener("switch-tab", handleSwitch);
    return () => window.removeEventListener("switch-tab", handleSwitch);
  }, []);

  if (isInitializing) {
    return <StartupScreen progress={startupProgress} subtext={startupSubtext} />;
  }

  if (!isAuthenticated || !getStoredApiKey()) {
    return <LoginScreen onLogin={handleLogin} initialServerUrl={settings["server:config"]?.url} />;
  }

  return (
    <div
      className="size-full flex flex-col overflow-hidden"
      style={{ background: "var(--cp-bg-0)", color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
    >
      <div
        className="fixed inset-0 pointer-events-none z-[999]"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />

      <TopBar />

      <div className="flex flex-1 overflow-hidden relative">
        <LeftSidebar
          onSettingsChanged={handleSettingsChanged}
          onLogout={handleLogout}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
        />

        <main className="flex-1 overflow-hidden">
          {activeTab === "Workspace" ? (
            <WorkspaceView serverUrl={serverUrl} apiKey={apiKey} sessionId={null} />
          ) : activeTab === "Knowledge" ? (
            <KnowledgeView serverUrl={serverUrl} apiKey={apiKey} />
          ) : activeTab === "Context" ? (
            <ContextView serverUrl={serverUrl} apiKey={apiKey} selectedProject={selectedProject} onSelectProject={setSelectedProject} activeModel={activeModel} />
          ) : activeTab === "Tools" ? (
            <ToolsView serverUrl={serverUrl} apiKey={apiKey} />
          ) : activeTab === "Skills" ? (
            <SkillsView serverUrl={serverUrl} apiKey={apiKey} activeModel={activeModel} />
          ) : activeTab === "Abilities" ? (
            <AbilitiesView serverUrl={serverUrl} apiKey={apiKey} />
          ) : activeTab === "Users" ? (
            <UsersView serverUrl={serverUrl} apiKey={apiKey} activeUserId={settings["user:id"] || ""} onSettingsChanged={handleSettingsChanged} />
          ) : activeTab === "Reminders" ? (
            <RemindersView serverUrl={serverUrl} apiKey={apiKey} />
          ) : (
            <WorkspaceView serverUrl={serverUrl} apiKey={apiKey} sessionId={null} />
          )}
        </main>

        <RightPanel
          thinking={thinking}
          statusText={statusText}
          activeTab={activeTab}
          serverUrl={serverUrl}
          apiKey={apiKey}
          selectedProject={selectedProject}
        />
      </div>

      <BottomBar />
      <Toaster position="top-right" richColors theme="dark" toastOptions={{ style: { fontFamily: "'Rajdhani', monospace", fontSize: "12px" } }} />
    </div>
  );
}
