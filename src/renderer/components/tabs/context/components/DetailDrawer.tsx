import React, { useEffect, useRef, useState } from "react";
import { Trash2, Sparkles, Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { AthenaMessage } from "@/components/shared/AthenaMessage";
import { AthenaConversationExport, AthenaMessageExportActions } from "@/components/shared/AthenaExportActions";
import { buildAthenaConversationPrompt, ensureAthenaMcpSummary } from "@/services/athenaService";
import { Finding } from "../types";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

export function DetailDrawer({
  selectedNode,
  isOpen,
  onClose,
  onToggleCollapse,
  findings = [],
  repoName,
  serverUrl = "http://127.0.0.1:3100",
  apiKey = "",
  visualization = "Complexity Tree",
  screenContext,
}: {
  selectedNode: any;
  isOpen: boolean;
  onClose: () => void;
  onToggleCollapse: (id: string, isCollapsed: boolean) => void;
  findings?: Finding[];
  repoName: string;
  serverUrl?: string;
  apiKey?: string;
  visualization?: "Complexity Tree" | "Radial Complexity" | "Radial Cluster";
  screenContext?: Record<string, unknown>;
}) {
  if (!isOpen || !selectedNode) return null;

  const nodeData = selectedNode.data || selectedNode;
  const id = nodeData.id;
  const name = nodeData.name || "Unknown";
  const type = nodeData.type || nodeData.node_type || "node";
  const line = nodeData.line || nodeData.start_line;
  const endLine = nodeData.endLine || nodeData.end_line;
  const filePath = nodeData.path || nodeData.id;
  const complexity = nodeData.complexity || nodeData.total || 0;
  const childCount = nodeData.child_count || 0;
  const descCount = selectedNode.descendants ? selectedNode.descendants().length - 1 : 0;
  const nestedCount = childCount || descCount;
  const lineSpan = (line && endLine) ? (endLine - line + 1) : 0;

  const isCollapsed = !!selectedNode._children;
  const canCollapse = (selectedNode.children && selectedNode.children.length > 0) || (selectedNode._children && selectedNode._children.length > 0);

  const nodePath = nodeData.path || (type === "file" ? nodeData.id : "");
  const nodeFindings = findings.filter((f) => {
    if (type === "file") return f.path === nodePath;
    if (type === "dir" || type === "repo") return f.path.startsWith(nodePath);
    return f.path === nodePath && f.line >= line && f.line <= (endLine || line);
  });

  const getGrade = (cx: number) => {
    if (cx <= 5) return { grade: "A", label: "Low", color: "#4ade80", advisory: "Clean and maintainable" };
    if (cx <= 10) return { grade: "B", label: "Moderate", color: "#a3e635", advisory: "Acceptable — monitor growth" };
    if (cx <= 20) return { grade: "C", label: "Risky", color: "#facc15", advisory: "Consider refactoring into smaller units" };
    if (cx <= 35) return { grade: "D", label: "High", color: "#fb923c", advisory: "High risk — refactor strongly advised" };
    return { grade: "F", label: "Very High", color: "#f87171", advisory: "Very high — refactor strongly advised" };
  };

  const gradeInfo = getGrade(complexity);

  const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
    repo: { icon: "📦", label: "REPOSITORY", color: "#22d3ee" },
    dir: { icon: "📁", label: "DIRECTORY", color: "#a78bfa" },
    file: { icon: "📄", label: "FILE", color: "#4ade80" },
    class: { icon: "🏛️", label: "CLASS", color: "#f43f5e" },
    function: { icon: "λ", label: "FUNCTION", color: "#fb923c" },
    method: { icon: "⚙️", label: "METHOD", color: "#fb923c" },
  };
  const tc = typeConfig[type] || { icon: "◉", label: type.toUpperCase(), color: "#94a3b8" };

  const pathParts: string[] = [];
  let curr = selectedNode;
  while (curr) {
    if (curr.data && curr.data.name && curr.data.name !== "root") {
      pathParts.unshift(curr.data.name);
    }
    curr = curr.parent;
  }
  const selectedComponentContext = {
    ...nodeData,
    id,
    name,
    type,
    path: filePath,
    startLine: line || null,
    endLine: endLine || null,
    lineSpan,
    complexity,
    nestedComponentCount: nestedCount,
    ancestry: pathParts,
  };

  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [selectedChainItem, setSelectedChainItem] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      if (newWidth >= 260 && newWidth <= window.innerWidth * 0.75) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    setActiveTab("details");
  }, [id]);

  const getStorageKey = () => `savant_chat_history_${repoName}_${id}`;
  useEffect(() => {
    async function load() {
      const key = getStorageKey();
      const threads = await window.system.loadAthenaThreads();
      const stored = Array.isArray(threads) ? threads.find((thread: any) => thread?.target_id === key) : null;
      setMessages(Array.isArray(stored?.messages) ? stored.messages : []);
    }
    load();
  }, [id, repoName]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const s = await window.system.getSettings();
        setSettings(s);
        
        const chain = s["provider:chain"] || [];
        if (chain.length > 0) {
          setSelectedChainItem({
            provider: chain[0].provider,
            model: chain[0].model,
            label: `${chain[0].provider.toUpperCase()}: ${chain[0].model}`
          });
        } else {
          setSelectedChainItem({ provider: "gemini", model: "3.5", label: "GEMINI: 3.5" });
        }
      } catch (err) {
        console.error("Error loading settings in DetailDrawer:", err);
      }
    }
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  useEffect(() => {
    if (chatEndRef.current && typeof chatEndRef.current.scrollIntoView === "function") {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, activeTab]);

  const saveMessages = (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    window.system.saveAthenaThread(getStorageKey(), newMessages);
  };

  const handleClearHistory = () => {
    saveMessages([]);
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const newUserMessage: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, newUserMessage];
    saveMessages(updatedMessages);
    setInputValue("");
    setIsLoading(true);

    try {
      let provider = "gemini";
      let model = "3.5";
      if (selectedChainItem) {
        provider = selectedChainItem.provider;
        model = selectedChainItem.model;
      } else {
        const s = settings || await window.system.getSettings();
        const chain = s?.["provider:chain"] || [];
        if (chain.length > 0) {
          provider = chain[0].provider;
          model = chain[0].model;
        }
      }

      const augmentedPrompt = await buildAthenaConversationPrompt({
        context: {
          area: `Context > Project > Visualization and Heuristics > ${visualization}`,
          repository: repoName,
          selected: {
            ...selectedComponentContext,
            grade: gradeInfo,
            findings: nodeFindings,
          },
          screen: screenContext || {},
        },
        history: messages,
        userMessage: textToSend,
        instructions: "Treat the selected component as the primary refactoring target. State its name, type, file, and line range when beginning a new analysis so the user can confirm the pinned context. Use its metrics, hierarchy, findings, and visualization state. Red or orange indicates high complexity or analysis findings. Suggest concrete refactoring strategies and code changes.",
        query: `${name} ${textToSend} ${filePath || ""}`,
        baseUrl: serverUrl,
        apiKey,
        repo: repoName,
      });
      const rawResponseText = await window.system.runAgentViaGateway({
        provider,
        model,
        prompt: augmentedPrompt,
      });
      const responseText = ensureAthenaMcpSummary(rawResponseText || "No response from ATHENA.", augmentedPrompt);

      const newAiMessage: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: responseText || "No response received from the gateway.",
        timestamp: new Date().toISOString(),
      };

      saveMessages([...updatedMessages, newAiMessage]);
    } catch (error: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Error calling ATHENA agent: ${error.message || "Unknown error"}. Make sure Savant Gateway is running.`,
        timestamp: new Date().toISOString(),
      };
      saveMessages([...updatedMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{ width: `${width}px` }}
      className={`relative border-l border-[var(--cp-border)] bg-[var(--cp-bg-3)] p-4 overflow-hidden max-h-full shrink-0 flex flex-col space-y-4 text-xs font-mono text-foreground ${
        isResizing ? "select-none" : ""
      }`}
    >
      <div
        onMouseDown={startResizing}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-50 transition-colors ${
          isResizing ? "bg-[var(--cp-cyan)]" : "bg-transparent hover:bg-[var(--cp-cyan)]/30"
        }`}
      />

      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold font-mono">Node Detail</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] transition-colors font-mono">
          ‹ CLOSE
        </button>
      </div>

      <div className="flex border-b border-[var(--cp-border)] mb-2 font-mono">
        <button
          onClick={() => setActiveTab("details")}
          className={`flex-1 pb-1.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer text-center border-b-2 transition-all ${
            activeTab === "details"
              ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 pb-1.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer text-center border-b-2 transition-all ${
            activeTab === "chat"
              ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Ask ATHENA
        </button>
      </div>

      {activeTab === "details" && (
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[9px] uppercase border rounded font-bold tracking-wider"
                  style={{ borderColor: `${tc.color}55`, backgroundColor: `${tc.color}15`, color: tc.color }}
                >
                  <span className="text-sm">{tc.icon}</span> {tc.label}
                </span>
              </div>

              {canCollapse && (
                <button
                  onClick={() => onToggleCollapse(id, isCollapsed)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer transition-all ${
                    isCollapsed
                      ? "bg-[rgba(34,211,238,0.15)] border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
                      : "bg-[rgba(148,163,184,0.05)] border-[var(--cp-border)] text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span className="text-[9px] font-bold uppercase tracking-wider">{isCollapsed ? "Expand" : "Collapse"}</span>
                </button>
              )}
            </div>
            <h3 className="text-base font-black text-foreground break-all leading-tight font-sans" style={{ color: tc.color }}>
              {name}
            </h3>
            {filePath && (
              <p className="text-[10px] text-muted-foreground break-all leading-relaxed opacity-80">
                {filePath}
              </p>
            )}
          </div>

          {complexity > 0 && (
            <div className="space-y-2">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">METRICS</h5>
              <div className="grid grid-cols-2 gap-2">
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                  <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Complexity</span>
                  <span className="text-xl font-black" style={{ color: gradeInfo.color }}>{complexity}</span>
                </div>
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                  <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Nested</span>
                  <span className="text-xl font-black text-foreground">{nestedCount}</span>
                </div>
                {lineSpan > 0 && (
                  <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                    <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Lines</span>
                    <span className="text-xl font-black text-foreground">{lineSpan}</span>
                  </div>
                )}
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2.5 text-center">
                  <span className="block text-[8px] text-muted-foreground uppercase tracking-wider">Grade</span>
                  <span className="text-xl font-black" style={{ color: gradeInfo.color }}>{gradeInfo.label}</span>
                </div>
              </div>
            </div>
          )}

          {line && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">LINE RANGE</h5>
              <div className="flex items-center gap-2 p-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded">
                <span className="text-[var(--section-label)] font-bold">L{line}</span>
                {endLine && (
                  <>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-[var(--section-label)] font-bold">{endLine}</span>
                    <span className="text-[9px] text-muted-foreground ml-auto">({lineSpan} lines)</span>
                  </>
                )}
              </div>
            </div>
          )}

          {complexity > 0 && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">CYCLOMATIC ASSESSMENT</h5>
              <div
                className="p-3 rounded border text-[10px] leading-relaxed"
                style={{
                  borderColor: `${gradeInfo.color}44`,
                  backgroundColor: `${gradeInfo.color}08`,
                  color: gradeInfo.color,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: gradeInfo.color }}
                  />
                  <span className="font-bold uppercase text-[9px] tracking-wider font-mono">
                    McCabe Score: {complexity}
                  </span>
                </div>
                <p className="opacity-90 font-sans">{gradeInfo.advisory}</p>
              </div>
            </div>
          )}

          {pathParts.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">HIERARCHY PATH</h5>
              <div className="p-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded leading-relaxed text-[10px] opacity-85">
                {pathParts.map((part, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground mx-1">➔</span>}
                    <span className={i === pathParts.length - 1 ? "text-[var(--section-label)] font-bold" : "text-muted-foreground"}>{part}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {nestedCount > 0 && (
            <div className="space-y-1">
              <h5 className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest font-mono">SCOPE DETAILS</h5>
              <p className="text-muted-foreground text-[10px] font-sans">
                Contains <strong className="text-foreground">{nestedCount}</strong> nested typed blocks.
                {lineSpan > 200 && (
                  <span className="block mt-1 text-amber-400">⚠ Large scope — consider decomposing into smaller, focused units.</span>
                )}
                {lineSpan > 500 && (
                  <span className="block mt-1 text-red-400">🚨 Extremely large scope — this is a maintenance burden and a likely source of bugs.</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0 space-y-3 font-mono">
          <div className="flex items-center gap-2 justify-between bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] rounded shrink-0">
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-wider">Gateway Model</span>
              <span className="text-[10px] font-bold text-[var(--cp-cyan)] uppercase truncate">
                {selectedChainItem ? selectedChainItem.label || `${selectedChainItem.provider}: ${selectedChainItem.model}` : "GEMINI: 3.5"}
              </span>
            </div>
            <button
              onClick={handleClearHistory}
              title="Clear Chat History"
              className="p-1 hover:bg-red-500/10 hover:text-red-400 text-muted-foreground rounded transition-colors cursor-pointer shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>

          <AthenaConversationExport messages={messages} title={`${visualization} component`} scope="complexity-athena" />
          <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2 space-y-3 min-h-0 flex flex-col pr-1">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4 my-auto">
                <Sparkles className="w-8 h-8 text-[var(--cp-cyan)] animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider font-mono">ATHENA</h4>
                  <p className="text-[9px] text-muted-foreground max-w-[200px] leading-relaxed font-sans">
                    Ask ATHENA questions about this code section. ATHENA has full context of this node.
                  </p>
                </div>

                <div className="w-full flex flex-col gap-1.5 pt-2">
                  {(nodeFindings.length > 0 || complexity > 5) && (
                    <button
                      onClick={() => handleSendMessage("Why is this section red?")}
                      className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                    >
                      ❓ Why is this red/high complexity?
                    </button>
                  )}
                  <button
                    onClick={() => handleSendMessage("How can I refactor this section to reduce complexity?")}
                    className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                  >
                    🛠️ How can I refactor this?
                  </button>
                  <button
                    onClick={() => handleSendMessage("Explain what this section of code does.")}
                    className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                  >
                    🔍 Explain this code section
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {messages.map((msg, i) => <AthenaMessage key={msg.id || i} message={msg} messageIndex={i} exportScope="complexity-athena" variant="compact" onCopy={text => navigator.clipboard.writeText(text)} onDelete={() => saveMessages(messages.filter((_, index) => index !== i))} actions={<AthenaMessageExportActions message={msg} index={i} title={`${visualization} component`} scope="complexity-athena" />} />)}
                {isLoading && (
                  <div className="flex flex-col space-y-1 items-start">
                    <span className="text-[8px] text-[var(--cp-cyan)] uppercase tracking-wider animate-pulse">ATHENA IS THINKING...</span>
                    <div className="p-2 rounded border border-[var(--cp-border)] bg-[var(--cp-bg-3)] flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-[var(--cp-cyan)]" />
                      <span className="text-muted-foreground text-[10px] font-sans">Consulting Savant Gateway...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputValue);
            }}
            className="flex gap-2 shrink-0"
          >
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (inputValue.trim() && !isLoading) {
                    handleSendMessage(inputValue);
                  }
                }
              }}
              placeholder="Ask ATHENA about this code..."
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-[var(--cp-bg-0)] border border-[var(--cp-border)] px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] resize-none min-h-[32px] max-h-[120px] overflow-y-auto"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 font-mono"
            >
              ASK
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="px-2 py-1.5 border border-red-500/20 text-red-400 hover:bg-red-950/20 text-xs font-mono"
              >
                CLEAR
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
