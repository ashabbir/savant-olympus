import { describe, expect, it } from "vitest";
import { resolveOlympusRuntimeConfig } from "../services/olympusRuntime";

describe("resolveOlympusRuntimeConfig", () => {
  it("derives runtime endpoints, credentials, model, and admin access from settings", () => {
    expect(resolveOlympusRuntimeConfig({
      "server:config": { url: "http://server.test" },
      "gateway:config": { url: "http://gateway.test", enabled: false },
      "user:apiKey": "sk-settings",
      "provider:chain": [{ provider: "codex", model: "gpt-5" }],
    }, "admin", "sk-local")).toEqual({
      serverUrl: "http://server.test",
      gatewayUrl: "http://gateway.test",
      gatewayEnabled: false,
      apiKey: "sk-settings",
      activeModel: { provider: "codex", model: "gpt-5" },
      isAdmin: true,
    });
  });

  it("uses stable defaults and the local credential when settings are incomplete", () => {
    expect(resolveOlympusRuntimeConfig({}, "operator", "sk-local")).toEqual({
      serverUrl: "http://127.0.0.1:8090",
      gatewayUrl: "http://127.0.0.1:3100",
      gatewayEnabled: true,
      apiKey: "sk-local",
      activeModel: { provider: "gemini", model: "3.5" },
      isAdmin: false,
    });
  });
});
