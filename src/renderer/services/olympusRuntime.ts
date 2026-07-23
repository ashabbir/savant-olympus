export interface OlympusModel {
  provider: string;
  model: string;
}

export interface OlympusRuntimeConfig {
  serverUrl: string;
  gatewayUrl: string;
  gatewayEnabled: boolean;
  apiKey: string;
  activeModel: OlympusModel;
  isAdmin: boolean;
}

export const DEFAULT_SERVER_URL = "http://127.0.0.1:8090";
export const DEFAULT_GATEWAY_URL = "http://127.0.0.1:3100";
export const DEFAULT_MODEL: OlympusModel = { provider: "gemini", model: "3.5" };

export function resolveOlympusRuntimeConfig(
  settings: Record<string, any>,
  liveRole: string,
  localApiKey: string,
): OlympusRuntimeConfig {
  const providerChain = settings["provider:chain"] || [];
  return {
    serverUrl: settings["server:config"]?.url || DEFAULT_SERVER_URL,
    gatewayUrl: settings["gateway:config"]?.url || DEFAULT_GATEWAY_URL,
    gatewayEnabled: settings["gateway:config"]?.enabled !== false,
    apiKey: settings["user:apiKey"] || localApiKey || "",
    activeModel: providerChain[0] || DEFAULT_MODEL,
    isAdmin: liveRole === "admin",
  };
}
