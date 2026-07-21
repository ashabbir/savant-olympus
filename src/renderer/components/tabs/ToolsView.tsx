import React, { useState, useEffect } from "react";
import { Wrench, Play, Trash2, Plus, ShieldCheck, ChevronLeft, ChevronRight, Download, AlertTriangle } from "lucide-react";
import { createToolsService, ToolDefinition } from "@/services/toolsService";
import { SearchBar } from "@/components/shared/SearchBar";

interface ToolsViewProps {
  serverUrl: string;
  apiKey: string;
  isAdmin: boolean;
}

export function ToolsView({ serverUrl, apiKey, isAdmin }: ToolsViewProps) {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);

  // Browser state
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [isToolPaneOpen, setIsToolPaneOpen] = useState(true);

  const toolsService = React.useMemo(() => createToolsService(serverUrl, apiKey), [serverUrl, apiKey]);

  const fetchTools = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setTools(await toolsService.listTools());
    } catch (e: any) {
      console.error(e);
      setTools([]);
      setLoadError(e?.message || "Unable to reach Savant server for tools.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, [toolsService]);

  const handleToolSelect = (tool: ToolDefinition) => {
    setSelectedTool(tool);
    setParams({});
    setResult(null);
  };

  const handleCallTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool) return;
    setIsCalling(true);
    setResult(null);
    try {
      const data = await toolsService.runTool(selectedTool.name, params);
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult(`ERROR: ${e.message}`);
    } finally {
      setIsCalling(false);
    }
  };

  const handleAddTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolName.trim()) return;
    setLoadError(null);
    try {
      const newTool = await toolsService.createTool({
        name: newToolName.trim(),
        description: newToolDesc.trim(),
        input_schema: { type: "object", properties: {} },
      });
      setTools(prev => [newTool, ...prev.filter(tool => tool.name !== newTool.name)]);
      setNewToolName("");
      setNewToolDesc("");
      setShowAddForm(false);
      setSelectedTool(newTool);
    } catch (error: any) {
      setLoadError(error.message || "Unable to create tool.");
    }
  };

  const handleDeleteTool = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadError(null);
    try {
      await toolsService.deleteTool(name);
      setTools(prev => prev.filter(t => t.name !== name));
      if (selectedTool?.name === name) setSelectedTool(null);
    } catch (error: any) {
      setLoadError(error.message || "Unable to delete tool.");
    }
  };

  const handleDownloadTool = async (name: string) => {
    setLoadError(null);
    try {
      const url = URL.createObjectURL(await toolsService.downloadArchive(name));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      setLoadError(error.message || "Unable to download tool.");
    }
  };

  const filteredTools = tools.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              MCP TOOLKIT
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/40 text-amber-400 tracking-wider">
              <AlertTriangle size={11} className="text-amber-400 animate-pulse" />
              UNDER CONSTRUCTION
            </span>
          </div>
          <p className="text-xs text-muted-foreground opacity-60">Meta-Cognitive Programming protocol registry & playground (In Development)</p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono rounded">
        <AlertTriangle size={14} className="text-amber-400 shrink-0 animate-pulse" />
        <span>
          <strong className="text-amber-400 font-bold">FEATURE UNDER CONSTRUCTION:</strong> Direct AI MCP Tool execution integration is in active development.
        </span>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Tools list sidebar / Browser */}
        <div className={`${isToolPaneOpen ? "w-80" : "w-11"} flex flex-col space-y-3 shrink-0 overflow-hidden transition-all duration-200`}>

          <div className="flex items-center justify-between">
            {isToolPaneOpen && <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">Available Tools</h3>}
            <div className="flex items-center gap-1">
              {isToolPaneOpen && isAdmin && (
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
                  className="px-2 py-0.5 border text-[10px] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] flex items-center gap-1 font-mono cursor-pointer"
                >
                  <Plus size={10} />
                  {showAddForm ? "CANCEL" : "ADD_TOOL"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsToolPaneOpen((open) => !open)}
                title={isToolPaneOpen ? "Collapse tools tree" : "Expand tools tree"}
                aria-label={isToolPaneOpen ? "Collapse tools tree" : "Expand tools tree"}
                className="h-6 w-6 inline-flex items-center justify-center border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
              >
                {isToolPaneOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>
          </div>

          {isToolPaneOpen ? (
            <>
              {showAddForm && (
                <form onSubmit={handleAddTool} className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-2.5 space-y-2">
                  <input
                    type="text"
                    placeholder="Tool Name (e.g. run_command)"
                    value={newToolName}
                    onChange={e => setNewToolName(e.target.value)}
                    className="w-full bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1 focus:outline-none font-mono"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={newToolDesc}
                    onChange={e => setNewToolDesc(e.target.value)}
                    className="w-full bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="w-full py-1 text-xs bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold font-mono hover:opacity-90 cursor-pointer"
                  >
                    CREATE_TOOL
                  </button>
                </form>
              )}

              {/* Search box */}
              <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search tools..." />

              <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2 space-y-2">
                {isLoading ? (
                  <div className="text-center py-6 text-xs text-[var(--cp-cyan)] animate-pulse">LOADING_REGISTRY...</div>
                ) : loadError ? (
                  <div className="text-center py-6 text-xs text-red-400 font-mono">{loadError}</div>
                ) : filteredTools.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground opacity-40">No tools found</div>
                ) : (
                  filteredTools.map((t) => (
                    <div
                      key={t.name}
                      onClick={() => handleToolSelect(t)}
                      className={`p-2.5 border cursor-pointer transition-all flex items-start justify-between group ${
                        selectedTool?.name === t.name
                          ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.05)]"
                          : "border-[var(--cp-border)] bg-[var(--cp-bg-2)] hover:border-[rgba(0,229,255,0.3)]"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold font-mono text-[var(--cp-cyan)] flex items-center gap-1">
                          <ShieldCheck size={11} className="text-[var(--cp-green)] shrink-0" />
                          <span className="truncate">{t.name}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground opacity-70 mt-1 line-clamp-2">{t.description}</p>
                      </div>
                      {isAdmin && <button
                        onClick={(e) => handleDeleteTool(t.name, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-[var(--cp-magenta)] hover:bg-red-950/20 transition-all cursor-pointer rounded shrink-0 ml-1.5"
                        title="Delete tool"
                      >
                        <Trash2 size={12} />
                      </button>}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex items-center justify-center">
              <span className="font-mono text-[10px] text-[var(--cp-cyan)] [writing-mode:vertical-rl] rotate-180 tracking-widest">
                TOOLS
              </span>
            </div>
          )}
        </div>

        {/* Tool Playground */}
        <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 flex flex-col overflow-y-auto">
          {selectedTool ? (
            <div className="space-y-4">
              <div className="border-b border-[var(--cp-border)] pb-2">
                <h3 className="text-sm font-bold text-foreground">{selectedTool.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{selectedTool.description}</p>
                <button
                  type="button"
                  onClick={() => handleDownloadTool(selectedTool.name)}
                  className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-[10px] border border-[var(--cp-border)] text-[var(--cp-cyan)] font-mono hover:bg-[rgba(0,229,255,0.08)]"
                >
                  <Download size={11} /> DOWNLOAD
                </button>
              </div>

              {selectedTool.source !== "postgresql" && <form onSubmit={handleCallTool} className="space-y-3">
                <h4 className="text-xs uppercase text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  Arguments
                </h4>
                {selectedTool.input_schema?.properties && Object.keys(selectedTool.input_schema.properties).length > 0 ? (
                  Object.keys(selectedTool.input_schema.properties).map((prop) => (
                    <div key={prop} className="flex flex-col space-y-1">
                      <label className="text-xs text-muted-foreground font-mono">
                        {prop} {selectedTool.input_schema?.required?.includes(prop) && <span className="text-[var(--cp-magenta)]">*</span>}
                      </label>
                      <input
                        type="text"
                        value={params[prop] || ""}
                        onChange={(e) => setParams({ ...params, [prop]: e.target.value })}
                        className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground opacity-60">No arguments schema specified.</p>
                )}

                <button
                  type="submit"
                  disabled={isCalling}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold hover:opacity-90 cursor-pointer disabled:opacity-55 font-mono"
                >
                  <Play size={12} />
                  {isCalling ? "CALLING..." : "EXECUTE"}
                </button>
              </form>}

              {result && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">
                    Execution Result
                  </h4>
                  <pre className="text-xs text-foreground/80 leading-relaxed bg-[var(--cp-bg-0)] p-3 border border-[var(--cp-border)] overflow-x-auto max-h-80 font-mono">
                    {result}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
              <Wrench size={48} className="text-muted-foreground mb-2" />
              <span className="text-xs tracking-widest font-mono text-[var(--section-label)] uppercase">
                select_tool_for_playground
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
