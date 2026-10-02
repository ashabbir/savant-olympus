import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Eye, EyeOff, RefreshCw, Database, Terminal, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { createAppVariablesService, AppVariablesResponse } from "../../services/appVariablesService";

interface AppVariablesManagerProps {
  serverUrl: string;
  apiKey?: string;
  onVariablesChanged?: () => void;
  compact?: boolean;
}

export function AppVariablesManager({
  serverUrl,
  apiKey = "",
  onVariablesChanged,
  compact = false,
}: AppVariablesManagerProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AppVariablesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New key-value inputs
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  // Track visibility of secret values by key
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const service = createAppVariablesService(serverUrl, apiKey);

  const fetchVariables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await service.list(true);
      setData(resp);
    } catch (err: any) {
      setError(err?.message || "Failed to load application variables");
    } finally {
      setLoading(false);
    }
  }, [serverUrl, apiKey]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  const handleAddOrUpdate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = newKey.trim().toUpperCase();
    const cleanVal = newValue.trim();

    if (!cleanKey) {
      toast.error("Variable key is required");
      return;
    }

    setSaving(true);
    try {
      await service.set(cleanKey, cleanVal);
      toast.success(`Saved variable ${cleanKey}`);
      setNewKey("");
      setNewValue("");
      await fetchVariables();
      onVariablesChanged?.();
    } catch (err: any) {
      toast.error(`Failed to save variable: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleInlineSave = async (key: string) => {
    setSaving(true);
    try {
      await service.set(key, editingValue.trim());
      toast.success(`Updated variable ${key}`);
      setEditingKey(null);
      await fetchVariables();
      onVariablesChanged?.();
    } catch (err: any) {
      toast.error(`Failed to update ${key}: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (!window.confirm(`Delete application variable "${key}"?`)) return;

    try {
      await service.delete(key);
      toast.success(`Deleted variable ${key}`);
      await fetchVariables();
      onVariablesChanged?.();
    } catch (err: any) {
      toast.error(`Failed to delete variable: ${err?.message || err}`);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const variables = data?.variables || {};
  const effective = data?.effective || {};
  const varEntries = Object.entries(variables);

  return (
    <div className={`space-y-4 font-mono text-xs ${compact ? "p-0" : "p-4 bg-[var(--cp-bg-2)] border border-[var(--cp-border)]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2.5">
        <div>
          <h3 className="text-foreground text-sm font-bold tracking-wider uppercase flex items-center gap-2">
            <Database size={15} className="text-[var(--cp-cyan)]" />
            App Variables (Database Key-Value Store)
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Database variables stored in <code className="text-[var(--cp-cyan)]">app_variables</code>. Values take priority over environment variables.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchVariables}
          disabled={loading}
          className="p-1.5 text-muted-foreground hover:text-foreground border border-[var(--cp-border)] bg-[var(--cp-bg-3)] cursor-pointer"
          title="Refresh variables"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-[var(--cp-cyan)]" : ""} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Standard Git Source Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {(["GITHUB_TOKEN", "GITLAB_TOKEN"] as const).map((tokenKey) => {
          const info = effective[tokenKey];
          const hasDb = info?.db_configured;
          const hasEnv = info?.env_configured;
          const activeSource = info?.source;

          return (
            <div
              key={tokenKey}
              className="p-2.5 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] rounded-none flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <span>{tokenKey}</span>
                  {activeSource === "db" ? (
                    <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 uppercase">
                      Active: Database
                    </span>
                  ) : activeSource === "env" ? (
                    <span className="text-[9px] px-1.5 py-0.2 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 uppercase">
                      Active: ENV
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.2 bg-zinc-500/20 border border-zinc-500/40 text-zinc-400 uppercase">
                      Not Configured
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground flex gap-2 mt-1">
                  <span className="flex items-center gap-1">
                    <Database size={10} className={hasDb ? "text-emerald-400" : "opacity-30"} />
                    DB: {hasDb ? "Configured" : "None"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Terminal size={10} className={hasEnv ? "text-cyan-400" : "opacity-30"} />
                    ENV: {hasEnv ? "Configured" : "None"}
                  </span>
                </div>
              </div>

              {!hasDb && (
                <button
                  type="button"
                  onClick={() => {
                    setNewKey(tokenKey);
                    setNewValue("");
                  }}
                  className="px-2 py-1 text-[10px] bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold hover:opacity-90 cursor-pointer uppercase shrink-0"
                >
                  Set in DB
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add New Variable Form */}
      <form onSubmit={handleAddOrUpdate} className="p-3 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] space-y-2.5">
        <div className="text-[11px] uppercase tracking-wider text-[var(--cp-cyan)] font-bold">
          Add / Update Variable
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="w-full sm:w-1/3">
            <input
              type="text"
              placeholder="KEY (e.g. GITHUB_TOKEN)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none font-mono"
            />
          </div>
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              placeholder="VALUE (e.g. ghp_xxxxxxxxxxxx)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="flex-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none font-mono"
            />
            <button
              type="submit"
              disabled={saving || !newKey.trim()}
              className="px-3 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer uppercase tracking-wider flex items-center gap-1.5 shrink-0"
            >
              <Plus size={13} />
              {saving ? "Saving..." : "Save KV"}
            </button>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
          <span>Presets:</span>
          {["GITHUB_TOKEN", "GITLAB_TOKEN"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setNewKey(k)}
              className="px-1.5 py-0.5 bg-[var(--cp-bg-1)] border border-[var(--cp-border)] hover:border-[var(--cp-cyan)] hover:text-foreground cursor-pointer"
            >
              {k}
            </button>
          ))}
        </div>
      </form>

      {/* Variables List */}
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold flex items-center justify-between">
          <span>Configured Database Variables ({varEntries.length})</span>
        </div>

        {varEntries.length === 0 ? (
          <div className="p-4 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-center text-muted-foreground text-xs">
            No variables stored in database. Add a key-value pair above.
          </div>
        ) : (
          <div className="border border-[var(--cp-border)] divide-y divide-[var(--cp-border)] bg-[var(--cp-bg-3)]">
            {varEntries.map(([key, value]) => {
              const isRevealed = revealedKeys[key];
              const isEditing = editingKey === key;
              const displayVal = isRevealed ? value : value ? "••••••••••••••••" : "<empty>";

              return (
                <div key={key} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--cp-bg-2)]/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[var(--cp-cyan)]">{key}</span>
                      <span className="text-[9px] px-1 py-0.2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 uppercase">
                        DB STORED
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className="flex-1 bg-[var(--cp-bg-1)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1 focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleInlineSave(key)}
                          className="px-2 py-1 text-[10px] bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer font-bold uppercase"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingKey(null)}
                          className="px-2 py-1 text-[10px] bg-[var(--cp-bg-1)] border border-[var(--cp-border)] text-foreground hover:bg-[var(--cp-bg-2)] cursor-pointer uppercase"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="text-[11px] text-foreground/80 mt-1 font-mono break-all flex items-center gap-2">
                        <span>{displayVal}</span>
                        {value && (
                          <button
                            type="button"
                            onClick={() => toggleReveal(key)}
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                            title={isRevealed ? "Hide value" : "Reveal value"}
                          >
                            {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingKey(key);
                          setEditingValue(value);
                        }}
                        className="px-2 py-1 text-[10px] bg-[var(--cp-bg-1)] border border-[var(--cp-border)] hover:border-[var(--cp-cyan)] text-foreground cursor-pointer uppercase"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(key)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-transparent hover:border-red-900/40 cursor-pointer"
                        title={`Remove ${key}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
