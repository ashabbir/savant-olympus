import React, { useState, useEffect } from "react";
import { Cpu, Save, Plus, Trash2, Shield, RefreshCcw, Sparkles, Folder, FileText, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { createAbilitiesService } from "../../services/abilitiesService";
import { SearchBar } from "../shared/SearchBar";
import { ViewHeader } from "../shared/ViewHeader";
import { StatusBadge } from "../shared/StatusBadge";
import { ModalBackdrop } from "../shared/ModalBackdrop";

interface AbilityAsset {
  id: string;
  type: string;
  name?: string;
  priority: number;
  tags: string[];
  includes?: string[];
  body?: string;
  path?: string;
}

interface AbilitiesViewProps {
  serverUrl: string;
  apiKey: string;
  isAdmin: boolean;
}

export function AbilitiesView({ serverUrl, apiKey, isAdmin }: AbilitiesViewProps) {
  const [assets, setAssets] = useState<Record<string, AbilityAsset[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AbilityAsset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAssetPaneOpen, setIsAssetPaneOpen] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "type:persona": true,
    "type:rule": true,
  });

  const abilitiesService = createAbilitiesService(serverUrl, apiKey);


  // Edit fields
  const [editBody, setEditBody] = useState("");
  const [editPriority, setEditPriority] = useState(900);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editIncludes, setEditIncludes] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newIncludeInput, setNewIncludeInput] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // New Asset Form
  const [showNewModal, setShowNewModal] = useState(false);
  const [newId, setNewId] = useState("");
  const [newType, setNewType] = useState("rule");
  const [newPriority, setNewPriority] = useState(900);
  const [newTagsString, setNewTagsString] = useState("");

  // Resolution Builder
  const [showBuilder, setShowBuilder] = useState(false);
  const [buildPersona, setBuildPersona] = useState("");
  const [buildRepo, setBuildRepo] = useState("");
  const [buildTags, setBuildTags] = useState<string[]>(["backend", "frontend"]);
  const [newBuildTag, setNewBuildTag] = useState("");
  const [resolutionResult, setResolutionResult] = useState<{ manifest?: any; prompt?: string } | null>(null);

  const fetchAssets = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      setAssets(await abilitiesService.listAssets());
    } catch (e: any) {
      console.error("fetchAssets failed:", e);
      setAssets({});
      setLoadError(e?.message || "Unable to reach Savant server for ability assets.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, [serverUrl, apiKey]);

  const loadAsset = async (id: string) => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    try {
      const asset: AbilityAsset = await abilitiesService.readAsset(id);
      setSelectedId(id);
      setSelectedAsset(asset);
      setEditBody(asset.body || "");
      setEditPriority(asset.priority);
      setEditTags(asset.tags || []);
      setEditIncludes(asset.includes || []);
      setIsDirty(false);
    } catch (e) {
      console.error("loadAsset failed:", e);
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      const payload = {
        priority: editPriority,
        tags: editTags,
        includes: editIncludes,
        body: editBody,
      };
      await abilitiesService.updateAsset(selectedId, payload);
      setIsDirty(false);
      await fetchAssets();
    } catch (e: any) {
      alert(`Save error: ${e.message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Delete ${selectedId}? This cannot be undone.`)) return;
    try {
      await abilitiesService.deleteAsset(selectedId);
      setSelectedId(null);
      setSelectedAsset(null);
      setIsDirty(false);
      await fetchAssets();
    } catch (e: any) {
      alert(`Delete error: ${e.message}`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId.trim()) return;
    try {
      const tags = newTagsString.split(",").map(t => t.trim()).filter(Boolean);
      const payload = {
        id: newId.trim(),
        type: newType,
        priority: newPriority,
        tags,
        body: `# ${newId.split(".").pop()}\n\nContent here...\n`,
      };
      await abilitiesService.createAsset(payload);
      setNewId("");
      setNewTagsString("");
      setShowNewModal(false);
      await fetchAssets();
      await loadAsset(payload.id);
    } catch (e: any) {
      alert(`Create error: ${e.message}`);
    }
  };

  const handleResolve = async () => {
    if (!buildPersona) {
      alert("Select a persona first");
      return;
    }
    try {
      const payload = {
        persona: buildPersona,
        tags: buildTags,
        repo_id: buildRepo || undefined,
      };
      setResolutionResult(await abilitiesService.resolve(payload));
    } catch (e: any) {
      alert(`Resolve failed: ${e.message}`);
    }
  };

  const handleBootstrap = async () => {
    try {
      await abilitiesService.bootstrap();
      await fetchAssets();
    } catch (e) {
      console.error(e);
    }
  };

  const handleValidate = async () => {
    try {
      const data = await abilitiesService.validate();
      alert(data.ok ? "✓ Assets valid!" : `Validation failed: ${data.error}`);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const handleVal = () => handleValidate();
    const handleBoot = () => handleBootstrap();
    const handleResolveToggle = () => setShowBuilder(prev => !prev);
    window.addEventListener("abilities-validate", handleVal);
    window.addEventListener("abilities-bootstrap", handleBoot);
    window.addEventListener("abilities-resolver-toggle", handleResolveToggle);
    return () => {
      window.removeEventListener("abilities-validate", handleVal);
      window.removeEventListener("abilities-bootstrap", handleBoot);
      window.removeEventListener("abilities-resolver-toggle", handleResolveToggle);
    };
  }, [serverUrl, apiKey]);

  const toggleNode = (node: string) => {
    setExpandedNodes(prev => ({ ...prev, [node]: !prev[node] }));
  };

  // Chips manipulation
  const addTag = () => {
    if (!newTagInput.trim()) return;
    setEditTags(prev => [...prev, newTagInput.trim()]);
    setNewTagInput("");
    setIsDirty(true);
  };
  const removeTag = (index: number) => {
    setEditTags(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const addInclude = () => {
    if (!newIncludeInput.trim()) return;
    setEditIncludes(prev => [...prev, newIncludeInput.trim()]);
    setNewIncludeInput("");
    setIsDirty(true);
  };
  const removeInclude = (index: number) => {
    setEditIncludes(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const typeOrder = ["persona", "rule", "policy", "style", "repo"];
  const typeIcons: Record<string, string> = {
    persona: "🎭",
    rule: "📏",
    policy: "📋",
    style: "🎨",
    repo: "💾"
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            ABILITIES
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">System abilities & custom AI prompt builder</p>
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Left Side: Asset Browser */}
        <div className={`${isAssetPaneOpen ? "w-80" : "w-11"} flex flex-col space-y-3 shrink-0 overflow-hidden transition-all duration-200`}>

          <div className="flex items-center justify-between">
            {isAssetPaneOpen && <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">Asset Trees</h3>}
            <div className="flex items-center gap-1">
              {isAssetPaneOpen && isAdmin && (
                <button
                  onClick={() => setShowNewModal(true)}
                  className="px-2 py-0.5 border text-[10px] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] flex items-center gap-1 font-mono cursor-pointer"
                  style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
                >
                  <Plus size={10} /> NEW_ASSET
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsAssetPaneOpen((open) => !open)}
                title={isAssetPaneOpen ? "Collapse asset tree" : "Expand asset tree"}
                aria-label={isAssetPaneOpen ? "Collapse asset tree" : "Expand asset tree"}
                className="h-6 w-6 inline-flex items-center justify-center border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
              >
                {isAssetPaneOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>
          </div>

          {isAssetPaneOpen ? (
            <>
              <div className="flex items-center gap-1.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2 py-1">
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none text-foreground text-xs focus:outline-none w-full font-mono"
                />
              </div>

              <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2 space-y-1">
                {isLoading ? (
                  <div className="text-center py-6 text-xs text-[var(--cp-cyan)] animate-pulse">LOADING_REGISTRY...</div>
                ) : loadError ? (
                  <div className="text-center py-6 text-xs text-red-400 font-mono">{loadError}</div>
                ) : (
                  typeOrder.map(type => {
                let items = assets[type] || [];
                if (searchQuery) {
                  items = items.filter(a =>
                    a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (a.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (a.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
                  );
                }
                if (items.length === 0 && searchQuery) return null;

                const nodeKey = `type:${type}`;
                const isExpanded = expandedNodes[nodeKey] || !!searchQuery;

                return (
                  <div key={type} className="space-y-1">
                    <div
                      onClick={() => toggleNode(nodeKey)}
                      className="flex items-center justify-between p-1.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)]/50 hover:border-[var(--cp-cyan)]/30 text-xs font-mono text-[var(--cp-cyan)] cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{isExpanded ? "▼" : "▶"}</span>
                        <span>{typeIcons[type] || "📄"}</span>
                        <span>{type.toUpperCase()}S</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">{items.length}</span>
                    </div>

                    {isExpanded && (
                      <div className="pl-4 space-y-1">
                        {items.map(item => (
                          <div
                            key={item.id}
                            onClick={() => loadAsset(item.id)}
                            className={`p-1.5 border text-xs font-mono cursor-pointer flex items-center justify-between group ${
                              selectedId === item.id
                                ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.05)] text-[var(--cp-cyan)]"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-[var(--cp-bg-3)]"
                            }`}
                          >
                            <span className="truncate flex items-center gap-1">
                              <FileText size={11} className="shrink-0" />
                              {item.name || item.id.split(".").pop()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex items-center justify-center">
              <span className="font-mono text-[10px] text-[var(--cp-cyan)] [writing-mode:vertical-rl] rotate-180 tracking-widest">
                ASSETS
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Workspace Resolution or Editor */}
        {showBuilder ? (
          <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 flex flex-col space-y-4 overflow-y-auto">
            <div className="border-b border-[var(--cp-border)] pb-2 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-foreground font-mono flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[var(--cp-cyan)]" /> PROMPT RESOLVER BUILDER
                </h3>
                <p className="text-[10px] text-muted-foreground font-mono">Compile manifest & resolve engineering prompt for active session</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase font-mono">Persona ID</label>
                <select
                  value={buildPersona}
                  onChange={e => setBuildPersona(e.target.value)}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-1.5 focus:outline-none font-mono"
                >
                  <option value="">(Select Persona)</option>
                  {(assets.persona || []).map(p => (
                    <option key={p.id} value={p.id.replace("persona.", "")}>{p.id}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase font-mono">Repo ID (Hint)</label>
                <input
                  type="text"
                  placeholder="e.g. savant-server"
                  value={buildRepo}
                  onChange={e => setBuildRepo(e.target.value)}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-1.5 focus:outline-none font-mono"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase font-mono">Add Tag Filter</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="tag"
                    value={newBuildTag}
                    onChange={e => setNewBuildTag(e.target.value)}
                    className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-1 focus:outline-none font-mono flex-1"
                  />
                  <button
                    onClick={() => {
                      if (newBuildTag.trim()) {
                        setBuildTags(prev => [...prev, newBuildTag.trim()]);
                        setNewBuildTag("");
                      }
                    }}
                    className="px-2 py-0.5 border text-xs text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] font-mono cursor-pointer"
                    style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
                  >
                    ADD
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {buildTags.map((t, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] px-2 py-0.5 text-[10px] font-mono text-foreground">
                  {t}
                  <button
                    onClick={() => setBuildTags(prev => prev.filter((_, i) => i !== idx))}
                    className="text-[var(--cp-magenta)] hover:text-red-400 font-bold ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <button
              onClick={handleResolve}
              className="py-1.5 text-xs bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold font-mono hover:opacity-90 cursor-pointer"
            >
              RESOLVE PROMPT
            </button>

            {resolutionResult && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs text-[var(--section-label)] font-mono uppercase tracking-wider">Resolution Manifest</h4>
                <div className="p-3 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
                  <div>Applied Persona: <code>{resolutionResult.manifest?.applied?.persona || buildPersona}</code></div>
                  <div>Applied Rules: <code>{JSON.stringify(resolutionResult.manifest?.applied?.rules || [])}</code></div>
                  <div>Applied Policies: <code>{JSON.stringify(resolutionResult.manifest?.applied?.policies || [])}</code></div>
                </div>

                <h4 className="text-xs text-[var(--section-label)] font-mono uppercase tracking-wider">
                  <label htmlFor="resolved-prompt-text">Rendered Engineering Prompt</label>
                </h4>
                <textarea
                  id="resolved-prompt-text"
                  readOnly
                  value={resolutionResult.prompt || ""}
                  className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-3 font-mono h-40 focus:outline-none"
                />
              </div>
            )}
          </div>
        ) : selectedAsset ? (
          <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 flex flex-col space-y-4 overflow-y-auto">
            <div className="border-b border-[var(--cp-border)] pb-2 flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-foreground font-mono flex items-center gap-1.5">
                  <FileText size={14} className="text-[var(--cp-cyan)]" /> {selectedAsset.id}
                </h3>
                <p className="text-[10px] text-muted-foreground font-mono">Asset Type: {selectedAsset.type.toUpperCase()}</p>
              </div>
              {isAdmin && <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  className="px-2 py-1 border border-red-500/30 text-[10px] text-[var(--cp-magenta)] hover:bg-red-950/20 flex items-center gap-1 font-mono cursor-pointer"
                >
                  <Trash2 size={10} /> DELETE
                </button>
                <button
                  onClick={handleSave}
                  className="px-2.5 py-1 border border-[var(--cp-cyan)] text-[10px] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] flex items-center gap-1 font-mono cursor-pointer"
                >
                  <Save size={10} /> SAVE
                </button>
              </div>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase font-mono">Priority (Priority order value)</label>
                <input
                  type="number"
                  value={editPriority}
                  onChange={e => {
                    setEditPriority(parseInt(e.target.value) || 900);
                    setIsDirty(true);
                  }}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-1.5 focus:outline-none font-mono"
                />
              </div>

              {/* Tags manipulation */}
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase font-mono">Add Tag</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addTag()}
                    className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-1 focus:outline-none font-mono flex-1"
                  />
                  <button
                    onClick={addTag}
                    className="px-2 py-0.5 border text-xs text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] font-mono cursor-pointer"
                    style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
                  >
                    ADD
                  </button>
                </div>
              </div>

              {/* Includes manipulation */}
              <div className="flex flex-col space-y-1 relative">
                <label className="text-[10px] text-muted-foreground uppercase font-mono">Add Include Link</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newIncludeInput}
                    onChange={e => setNewIncludeInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addInclude()}
                    className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-1 focus:outline-none font-mono flex-1"
                    placeholder="Search asset dependencies..."
                  />
                  <button
                    onClick={addInclude}
                    className="px-2 py-0.5 border text-xs text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] font-mono cursor-pointer"
                    style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
                  >
                    ADD
                  </button>
                </div>

                {/* Type-ahead dropdown */}
                {newIncludeInput.trim() !== "" && (
                  (() => {
                    const allAssetIds = Object.values(assets).flat().map(a => a.id);
                    const matches = allAssetIds.filter(id => 
                      id.toLowerCase().includes(newIncludeInput.toLowerCase()) &&
                      !editIncludes.includes(id)
                    ).slice(0, 5);

                    if (matches.length === 0) return null;

                    return (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--cp-bg-3)] border border-[var(--cp-cyan)] z-30 max-h-36 overflow-y-auto font-mono text-xs">
                        {matches.map(matchId => (
                          <div
                            key={matchId}
                            onClick={() => {
                              setEditIncludes(prev => [...prev, matchId]);
                              setNewIncludeInput("");
                              setIsDirty(true);
                            }}
                            className="p-1.5 hover:bg-[var(--cp-cyan)] hover:text-[var(--cp-bg-0)] cursor-pointer truncate"
                          >
                            {matchId}
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Tags and Includes Displays */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Active Tags</span>
                <div className="flex flex-wrap gap-1.5 min-h-[30px] p-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)]">
                  {editTags.map((t, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] px-2 py-0.5 text-[10px] font-mono text-foreground">
                      {t}
                      <button onClick={() => removeTag(idx)} className="text-[var(--cp-magenta)] hover:text-red-400 font-bold ml-1">×</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Linked Asset Dependencies</span>
                <div className="flex flex-wrap gap-1.5 min-h-[30px] p-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)]">
                  {editIncludes.map((inc, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] px-2 py-0.5 text-[10px] font-mono text-foreground">
                      {inc}
                      <button onClick={() => removeInclude(idx)} className="text-[var(--cp-magenta)] hover:text-red-400 font-bold ml-1">×</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-1 flex-1 min-h-[200px]">
              <label htmlFor="edit-body-blueprint" className="text-[10px] text-muted-foreground uppercase font-mono">Body Prompt Blueprint</label>
              <textarea
                id="edit-body-blueprint"
                value={editBody}
                onChange={e => {
                  setEditBody(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs p-3 focus:outline-none font-mono flex-1 min-h-[150px] resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 border border-[var(--cp-border)] bg-[var(--cp-bg-1)]">
            <Cpu size={48} className="text-muted-foreground mb-2" />
            <span className="text-xs tracking-widest font-mono text-[var(--section-label)] uppercase">
              select_ability_to_build_prompt
            </span>
          </div>
        )}
      </div>

      {/* New Asset Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-4 space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2">
              <h3 className="text-sm font-bold text-[var(--section-label)] font-mono">NEW ABILITY ASSET</h3>
              <button onClick={() => setShowNewModal(false)} className="text-muted-foreground hover:text-foreground">×</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 font-mono text-xs">
              <div className="flex flex-col space-y-1">
                <label className="text-muted-foreground uppercase">Asset ID (e.g. rule.js_naming)</label>
                <input
                  type="text"
                  required
                  placeholder="rule.identifier"
                  value={newId}
                  onChange={e => setNewId(e.target.value)}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground p-1.5 focus:outline-none"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-muted-foreground uppercase">Type</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground p-1.5 focus:outline-none"
                >
                  <option value="persona">PERSONA</option>
                  <option value="rule">RULE</option>
                  <option value="policy">POLICY</option>
                  <option value="style">STYLE</option>
                  <option value="repo">REPO</option>
                </select>
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-muted-foreground uppercase">Priority</label>
                <input
                  type="number"
                  value={newPriority}
                  onChange={e => setNewPriority(parseInt(e.target.value) || 900)}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground p-1.5 focus:outline-none"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-muted-foreground uppercase">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. backend, node, typescript"
                  value={newTagsString}
                  onChange={e => setNewTagsString(e.target.value)}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground p-1.5 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1 border border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold"
                >
                  CREATE_ASSET
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
