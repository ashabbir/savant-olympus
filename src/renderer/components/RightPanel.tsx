import { useState, useEffect, useMemo } from "react";
import { Activity, GitBranch, FileText, Upload, Sparkles, Search, ListChecks, Terminal, RefreshCcw, Timer, Cpu, Zap, FileCode, Database, Trash2, Download, Plus, Check, History } from "lucide-react";
import { AreaChart, Area, LineChart, Line, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Thinking } from "../App";
import { createContextService } from "@/services/contextService";

const TABS = [
  { id: "pulse", icon: Activity, label: "pulse" },
  { id: "trace", icon: Cpu, label: "trace" },
  { id: "graph", icon: GitBranch, label: "graph" },
  { id: "summary", icon: FileText, label: "summary" },
  { id: "uploads", icon: Upload, label: "files" },
] as const;

const CONTEXT_TABS = [
  { id: "search", icon: Search, label: "search" },
  { id: "memory", icon: Database, label: "memory" },
  { id: "ast", icon: FileCode, label: "code" },
] as const;

type TabId = typeof TABS[number]["id"] | "search" | "memory" | "ast";

interface RightPanelProps {
  thinking: Thinking[];
  statusText: string;
  activeTab: string;
  serverUrl: string;
  apiKey: string;
  selectedProject?: string | null;
  isAdmin?: boolean;
}

const pulseData = Array.from({ length: 20 }, (_, i) => ({
  t: i,
  tokens: Math.floor(Math.random() * 800 + 200),
  latency: Math.floor(Math.random() * 300 + 80),
  requests: Math.floor(Math.random() * 50 + 10),
  memory: Math.floor(Math.random() * 40 + 50),
}));

