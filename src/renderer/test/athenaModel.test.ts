import { describe, expect, it, vi, beforeEach } from "vitest";
import { athenaModelFromSettings, extractAthenaModelTag, formatAthenaModel, reconcileAthenaModel, runAthenaAgent, thinkingLevelsFor, invalidateCatalogCache } from "../lib/athenaModel";

const providers = [
  { id: "hermes", models: ["configured"], configuredModel: "copilot/gpt-5.6-luna", thinkingLevels: ["none", "medium", "ultra"], defaultThinkingLevel: "medium" },
  { id: "copilot", models: ["configured", "auto", "gpt-5.6-luna"], thinkingLevels: ["low", "medium", "xhigh"], defaultThinkingLevel: "medium" },
];

describe("athenaModel", () => {
  beforeEach(() => {
    invalidateCatalogCache();
  });
  it("reads provider, model, and effort from the saved chain", () => {
    expect(athenaModelFromSettings({ "provider:chain": [{ provider: "copilot", model: "auto", thinkingLevel: "xhigh" }] }))
      .toEqual({ provider: "copilot", model: "auto", thinkingLevel: "xhigh" });
    expect(athenaModelFromSettings({})).toEqual({ provider: "hermes", model: "configured", thinkingLevel: "medium" });
  });

  it("drops stale models and unsupported efforts", () => {
    expect(reconcileAthenaModel({ provider: "hermes", model: "openrouter/some/model", thinkingLevel: "max" }, providers))
      .toEqual({ provider: "hermes", model: "configured", thinkingLevel: "medium" });
    expect(reconcileAthenaModel({ provider: "copilot", model: "gpt-5.6-luna", thinkingLevel: "xhigh" }, providers))
      .toEqual({ provider: "copilot", model: "gpt-5.6-luna", thinkingLevel: "xhigh" });
  });

  it("runs ATHENA with the latest saved mental mode", async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({ "provider:chain": [{ provider: "claude", model: "opus", thinkingLevel: "max" }] });
    window.system.runAgentViaGateway = vi.fn().mockResolvedValue("Answer");
    const response = await runAthenaAgent({ prompt: "hi" });
    expect(extractAthenaModelTag(response)).toEqual({ text: "Answer", model: "CLAUDE: opus · max" });
    expect(await runAthenaAgent({ prompt: "hi", tagModel: false })).toBe("Answer");
    expect(window.system.runAgentViaGateway).toHaveBeenCalledWith({ provider: "claude", model: "opus", thinkingLevel: "max", prompt: "hi" });
    expect(formatAthenaModel({ provider: "claude", model: "opus", thinkingLevel: "max" })).toBe("CLAUDE: opus · max");
  });

  it("narrows effort to what the selected model supports", () => {
    const copilot = { id: "copilot", models: ["claude-haiku-4.5", "kimi-k3"], thinkingLevels: ["low", "medium", "high"], modelThinkingLevels: { "claude-haiku-4.5": [], "kimi-k3": ["low", "high", "max"] } };
    expect(thinkingLevelsFor(copilot, "kimi-k3")).toEqual(["low", "high", "max"]);
    expect(thinkingLevelsFor(copilot, "claude-haiku-4.5")).toEqual([]);
    expect(reconcileAthenaModel({ provider: "copilot", model: "kimi-k3", thinkingLevel: "medium" }, [copilot]).thinkingLevel).toBe("low");
  });

  it("falls back to the provider default when the saved model is no longer entitled", async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({ "gateway:config": { url: "http://gw.test" }, "provider:chain": [{ provider: "copilot", model: "claude-sonnet-4.6", thinkingLevel: "medium" }] });
    window.system.listProviders = vi.fn().mockResolvedValue({ source: "gateway", providers: [providers[1]] });
    window.system.runAgentViaGateway = vi.fn().mockResolvedValue("ok");
    await runAthenaAgent({ prompt: "hi", tagModel: false });
    expect(window.system.runAgentViaGateway).toHaveBeenCalledWith({ provider: "copilot", model: "configured", thinkingLevel: "medium", prompt: "hi" });
  });

  it("reconciles to an enabled provider when current provider is disabled in gateway:enabledProviders", async () => {
    window.system.getSettings = vi.fn().mockResolvedValue({
      "gateway:config": { url: "http://gw.test" },
      "gateway:enabledProviders": ["hermes"],
      "provider:chain": [{ provider: "copilot", model: "auto", thinkingLevel: "xhigh" }],
    });
    window.system.listProviders = vi.fn().mockResolvedValue({ source: "gateway", providers });
    window.system.runAgentViaGateway = vi.fn().mockResolvedValue("ok");
    await runAthenaAgent({ prompt: "hi", tagModel: false });
    expect(window.system.runAgentViaGateway).toHaveBeenCalledWith({
      provider: "hermes",
      model: "configured",
      thinkingLevel: "medium",
      prompt: "hi",
    });
  });
});
