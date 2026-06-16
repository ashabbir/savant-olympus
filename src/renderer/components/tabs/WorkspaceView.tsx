import React, { useState, useEffect } from "react";
import { Wrench, Play, CheckCircle, AlertTriangle, RefreshCcw } from "lucide-react";

interface ParamDef {
  key: string;
  label: string;
  default: string;
  type?: "select";
  options?: string[];
}

interface McpTool {
  name: string;
  desc: string;
  icon: string;
  params: ParamDef[];
}

const MCP_WORKSPACES_TOOLS: McpTool[] = [
  { name: "get_current_workspace", desc: "Auto-detect workspace for this session", icon: "🧭", params: [
    { key: "session_id", label: "Session ID", default: "" }
  ]},
  { name: "list_workspaces", desc: "List all workspaces (open/closed/all)", icon: "📋", params: [
    { key: "status", label: "Status", default: "open", type: "select", options: ["open", "closed", "all"] }
  ]},
  { name: "create_workspace", desc: "Create a new workspace", icon: "🏗️", params: [
    { key: "name", label: "Name", default: "" },
    { key: "description", label: "Description", default: "" },
    { key: "priority", label: "Priority", default: "medium", type: "select", options: ["critical", "high", "medium", "low"] }
  ]},
  { name: "get_workspace", desc: "Get workspace by ID or name", icon: "🔍", params: [
    { key: "workspace_id", label: "Workspace ID", default: "" },
    { key: "name", label: "Or Name", default: "" }
  ]},
  { name: "list_tasks", desc: "List tasks for a workspace", icon: "📝", params: [
    { key: "workspace_id", label: "Workspace ID", default: "" },
    { key: "status", label: "Status", default: "all", type: "select", options: ["all", "todo", "in-progress", "done", "blocked"] },
    { key: "date", label: "Date (YYYY-MM-DD)", default: "" }
  ]},
  { name: "create_task", desc: "Create a task in a workspace", icon: "➕", params: [
    { key: "title", label: "Title", default: "" },
    { key: "description", label: "Description", default: "" },
    { key: "priority", label: "Priority", default: "medium", type: "select", options: ["critical", "high", "medium", "low"] },
    { key: "status", label: "Status", default: "todo", type: "select", options: ["todo", "in-progress", "done", "blocked"] },
    { key: "workspace_id", label: "Workspace ID", default: "" }
  ]},
  { name: "update_task", desc: "Update a task", icon: "✏️", params: [
    { key: "task_id", label: "Task ID", default: "" },
    { key: "status", label: "Status", default: "", type: "select", options: ["", "todo", "in-progress", "done", "blocked"] },
    { key: "title", label: "Title", default: "" },
    { key: "priority", label: "Priority", default: "", type: "select", options: ["", "critical", "high", "medium", "low"] }
  ]},
  { name: "complete_task", desc: "Mark a task as done", icon: "✅", params: [
    { key: "task_id", label: "Task ID", default: "" }
  ]},
  { name: "get_next_task", desc: "Get highest-priority actionable task", icon: "🎯", params: [
    { key: "workspace_id", label: "Workspace ID", default: "" }
  ]},
  { name: "list_merge_requests", desc: "List merge requests in workspace", icon: "🔀", params: [
    { key: "workspace_id", label: "Workspace ID", default: "" },
    { key: "status", label: "Status", default: "" }
  ]},
  { name: "create_session_note", desc: "Add a note to current session", icon: "📝", params: [
    { key: "text", label: "Note text", default: "" },
    { key: "session_id", label: "Session ID", default: "" }
  ]},
  { name: "list_session_notes", desc: "List notes for current session", icon: "📋", params: [
    { key: "session_id", label: "Session ID", default: "" }
  ]},
  { name: "list_jira_tickets", desc: "List Jira tickets in workspace", icon: "🎫", params: [
    { key: "workspace_id", label: "Workspace ID", default: "" },
    { key: "status", label: "Status", default: "" }
  ]},
];

interface WorkspaceViewProps {
  serverUrl: string;
  apiKey: string;
  sessionId?: string | null;
}