function NavIcon({
  icon, label, onClick, isActive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            title={label}
            style={{
              color: "var(--cp-cyan)",
              opacity: isActive ? 1 : 0.45,
              borderRight: isActive ? "2px solid var(--cp-cyan)" : "2px solid transparent",
            }}
            className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all cursor-pointer"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="left"
            style={{
              background: "var(--cp-bg-3)",
              border: "1px solid var(--cp-border)",
              color: "var(--cp-cyan)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="px-2 py-1 text-xs z-50"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function RightPanel({ thinking, statusText, activeTab, serverUrl, apiKey, selectedProject, isAdmin = false }: RightPanelProps) {
  const [activeRightTab, setActiveRightTab] = useState<TabId | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  // Context sub-tabs: "ast" | "memory" | "search"
  const [contextSubTab, setContextSubTab] = useState<"ast" | "memory" | "search">("search");
  
  // Semantic search state
  const [semanticQuery, setSemanticQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Memory banks state
  const [memoryBanks, setMemoryBanks] = useState<any[]>([]);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [selectedMemoryUri, setSelectedMemoryUri] = useState<string | null>(null);
  const [selectedMemoryContent, setSelectedMemoryContent] = useState<string | null>(null);
  const [isLoadingMemoryContent, setIsLoadingMemoryContent] = useState(false);

  // AST / Code files state
  const [codeFiles, setCodeFiles] = useState<any[]>([]);
  const [isLoadingCodeFiles, setIsLoadingCodeFiles] = useState(false);
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [isLoadingFileContent, setIsLoadingFileContent] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");

  const contextService = useMemo(() => createContextService(serverUrl, apiKey), [serverUrl, apiKey]);

  // Reset drawer state when active tab changes
  useEffect(() => {
    setActiveRightTab(null);
  }, [activeTab]);

  // Fetch memory banks
  const fetchMemoryBanks = async () => {
    setIsLoadingMemory(true);
    try {
      setMemoryBanks(await contextService.listMemoryResources(selectedProject || undefined));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMemory(false);
    }
  };

  const readMemoryResource = async (uri: string) => {
    setIsLoadingMemoryContent(true);
    try {
      setSelectedMemoryContent(await contextService.readMemoryResource(uri));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMemoryContent(false);
    }
  };

  // Fetch code files list
  const fetchCodeFiles = async () => {
    if (!selectedProject) return;
    setIsLoadingCodeFiles(true);
    try {
      setCodeFiles(await contextService.listCodeFiles(selectedProject));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingCodeFiles(false);
    }
  };

  const readCodeFile = async (uri: string) => {
    setIsLoadingFileContent(true);
    try {
      setSelectedFileContent(await contextService.readCodeContent(uri));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingFileContent(false);
    }
  };

  useEffect(() => {
    if (activeTab === "Context" && contextSubTab === "memory") {
      fetchMemoryBanks();
    }
  }, [activeTab, contextSubTab, selectedProject, contextService]);

  useEffect(() => {
    if (activeTab === "Context" && contextSubTab === "ast" && selectedProject) {
      fetchCodeFiles();
    }
  }, [activeTab, contextSubTab, selectedProject, contextService]);

  useEffect(() => {
    if (selectedMemoryUri) {
      readMemoryResource(selectedMemoryUri);
    } else {
      setSelectedMemoryContent(null);
    }
  }, [selectedMemoryUri]);

  useEffect(() => {
    if (selectedFileUri) {
      readCodeFile(selectedFileUri);
    } else {
      setSelectedFileContent(null);
    }
  }, [selectedFileUri]);

  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!semanticQuery.trim()) return;
    setIsSearching(true);
    try {
      setSearchResults(await contextService.search(semanticQuery, selectedProject || undefined));
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  function handleTabClick(tabId: TabId) {
    setActiveRightTab(prev => {
      const next = prev === tabId ? null : tabId;
      if (next === "search" || next === "memory" || next === "ast") {
        setContextSubTab(next);
      }
      return next;
    });
  }

  const getThinkingIcon = (type: Thinking['type'], color: string) => {
    switch (type) {
      case 'mcp_call': return <Search size={10} style={{ color }} />;
      case 'mcp_response': return <ListChecks size={10} style={{ color }} />;
      case 'shell': return <Terminal size={10} style={{ color }} />;
      case 'redecision': return <RefreshCcw size={10} style={{ color }} />;
      case 'timeout': return <Timer size={10} style={{ color }} />;
      case 'loop_check': return <Activity size={10} style={{ color }} />;
      default: return <Cpu size={10} style={{ color }} className="opacity-60" />;
    }
  }

  const getAgentColor = (agent: string) => {
    const a = agent.toLowerCase();
    if (a === 'moderator') return 'var(--cp-green)';
    if (a === 'system') return 'var(--cp-purple)';
    return 'var(--muted-foreground)';
  }

  const filteredCodeFiles = codeFiles.filter((file: any) => {
    const p = file.path || file.uri || "";
    return p.toLowerCase().includes(fileSearchQuery.toLowerCase());
  });

  const showContextView = activeRightTab === "search" || activeRightTab === "memory" || activeRightTab === "ast";

  // Render empty sidebar for Workspace, Tools, Skills, Users
  if (
    activeTab === "Workspace" ||
    activeTab === "Tools" ||
    activeTab === "Skills" ||
    activeTab === "Users"
  ) {
    return null;
  }

  // Render minimal sidebar for Abilities
  if (activeTab === "Abilities") {
    return (
      <aside
        style={{
          background: "var(--cp-bg-1)",
          borderLeft: "1px solid var(--cp-border)",
          width: 40,
        }}
        className="h-full shrink-0 flex flex-col justify-start items-center py-4 gap-4 z-20"
      >
        <NavIcon
          icon={<Sparkles size={16} />}
          label="Prompt Resolver"
          onClick={() => window.dispatchEvent(new CustomEvent("abilities-resolver-toggle"))}
        />
        <NavIcon
          icon={<ListChecks size={16} />}
          label="Validate Assets"
          onClick={() => window.dispatchEvent(new CustomEvent("abilities-validate"))}
        />
        <NavIcon
          icon={<RefreshCcw size={16} />}
          label="Bootstrap Assets"
          onClick={() => window.dispatchEvent(new CustomEvent("abilities-bootstrap"))}
        />
      </aside>
    );
  }

  // Render minimal sidebar for Knowledge
  if (activeTab === "Knowledge") {
    return (
      <aside
        style={{
          background: "var(--cp-bg-1)",
          borderLeft: "1px solid var(--cp-border)",
          width: 40,
        }}
        className="h-full shrink-0 flex flex-col justify-start items-center py-4 gap-4 z-20"
      >
        {isAdmin && <NavIcon
          icon={<Plus size={16} />}
          label="Add Node"
          onClick={() => window.dispatchEvent(new CustomEvent("knowledge-add-node"))}
        />}
        <NavIcon
          icon={<RefreshCcw size={16} />}
          label="Reload Graph"
          onClick={() => window.dispatchEvent(new CustomEvent("knowledge-reload"))}
        />
        {isAdmin && <NavIcon
          icon={<Check size={16} />}
          label="Commit All"
          onClick={() => window.dispatchEvent(new CustomEvent("knowledge-commit-all"))}
        />}
        {isAdmin && <NavIcon
          icon={<Trash2 size={16} style={{ color: "var(--cp-magenta)" }} />}
          label="Purge Graph"
          onClick={() => window.dispatchEvent(new CustomEvent("knowledge-purge"))}
        />}
        {isAdmin && <NavIcon
          icon={<Upload size={16} />}
          label="Upload Graph"
          onClick={() => window.dispatchEvent(new CustomEvent("knowledge-upload"))}
        />}
        <NavIcon
          icon={<Download size={16} />}
          label="Download Graph"
          onClick={() => window.dispatchEvent(new CustomEvent("knowledge-download"))}
        />
        <NavIcon
          icon={<History size={16} />}
          label="Previous Chats"
          onClick={() => window.dispatchEvent(new CustomEvent("knowledge-chat-history"))}
        />
      </aside>
    );
  }

  // Render Context sidebar with toggleable drawer
  return (
    <>
      <AnimatePresence initial={false}>
        {activeRightTab !== null && (
          <motion.div
            key="drawer-panel"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{
              position: "absolute",
              left: 0,
              right: 40,
              top: 0,
              bottom: 0,
              overflow: "hidden",
              borderLeft: "1px solid var(--cp-border)",
              background: "var(--cp-bg-1)",
              zIndex: 10,
            }}
          >
            <div className="flex flex-col overflow-hidden h-full w-full">
              {showContextView ? (
                // Context drawer UI
                <div className="flex flex-col h-full w-full overflow-hidden" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  <div className="border-b border-[var(--cp-border)] px-3 py-2 shrink-0 flex items-center justify-between bg-[var(--cp-bg-2)]">
                    <span className="text-xs font-bold font-mono text-[var(--cp-cyan)] tracking-wider">
                      CONTEXT CONTROL
                    </span>
                    <div className="flex gap-1">
                      {(["search", "memory", "ast"] as const).map((sub) => (
                        <button
                          key={sub}
                          onClick={() => {
                            setContextSubTab(sub);
                            setActiveRightTab(sub);
                          }}
                          className={`px-2 py-0.5 text-[9px] uppercase font-mono border ${
                            contextSubTab === sub
                              ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.08)]"
                              : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground"
                          } cursor-pointer`}
                        >
                          {sub === "ast" ? "code" : sub}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3">
                    {contextSubTab === "search" && (
                      <div className="space-y-3">
                        <form onSubmit={handleSemanticSearch} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Semantic search query..."
                            value={semanticQuery}
                            onChange={(e) => setSemanticQuery(e.target.value)}
                            className="flex-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs hover:opacity-90 cursor-pointer"
                          >
                            SEARCH
                          </button>
                        </form>

                        <div className="space-y-2">
                          {isSearching ? (
                            <div className="text-center text-[10px] font-mono text-[var(--cp-cyan)] animate-pulse py-6">
                              SEARCHING_SEMANTIC_INDEX...
                            </div>
                          ) : searchResults.length === 0 ? (
                            <div className="text-center text-[10px] text-muted-foreground opacity-50 py-6">
                              No semantic matches found
                            </div>
                          ) : (
                            searchResults.map((res, i) => (
                              <div
                                key={i}
                                onClick={() => {
                                  if (res.uri || res.path) {
                                    setSelectedFileUri(res.uri || res.path);
                                    setContextSubTab("ast");
                                    setActiveRightTab("ast");
                                  }
                                }}
                                className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-2 rounded text-xs space-y-1 hover:border-[var(--cp-cyan)] cursor-pointer transition-all"
                              >
                                <div className="text-[10px] text-[var(--cp-cyan)] font-mono truncate">{res.file || res.path || res.uri}</div>
                                <p className="text-foreground/80 line-clamp-3">{res.text || res.content}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {contextSubTab === "memory" && (
                      <div className="space-y-3">
                        {selectedMemoryUri ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2 bg-[var(--cp-bg-2)] -mx-3 -mt-3 p-3">
                              <span className="text-[10px] font-mono text-[var(--cp-cyan)] truncate max-w-[200px]">
                                {selectedMemoryUri.split("/").pop()}
                              </span>
                              <button
                                onClick={() => setSelectedMemoryUri(null)}
                                className="px-2 py-0.5 text-[9px] uppercase font-mono border border-[var(--cp-border)] text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                BACK
                              </button>
                            </div>
                            {isLoadingMemoryContent ? (
                              <div className="text-center text-[10px] font-mono text-[var(--cp-cyan)] animate-pulse py-6">
                                READING_MEMORY_RESOURCE...
                              </div>
                            ) : (
                              <pre className="bg-[var(--cp-bg-0)] border border-[var(--cp-border)] p-3 rounded text-[11px] text-foreground/80 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[400px]">
                                {selectedMemoryContent}
                              </pre>
                            )}
                          </div>
                        ) : (
                          <>
                            <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Active Memory Banks</h4>
                            {isLoadingMemory ? (
                              <div className="text-center text-[10px] font-mono text-[var(--cp-cyan)] animate-pulse py-6">
                                FETCHING_MEMORY_BANKS...
                              </div>
                            ) : memoryBanks.length === 0 ? (
                              <div className="text-center text-[10px] text-muted-foreground opacity-50 py-6">
                                Memory banks are currently empty
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {memoryBanks.map((bank, i) => (
                                  <div
                                    key={i}
                                    onClick={() => setSelectedMemoryUri(bank.uri || bank.path)}
                                    className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-2.5 hover:border-[var(--cp-cyan)] cursor-pointer transition-all"
                                  >
                                    <div className="text-xs font-bold text-foreground font-mono flex items-center gap-1.5">
                                      <Database size={11} className="text-[var(--cp-cyan)]" />
                                      {bank.name || bank.title || (bank.uri && bank.uri.split("/").pop())}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{bank.description || bank.path}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {contextSubTab === "ast" && (
                      <div className="space-y-2">
                        {selectedFileUri ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2 bg-[var(--cp-bg-2)] -mx-3 -mt-3 p-3">
                              <span className="text-[10px] font-mono text-[var(--cp-cyan)] truncate max-w-[200px]" title={selectedFileUri}>
                                {selectedFileUri.split("/").pop()}
                              </span>
                              <button
                                onClick={() => setSelectedFileUri(null)}
                                className="px-2 py-0.5 text-[9px] uppercase font-mono border border-[var(--cp-border)] text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                BACK
                              </button>
                            </div>
                            {isLoadingFileContent ? (
                              <div className="text-center text-[10px] font-mono text-[var(--cp-cyan)] animate-pulse py-6">
                                READING_CODE_FILE...
                              </div>
                            ) : (
                              <pre className="bg-[var(--cp-bg-0)] border border-[var(--cp-border)] p-3 rounded text-[11px] text-foreground/80 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[400px]">
                                {selectedFileContent}
                              </pre>
                            )}
                          </div>
                        ) : !selectedProject ? (
                          <div className="text-center py-6 text-xs text-muted-foreground opacity-40">
                            Select a project on the left to browse code files.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Filter code files..."
                                value={fileSearchQuery}
                                onChange={(e) => setFileSearchQuery(e.target.value)}
                                className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1 focus:outline-none"
                              />
                              <h4 className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Code files ({filteredCodeFiles.length})</h4>
                            </div>
                            {isLoadingCodeFiles ? (
                              <div className="text-center text-[10px] font-mono text-[var(--cp-cyan)] animate-pulse py-6">
                                FETCHING_CODE_FILES...
                              </div>
                            ) : filteredCodeFiles.length === 0 ? (
                              <div className="text-center text-[10px] text-muted-foreground opacity-50 py-6">
                                No code files found
                              </div>
                            ) : (
                              <div className="space-y-1 max-h-[350px] overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-1 font-mono text-[11px]">
                               {filteredCodeFiles.map((file: any, i: number) => (
                                  <div
                                    key={i}
                                    onClick={() => setSelectedFileUri(file.uri || file.path)}
                                    className="p-1 text-foreground/80 hover:text-[var(--cp-cyan)] hover:bg-[var(--cp-bg-3)] cursor-pointer truncate"
                                    title={file.path || file.uri}
                                  >
                                    {file.path || file.uri}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Standard pulse / trace / etc drawer content
                <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-3" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  <div className="border-b border-[var(--cp-border)] pb-2">
                    <h3 className="text-xs font-bold font-mono text-[var(--cp-cyan)] uppercase tracking-wider">
                      SYSTEM_{activeRightTab?.toUpperCase()}
                    </h3>
                  </div>

                  {activeRightTab === "pulse" && (
                    <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
                      <div className="h-28 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={pulseData}>
                            <defs>
                              <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--cp-cyan)" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="var(--cp-cyan)" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="tokens" stroke="var(--cp-cyan)" strokeWidth={1} fillOpacity={1} fill="url(#colorTokens)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-2">
                          <span className="text-muted-foreground text-[10px] block">THROUGHPUT</span>
                          <span className="text-[var(--cp-cyan)] font-bold">1.4K t/sec</span>
                        </div>
                        <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-2">
                          <span className="text-muted-foreground text-[10px] block">LATENCY</span>
                          <span className="text-[var(--cp-green)] font-bold">128ms avg</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeRightTab === "trace" && (
                    <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-2 font-mono text-[10px] space-y-1.5">
                      {thinking.slice(-30).map((t, idx) => (
                        <div key={t.id || idx} className="flex gap-1.5 items-start">
                          <span className="opacity-40">{new Date(t.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                          <span style={{ color: getAgentColor(t.agent) }}>[{t.agent}]</span>
                          <span className="flex items-center gap-1">
                            {getThinkingIcon(t.type, getAgentColor(t.agent))}
                            <span className="text-foreground/80">{t.thought}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeRightTab === "graph" && (
                    <div className="flex-1 flex flex-col justify-center items-center">
                      <div className="w-full border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-3">
                        <div className="text-[9px] text-muted-foreground font-mono mb-2 uppercase">Agent Interaction Topology</div>
                        <AgentGraph />
                      </div>
                    </div>
                  )}

                  {activeRightTab === "summary" && (
                    <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-foreground/80 space-y-2 p-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest border-b border-[var(--cp-border)] pb-1">SESSION_OVERVIEW</p>
                      <div className="space-y-1 bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)]">
                        <div>WORKSPACE_ID: olympus</div>
                        <div>USER: ahmed</div>
                        <div>SESSION_PORT: 5174</div>
                        <div>STATUS: ACTIVE</div>
                      </div>
                    </div>
                  )}

                  {activeRightTab === "uploads" && (
                    <div className="flex-1 flex flex-col space-y-2">
                      <div className="border border-dashed border-[var(--cp-border)] hover:border-[var(--cp-cyan)] transition-colors p-6 text-center cursor-pointer bg-[var(--cp-bg-2)]">
                        <Upload className="mx-auto text-muted-foreground opacity-50 mb-1" size={16} />
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">Drag files to index</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside
        style={{
          background: "var(--cp-bg-1)",
          borderLeft: "1px solid var(--cp-border)",
          width: 40,
        }}
        className="h-full shrink-0 flex flex-col justify-start py-2 gap-2 z-20"
      >
        <div className="flex flex-col items-center gap-1">
          {CONTEXT_TABS.map(subTab => {
            const Icon = subTab.icon;
            return (
              <NavIcon
                key={subTab.id}
                icon={<Icon size={16} />}
                label={subTab.label}
                onClick={() => handleTabClick(subTab.id)}
                isActive={activeRightTab === subTab.id}
              />
            );
          })}
        </div>
      </aside>
    </>
  );
}

function AgentGraph() {
  const agents = [
    { id: "orchestrator", x: 95, y: 30, color: "var(--cp-magenta)" },
    { id: "engineer", x: 40, y: 90, color: "var(--cp-cyan)" },
    { id: "architect", x: 150, y: 90, color: "var(--cp-yellow)" },
    { id: "security", x: 95, y: 150, color: "var(--cp-green)" },
  ];

  const edges = [
    [0, 1], [0, 2], [0, 3], [1, 3],
  ];

  return (
    <svg width="100%" viewBox="0 0 200 190" style={{ marginTop: 8 }}>
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={agents[a].x} y1={agents[a].y}
          x2={agents[b].x} y2={agents[b].y}
          stroke="rgba(0,229,255,0.15)" strokeWidth={1}
          strokeDasharray="3,3"
        />
      ))}
      {agents.map(agent => (
        <g key={agent.id}>
          <rect
            x={agent.x - 30} y={agent.y - 10}
            width={60} height={20}
            fill="var(--cp-bg-3)"
            stroke={agent.color}
            strokeWidth={0.8}
            strokeOpacity={0.5}
          />
          <text
            x={agent.x} y={agent.y + 4}
            textAnchor="middle"
            fill={agent.color}
            fontSize={8}
            fontFamily="'Share Tech Mono', monospace"
            opacity={0.7}
          >
            {agent.id}
          </text>
        </g>
      ))}
    </svg>
  );
}
