import { useEffect, useState } from "react";
import type { Thinking } from "@/types/thinking";
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from "@/services/auth";
import { resolveOlympusRuntimeConfig } from "@/services/olympusRuntime";
import { runtimeService } from "@/services/runtimeService";

const READY_DELAY_MS = 500;

export function useOlympusSession(refreshKey?: string) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [startupProgress, setStartupProgress] = useState("BOOTING_SYSTEM");
  const [startupSubtext, setStartupSubtext] = useState("Initializing Olympus control surface...");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [liveRole, setLiveRole] = useState("");
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [thinking, setThinking] = useState<Thinking[]>([]);
  const [statusText, setStatusText] = useState("IDLE");
  const runtime = resolveOlympusRuntimeConfig(settings, liveRole, getStoredApiKey());

  const addThinking = (agent: string, thought: string, type: Thinking["type"] = "thought") => {
    setThinking(previous => [{
      id: Math.random().toString(36).slice(2),
      agent,
      thought,
      type,
      timestamp: Date.now(),
    }, ...previous]);
  };

  const validateApiKey = (apiKey: string, nextSettings: Record<string, any>) =>
    runtimeService.validateApiKey(
      nextSettings["server:config"]?.url || "http://127.0.0.1:8090",
      apiKey,
    );

  const initialize = async (loadedSettings: Record<string, any>) => {
    setIsInitializing(true);
    setStartupProgress("CONNECTING_TO_CONTROL_PLANE");
    setStartupSubtext("Loading Savant settings and service endpoints...");
    setSettings(loadedSettings);
    setStatusText("INITIALIZING");
    const nextRuntime = resolveOlympusRuntimeConfig(loadedSettings, liveRole, getStoredApiKey());

    if (nextRuntime.gatewayEnabled) {
      try {
        const online = await runtimeService.checkGateway(nextRuntime.gatewayUrl, 4_000);
        addThinking("System", online ? `GATEWAY_LINK_ESTABLISHED (${nextRuntime.gatewayUrl})` : `GATEWAY_RESPONDED_WITH_ERROR (${nextRuntime.gatewayUrl})`, online ? "mcp_response" : "timeout");
      } catch {
        addThinking("System", `GATEWAY_OFFLINE: ${nextRuntime.gatewayUrl}`, "timeout");
      }
    } else {
      addThinking("System", "GATEWAY_DISABLED");
    }

    setStartupProgress("SYSTEM_READY");
    setStartupSubtext("Olympus control surface ready.");
    setStatusText("READY");
    window.setTimeout(() => setIsInitializing(false), READY_DELAY_MS);
  };

  const clearIdentity = async (loadedSettings: Record<string, any>) => {
    clearStoredApiKey();
    await Promise.all([
      window.system.saveSetting("user:apiKey", ""),
      window.system.saveSetting("user:id", ""),
      window.system.saveSetting("user:name", ""),
      window.system.saveSetting("user:role", ""),
    ]);
    setLiveRole("");
    setSettings({ ...loadedSettings, "user:apiKey": "", "user:id": "", "user:name": "", "user:role": "" });
    setIsAuthenticated(false);
    setIsInitializing(false);
  };

  useEffect(() => {
    const boot = async () => {
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
        const auth = await validateApiKey(effectiveApiKey, loadedSettings);
        if (auth?.user_id) {
          loadedSettings["user:id"] = auth.user_id;
          await window.system.saveSetting("user:id", auth.user_id);
        }
        if (auth?.name && !loadedSettings["user:name"]) {
          loadedSettings["user:name"] = auth.name;
          await window.system.saveSetting("user:name", auth.name);
        }
        setLiveRole(auth?.role || "");
      } catch {
        await clearIdentity(loadedSettings);
        return;
      }

      setStoredApiKey(effectiveApiKey);
      if (persistedApiKey !== effectiveApiKey) {
        await window.system.saveSetting("user:apiKey", effectiveApiKey);
        loadedSettings["user:apiKey"] = effectiveApiKey;
      }
      setIsAuthenticated(true);
      await initialize(loadedSettings);
    };
    void boot();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !runtime.apiKey) return;
    let isCurrent = true;
    const refreshLiveRole = async () => {
      try {
        const auth = await runtimeService.validateApiKey(runtime.serverUrl, runtime.apiKey);
        if (isCurrent) setLiveRole(auth?.role || "");
      } catch {
        if (isCurrent) setLiveRole("");
      }
    };
    void refreshLiveRole();
    window.addEventListener("focus", refreshLiveRole);
    return () => {
      isCurrent = false;
      window.removeEventListener("focus", refreshLiveRole);
    };
  }, [isAuthenticated, refreshKey, runtime.apiKey, runtime.serverUrl]);

  const login = async (candidateApiKey: string, candidateServerUrl?: string) => {
    const trimmed = candidateApiKey.trim();
    const loadedSettings = await window.system.getSettings();
    const serverConfig = candidateServerUrl
      ? { url: candidateServerUrl.trim(), enabled: true, status: "idle" }
      : loadedSettings["server:config"];
    const nextSettings: Record<string, any> = { ...loadedSettings, "server:config": serverConfig };
    const auth = await validateApiKey(trimmed, nextSettings);
    setStoredApiKey(trimmed);
    await window.system.saveSetting("user:apiKey", trimmed);
    if (candidateServerUrl) await window.system.saveSetting("server:config", serverConfig);
    if (auth?.user_id) {
      await window.system.saveSetting("user:id", auth.user_id);
      nextSettings["user:id"] = auth.user_id;
    }
    if (auth?.name) {
      await window.system.saveSetting("user:name", auth.name);
      nextSettings["user:name"] = auth.name;
    }
    setLiveRole(auth?.role || "");
    nextSettings["user:apiKey"] = trimmed;
    setIsAuthenticated(true);
    await initialize(nextSettings);
  };

  const logout = async () => {
    await clearIdentity(settings);
    setThinking([]);
    setStatusText("IDLE");
  };

  const refreshSettings = async () => {
    const loadedSettings = await window.system.getSettings();
    const localApiKey = getStoredApiKey();
    if (localApiKey && loadedSettings["user:apiKey"] !== localApiKey) loadedSettings["user:apiKey"] = localApiKey;
    setSettings(loadedSettings);
    addThinking("System", "SETTINGS_UPDATED_FROM_DATABASE");
  };

  return {
    isInitializing,
    startupProgress,
    startupSubtext,
    isAuthenticated,
    settings,
    thinking,
    statusText,
    runtime,
    login,
    logout,
    refreshSettings,
  };
}
