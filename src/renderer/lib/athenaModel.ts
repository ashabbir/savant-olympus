import { useEffect, useState } from "react";

export interface AthenaModelSelection {
  provider: string;
  model: string;
  thinkingLevel: string;
}

export interface AthenaProviderOption {
  id: string;
  label?: string;
  defaultModel?: string;
  models: string[];
  configuredModel?: string;
  thinkingLevels?: string[];
  modelThinkingLevels?: Record<string, string[]>;
  defaultThinkingLevel?: string;
}

export const DEFAULT_THINKING_LEVELS = ["low", "medium", "high"];
export const DEFAULT_ATHENA_MODEL: AthenaModelSelection = { provider: "hermes", model: "configured", thinkingLevel: "medium" };

/** Reads the ATHENA mental mode (provider, model, effort) from saved settings. */
export function athenaModelFromSettings(settings: Record<string, any> | null | undefined): AthenaModelSelection {
  const first = settings?.["provider:chain"]?.[0];
  if (!first?.provider) return DEFAULT_ATHENA_MODEL;
  return {
    provider: String(first.provider),
    model: String(first.model || "configured"),
    thinkingLevel: String(first.thinkingLevel || first.thinking_level || DEFAULT_ATHENA_MODEL.thinkingLevel),
  };
}

const CATALOG_TTL_MS = 60_000;
let catalogCache: { at: number; url: string; providers: AthenaProviderOption[] } | null = null;

export function invalidateCatalogCache(): void {
  catalogCache = null;
}

async function loadProviderCatalog(settings: Record<string, any>): Promise<AthenaProviderOption[]> {
  const gateway = settings?.["gateway:config"];
  const url = gateway?.enabled === false ? "" : String(gateway?.url || "");
  let providers: AthenaProviderOption[] = [];
  if (catalogCache && catalogCache.url === url && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    providers = catalogCache.providers;
  } else {
    const result = await window.system.listProviders(url || undefined);
    providers = Array.isArray(result?.providers) ? result.providers : [];
    if (providers.length) catalogCache = { at: Date.now(), url, providers };
  }
  const enabledProviders = settings?.["gateway:enabledProviders"];
  if (Array.isArray(enabledProviders)) {
    return providers.filter((p) => enabledProviders.includes(p.id));
  }
  return providers;
}

/**
 * Reads settings fresh so every ATHENA surface follows the latest Settings save, then
 * validates against the live gateway catalog so a model the account lost access to
 * falls back to the provider default instead of failing the run.
 */
export async function resolveAthenaModel(): Promise<AthenaModelSelection> {
  let settings: Record<string, any> = {};
  try {
    settings = await window.system.getSettings();
  } catch (error) {
    console.error("Failed to load ATHENA mental mode:", error);
    return DEFAULT_ATHENA_MODEL;
  }
  const saved = athenaModelFromSettings(settings);
  try {
    return reconcileAthenaModel(saved, await loadProviderCatalog(settings));
  } catch {
    return saved;
  }
}

const ATHENA_MODEL_TAG = /\n*<!--\s*athena-model:\s*(.+?)\s*-->\s*$/;

/** Records which model answered, so every ATHENA transcript shows it. */
export function tagAthenaResponse(text: string, selection: AthenaModelSelection): string {
  return `${text.replace(ATHENA_MODEL_TAG, "")}\n\n<!-- athena-model: ${formatAthenaModel(selection)} -->`;
}

export function extractAthenaModelTag(text: string): { text: string; model?: string } {
  const match = text.match(ATHENA_MODEL_TAG);
  return match ? { text: text.slice(0, match.index).trimEnd(), model: match[1] } : { text };
}

/**
 * Runs an ATHENA prompt through the gateway with the configured provider, model, and effort.
 * Pass `tagModel: false` when the raw response is consumed as file content.
 */
export async function runAthenaAgent({ prompt, tagModel = true }: { prompt: string; tagModel?: boolean }): Promise<string> {
  const selection = await resolveAthenaModel();
  const response = await window.system.runAgentViaGateway({ ...selection, prompt });
  return tagModel ? tagAthenaResponse(response || "", selection) : response;
}

export const ATHENA_MODEL_CHANGED_EVENT = "athena-model-changed";

/** Live ATHENA mental mode for labels; refreshes on Settings save and window focus. */
export function useAthenaModel(): AthenaModelSelection {
  const [selection, setSelection] = useState<AthenaModelSelection>(DEFAULT_ATHENA_MODEL);
  useEffect(() => {
    let active = true;
    const load = () => { resolveAthenaModel().then((next) => { if (active) setSelection(next); }); };
    load();
    window.addEventListener(ATHENA_MODEL_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener(ATHENA_MODEL_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, []);
  return selection;
}

export function formatAthenaModel(selection?: Partial<AthenaModelSelection> | null): string {
  const current = { ...DEFAULT_ATHENA_MODEL, ...(selection || {}) };
  return `${current.provider.toUpperCase()}: ${current.model} · ${current.thinkingLevel}`;
}

/** Effort levels for a provider, narrowed to the model's support when the gateway reports it. */
export function thinkingLevelsFor(option?: AthenaProviderOption, model?: string): string[] {
  const perModel = model ? option?.modelThinkingLevels?.[model] : undefined;
  if (perModel) return perModel;
  return option?.thinkingLevels?.length ? option.thinkingLevels : DEFAULT_THINKING_LEVELS;
}

/** Keeps a saved selection valid against the provider catalog (e.g. old Hermes catalog models). */
export function reconcileAthenaModel(selection: AthenaModelSelection, options: AthenaProviderOption[]): AthenaModelSelection {
  if (!options.length) return selection;
  const provider = options.find((option) => option.id === selection.provider) || options[0];
  const model = provider.models.includes(selection.model)
    ? selection.model
    : provider.defaultModel || provider.models[0] || "configured";
  const levels = thinkingLevelsFor(provider, model);
  // Models without effort support keep the provider default; the gateway omits the flag
  const thinkingLevel = !levels.length || levels.includes(selection.thinkingLevel)
    ? (levels.length ? selection.thinkingLevel : provider.defaultThinkingLevel || "medium")
    : levels.includes(provider.defaultThinkingLevel || "medium")
      ? provider.defaultThinkingLevel || "medium"
      : levels[0];
  return { provider: provider.id, model, thinkingLevel };
}

/** Approximate context window (tokens) for the selected model; conservative defaults. */
export function contextWindowFor(selection?: Partial<AthenaModelSelection> | null): number {
  const model = String(selection?.model || "").toLowerCase();
  const provider = String(selection?.provider || "").toLowerCase();
  if (/gemini/.test(model) || provider === "gemini") return 1_000_000;
  if (/claude|opus|sonnet|haiku|fable/.test(model) || provider === "claude") return 200_000;
  if (/gpt-6|gpt-5/.test(model)) return 400_000;
  return 128_000;
}
