import React, { useState, useEffect } from "react";
import { Wrench, Sliders, Play, Trash2, Plus, Search, ShieldCheck } from "lucide-react";

interface Tool {
  name: string;
  description?: string;
  input_schema?: Record<string, any>;
  schema?: Record<string, any>;
}

interface ToolsViewProps {
  serverUrl: string;
  apiKey: string;
}

export function ToolsView({ serverUrl, apiKey }: ToolsViewProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  // Browser state
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");

  const baseUrl = serverUrl.replace(/\/+$/, "");

  const fetchTools = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/mcp/tools?_=${Date.now()}`, {
        headers: { "X-API-Key": apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.tools) ? data.tools : Array.isArray(data) ? data : [];
        setTools(list.length > 0 ? list : [
          { name: "get_current_workspace", description: "Detect current workspace info", input_schema: { type: "object", properties: {} } },
          { name: "list_workspaces", description: "List all workspaces in system", input_schema: { type: "object", properties: { status: { type: "string" } } } },
          { name: "search_ast", description: "Search Abstract Syntax Tree index", input_schema: { type: "object", properties: { query: { type: "string" } } } },
        ]);
      } else {
        // Fallback to simple tools list if not found
        setTools([
          { name: "get_current_workspace", description: "Detect current workspace info", input_schema: { type: "object", properties: {} } },
          { name: "list_workspaces", description: "List all workspaces in system", input_schema: { type: "object", properties: { status: { type: "string" } } } },
          { name: "search_ast", description: "Search Abstract Syntax Tree index", input_schema: { type: "object", properties: { query: { type: "string" } } } },
        ]);
      }
    } catch (e) {
      console.error(e);
      setTools([
        { name: "get_current_workspace", description: "Detect current workspace info", input_schema: { type: "object", properties: {} } },
        { name: "list_workspaces", description: "List all workspaces in system", input_schema: { type: "object", properties: { status: { type: "string" } } } },
        { name: "search_ast", description: "Search Abstract Syntax Tree index", input_schema: { type: "object", properties: { query: { type: "string" } } } },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, [baseUrl, apiKey]);

  const handleToolSelect = (tool: Tool) => {
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
      const res = await fetch(`${baseUrl}/api/mcp/tools/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          name: selectedTool.name,
          arguments: params,
        }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setResult(`ERROR: ${e.message}`);
    } finally {
      setIsCalling(false);
    }
  };

  const handleAddTool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolName.trim()) return;
    const newTool: Tool = {
      name: newToolName.trim(),
      description: newToolDesc.trim(),
      input_schema: { type: "object", properties: {} }
    };
    setTools(prev => [newTool, ...prev]);
    setNewToolName("");
    setNewToolDesc("");
    setShowAddForm(false);
    setSelectedTool(newTool);
  };

  const handleDeleteTool = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTools(prev => prev.filter(t => t.name !== name));
    if (selectedTool?.name === name) {
      setSelectedTool(null);
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
          <h2 className="text-lg font-medium text-[var(--cp-cyan)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            // MCP TOOLKIT
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">Meta-Cognitive Programming protocol registry & playground</p>
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Tools list sidebar / Browser */}
        <div className="w-80 flex flex-col space-y-3 shrink-0">

          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider font-mono">// Available Tools</h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
              className="px-2 py-0.5 border text-[10px] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] flex items-center gap-1 font-mono cursor-pointer"
            >
              <Plus size={10} />
              {showAddForm ? "CANCEL" : "ADD_TOOL"}
            </button>
          </div>

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
          <div className="flex items-center gap-1.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2 py-1">
            <Search size={11} className="text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-foreground text-xs focus:outline-none w-full font-mono"
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2 space-y-2">
            {isLoading ? (
              <div className="text-center py-6 text-xs text-[var(--cp-cyan)] animate-pulse">LOADING_REGISTRY...</div>
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
                  <button
                    onClick={(e) => handleDeleteTool(t.name, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[var(--cp-magenta)] hover:bg-red-950/20 transition-all cursor-pointer rounded shrink-0 ml-1.5"
                    title="Delete tool"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tool Playground */}
        <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 flex flex-col overflow-y-auto">
          {selectedTool ? (
            <div className="space-y-4">
              <div className="border-b border-[var(--cp-border)] pb-2">
                <h3 className="text-sm font-bold text-foreground">{selectedTool.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{selectedTool.description}</p>
              </div>

              <form onSubmit={handleCallTool} className="space-y-3">
                <h4 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  // Arguments
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
              </form>

              {result && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider font-mono">
                    // Execution Result
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
              <span className="text-xs tracking-widest font-mono text-[var(--cp-cyan)] uppercase">
                select_tool_for_playground
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