export function WorkspaceView({ serverUrl, apiKey, sessionId }: WorkspaceViewProps) {
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [mcpOnline, setMcpOnline] = useState<boolean | null>(null);
  const [mcpStatusText, setMcpStatusText] = useState("Checking...");
  const [isRunning, setIsRunning] = useState(false);

  const baseUrl = serverUrl.replace(/\/+$/, "");

  const testMcpConnection = async () => {
    try {
      setMcpStatusText("Checking...");
      const res = await fetch(`${baseUrl}/api/mcp/health/workspace`, {
        headers: { "X-API-Key": apiKey }
      });
      const data = await res.json();
      const isUp = !!(data && (data.ok || data.status === "ok" || data.alive));
      setMcpOnline(isUp);
      setMcpStatusText(isUp ? "Online" : "Offline");
    } catch (e) {
      setMcpOnline(false);
      setMcpStatusText("Offline");
    }
  };

  useEffect(() => {
    testMcpConnection();
  }, [baseUrl, apiKey]);

  const handleToolSelect = (tool: McpTool) => {
    setSelectedTool(tool);
    const initialParams: Record<string, string> = {};
    tool.params.forEach(p => {
      initialParams[p.key] = p.default;
    });
    setParams(initialParams);
    setResult(null);
  };

  const handleParamChange = (key: string, value: string) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleRunTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTool) return;
    setResult(null);
    setIsRunning(true);

    try {
      let port = 8091;
      try {
        const res = await fetch(`${baseUrl}/api/mcp/health/workspace`, {
          headers: { "X-API-Key": apiKey }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.port) port = data.port;
        }
      } catch (err) {
        console.error("Failed to query port dynamically, using default 8091:", err);
      }

      const formattedArguments: Record<string, any> = {};
      selectedTool.params.forEach(p => {
        const value = params[p.key] || "";
        if (p.type === "select") {
          formattedArguments[p.key] = value;
        } else if (/^\d+$/.test(value)) {
          formattedArguments[p.key] = parseInt(value, 10);
        } else {
          formattedArguments[p.key] = value;
        }
      });

      const urlObj = new URL(baseUrl);
      const host = urlObj.hostname;
      const protocol = urlObj.protocol;

      const runResult = await new Promise<any>((resolve, reject) => {
        const sseUrl = `${protocol}//${host}:${port}/sse?api_key=${encodeURIComponent(apiKey)}&session_id=${encodeURIComponent(sessionId || "default")}`;
        const eventSource = new EventSource(sseUrl);
        let messageUrl = "";
        let requestId = 1;
        let initId = 2;

        const cleanUp = () => {
          eventSource.close();
        };

        const timeout = setTimeout(() => {
          cleanUp();
          reject(new Error("Timeout waiting for MCP execution results"));
        }, 15000);

        eventSource.addEventListener("endpoint", (ev: any) => {
          messageUrl = `${protocol}//${host}:${port}${ev.data}`;
          
          const initPayload = {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "savant-olympus-client", version: "1.0.0" }
            }
          };

          fetch(messageUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(initPayload)
          }).catch(err => {
            clearTimeout(timeout);
            cleanUp();
            reject(err);
          });
        });

        eventSource.addEventListener("message", async (ev: any) => {
          try {
            const response = JSON.parse(ev.data);
            if (response.id === initId) {
              const callPayload = {
                jsonrpc: "2.0",
                id: requestId,
                method: "tools/call",
                params: {
                  name: selectedTool.name,
                  arguments: formattedArguments
                }
              };

              fetch(messageUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(callPayload)
              }).catch(err => {
                clearTimeout(timeout);
                cleanUp();
                reject(err);
              });
            } else if (response.id === requestId) {
              clearTimeout(timeout);
              cleanUp();
              if (response.error) {
                reject(new Error(response.error.message || JSON.stringify(response.error)));
              } else {
                resolve(response.result);
              }
            }
          } catch (err) {
            console.error("SSE message parse failed:", err);
          }
        });

        eventSource.onerror = () => {
          clearTimeout(timeout);
          cleanUp();
          reject(new Error("SSE endpoint connection failed. Make sure savant-server is running."));
        };
      });

      setResult(JSON.stringify(runResult, null, 2));

    } catch (err: any) {
      setResult(JSON.stringify({ error: err.message || "Execution error" }, null, 2));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3 shrink-0">
        <div>
          <h2 className="text-lg font-medium text-[var(--cp-cyan)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            // MCP SERVER: SAVANT-WORKSPACE
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">
            Control center for workspaces, tasks, Jira tickets, and merge requests telemetry.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${mcpOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : mcpOnline === false ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" : "bg-yellow-500 animate-pulse"}`} />
            <span className="opacity-70">STATUS:</span>
            <span className={mcpOnline ? "text-green-400" : mcpOnline === false ? "text-red-400" : "text-yellow-400"}>
              {mcpStatusText.toUpperCase()}
            </span>
          </div>
          <button
            onClick={testMcpConnection}
            className="p-1 border border-[var(--cp-border)] hover:bg-white/5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <RefreshCcw size={12} />
          </button>
        </div>
      </div>

      {/* Main View Grid */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Tools List */}
        <div className="w-80 flex flex-col border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2 overflow-y-auto shrink-0">

          <div className="text-[10px] text-muted-foreground font-mono px-2 py-1 mb-2 border-b border-[var(--cp-border)]">
            AVAILABLE_MCP_TOOLS ({MCP_WORKSPACES_TOOLS.length})
          </div>
          <div className="space-y-1.5">
            {MCP_WORKSPACES_TOOLS.map((tool) => {
              const isSelected = selectedTool?.name === tool.name;
              return (
                <div
                  key={tool.name}
                  onClick={() => handleToolSelect(tool)}
                  className={`p-2 border cursor-pointer transition-all ${
                    isSelected
                      ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.05)]"
                      : "border-[var(--cp-border)] bg-[var(--cp-bg-2)] hover:border-[rgba(0,229,255,0.2)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground mb-1">
                    <span>{tool.icon}</span>
                    <span>{tool.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground opacity-70 leading-normal">{tool.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Playground area */}
        <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 overflow-y-auto">
          {selectedTool ? (
            <div className="space-y-4">
              <div className="border-b border-[var(--cp-border)] pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{selectedTool.icon}</span>
                  <h3 className="text-md font-bold text-foreground font-mono">{selectedTool.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground opacity-80">{selectedTool.desc}</p>
              </div>

              <form onSubmit={handleRunTool} className="space-y-4">
                {selectedTool.params.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-[var(--cp-cyan)] tracking-wider uppercase font-mono">// PARAMETERS</h4>
                    <div className="grid grid-cols-1 gap-3 bg-[var(--cp-bg-2)] p-3 border border-[var(--cp-border)]">
                      {selectedTool.params.map((p) => (
                        <div key={p.key} className="flex flex-col space-y-1">
                          <label className="text-xs text-muted-foreground font-mono">{p.label || p.key}</label>
                          {p.type === "select" ? (
                            <select
                              value={params[p.key] || ""}
                              onChange={(e) => handleParamChange(p.key, e.target.value)}
                              className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)]"
                            >
                              {(p.options || []).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={params[p.key] || ""}
                              onChange={(e) => handleParamChange(p.key, e.target.value)}
                              className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground font-mono bg-[var(--cp-bg-2)] p-3 border border-[var(--cp-border)]">
                    No parameters required for this tool.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isRunning}
                  className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase tracking-wider hover:opacity-90 flex items-center gap-1.5 cursor-pointer font-mono disabled:opacity-50"
                >
                  <Play size={12} className={isRunning ? "animate-pulse" : ""} /> {isRunning ? "EXECUTING..." : "RUN_TOOL"}
                </button>
              </form>

              {result && (
                <div className="space-y-2 pt-2 border-t border-[var(--cp-border)]">
                  <h4 className="text-xs font-semibold text-[var(--cp-cyan)] tracking-wider uppercase font-mono">// EXECUTION_RESULT</h4>
                  <pre className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs p-3 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {result}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
              <Wrench size={48} className="text-muted-foreground mb-2" />
              <span className="text-xs tracking-widest font-mono text-[var(--cp-cyan)] uppercase">
                select_mcp_tool_to_explore
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
