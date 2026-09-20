import React, { useState, useEffect, useCallback } from "react";
import {
  Bot, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Play,
  Folder, FileText, Code2, Terminal, ChevronDown, ChevronRight,
  Copy, Check, ExternalLink, ShieldCheck, Sparkles, Send, LucideIcon
} from "lucide-react";
import { ViewHeader } from "../shared/ViewHeader";
import { StatusBadge } from "../shared/StatusBadge";
import {
  createAgentSetupService,
  AgentSetupReport,
  AgentProvider,
  AgentSetupInfo,
  AgentPartStatus
} from "../../services/agentSetupService";
import { toast } from "sonner";

interface AgentSetupViewProps {
  serverUrl: string;
  apiKey: string;
  isAdmin?: boolean;
}

const PROVIDER_ICONS: Record<AgentProvider, LucideIcon> = {
  copilot: Bot,
  claude: Terminal,
  hermes: Code2,
  codex: FileText,
};

export function AgentSetupView({ serverUrl, apiKey }: AgentSetupViewProps) {
  const [report, setReport] = useState<AgentSetupReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTriggeringAll, setIsTriggeringAll] = useState(false);
  const [triggeringProvider, setTriggeringProvider] = useState<AgentProvider | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<Record<string, boolean>>({});
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [setupScope, setSetupScope] = useState<"global" | "workspace">("global");

  // Test learning ingestion state
  const [isTestingPost, setIsTestingPost] = useState(false);
  const [testTitle, setTestTitle] = useState("Agent Setup Verification: Learning Protocol Active");
  const [testContent, setTestContent] = useState("Verified that external agents trigger auto-posting of insights and root causes to Savant Knowledge.");
  const [showTestModal, setShowTestModal] = useState(false);

  const agentService = React.useMemo(() => createAgentSetupService(serverUrl, apiKey), [serverUrl, apiKey]);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await agentService.getStatus();
      setReport(data);
    } catch (err: any) {
      console.error("Failed to load agent setup status:", err);
      toast.error("Failed to load agent setup status");
    } finally {
      setIsLoading(false);
    }
  }, [agentService]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleTriggerSetup = async (provider: AgentProvider) => {
    setTriggeringProvider(provider);
    try {
      toast.info(`Configuring ${provider.toUpperCase()} integration...`);
      const result = await agentService.triggerSetup(provider);
      if (result.success && result.report) {
        setReport(result.report);
        toast.success(`Successfully configured ${provider.toUpperCase()} for Savant Knowledge!`);
      } else {
        toast.error(result.error || `Setup failed for ${provider}`);
      }
    } catch (err: any) {
      toast.error(`Error setting up ${provider}: ${err.message || String(err)}`);
    } finally {
      setTriggeringProvider(null);
    }
  };

  const handleTriggerAll = async () => {
    setIsTriggeringAll(true);
    try {
      toast.info("Triggering setup for all agents (Copilot, Claude, Hermes, Codex)...");
      const result = await agentService.triggerSetup("all");
      if (result.success && result.report) {
        setReport(result.report);
        toast.success("All 4 agents successfully configured for Savant Knowledge!");
      } else {
        toast.error(result.error || "Setup failed for some agents");
      }
    } catch (err: any) {
      toast.error(`Error triggering all setups: ${err.message || String(err)}`);
    } finally {
      setIsTriggeringAll(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
    toast.success("Path copied to clipboard");
  };

  const togglePreview = (id: string) => {
    setExpandedPreview(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTestPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTitle.trim()) return;
    setIsTestingPost(true);
    try {
      const res = await agentService.testLearningPost(testTitle.trim(), testContent.trim(), "insight");
      toast.success(`Knowledge node created successfully (ID: ${res.id || "exp_ok"})`);
      setShowTestModal(false);
    } catch (err: any) {
      toast.error(`Failed to post test learning: ${err.message || String(err)}`);
    } finally {
      setIsTestingPost(false);
    }
  };

  const agentsList: AgentSetupInfo[] = report ? Object.values(report.agents) : [];
  const configuredCount = report?.summary.configured ?? 0;
  const partialCount = report?.summary.partial ?? 0;
  const notConfiguredCount = report?.summary.notConfigured ?? 0;

  return (
    <div className="size-full flex flex-col overflow-hidden bg-[var(--cp-bg-0)] text-foreground font-mono">
      {/* Top Header */}
      <ViewHeader
        title="AGENT SETUP"
        description="Configure Model Context Protocol, Learning Protocols, and Knowledge Commit Skills for External Coding Agents"
        count={report?.summary.total ?? 4}
        countLabel="agents"
        onRefresh={loadStatus}
        isRefreshing={isLoading}
        actions={
          <div className="flex items-center gap-2">
            {/* Scope Toggle */}
            <div className="flex items-center border border-[var(--cp-border)] bg-[var(--cp-bg-3)] rounded text-[10px] p-0.5">
              <button
                type="button"
                onClick={() => setSetupScope("global")}
                className={`px-2 py-1 rounded transition-all ${setupScope === "global" ? "bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold" : "text-muted-foreground hover:text-foreground"}`}
              >
                USER SCOPE (~/.)
              </button>
              <button
                type="button"
                onClick={() => setSetupScope("workspace")}
                className={`px-2 py-1 rounded transition-all ${setupScope === "workspace" ? "bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold" : "text-muted-foreground hover:text-foreground"}`}
              >
                WORKSPACE
              </button>
            </div>

            {/* Test Post Button */}
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              className="px-3 py-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-3)] hover:border-[var(--cp-cyan)] text-[var(--cp-cyan)] text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles size={13} />
              TEST INGESTION
            </button>

            {/* Trigger All Button */}
            <button
              type="button"
              onClick={handleTriggerAll}
              disabled={isTriggeringAll}
              className="px-4 py-1.5 bg-[var(--cp-cyan)] hover:bg-[var(--cp-cyan)]/80 text-[var(--cp-bg-0)] text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(0,229,255,0.3)]"
            >
              <Bot size={14} className={isTriggeringAll ? "animate-spin" : ""} />
              {isTriggeringAll ? "CONFIGURING ALL..." : "TRIGGER ALL SETUPS"}
            </button>
          </div>
        }
      />

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-[var(--cp-bg-1)] border-b border-[var(--cp-border)] shrink-0 text-xs">
        <div className="flex items-center justify-between p-2 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)]">
          <span className="text-muted-foreground">TOTAL AGENTS</span>
          <span className="font-bold text-[var(--cp-cyan)]">{report?.summary.total ?? 4}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)]">
          <span className="text-muted-foreground">FULLY CONFIGURED</span>
          <span className="font-bold text-emerald-400">{configuredCount}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)]">
          <span className="text-muted-foreground">PARTIAL CONFIG</span>
          <span className="font-bold text-amber-400">{partialCount}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)]">
          <span className="text-muted-foreground">KNOWLEDGE MCP</span>
          <span className="font-bold text-[var(--cp-cyan)]">PORT 8094 (SSE)</span>
        </div>
      </div>

      {/* Main Content: Agent Cards */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-w-7xl mx-auto">
          {agentsList.map((agent) => {
            const Icon = PROVIDER_ICONS[agent.provider] || Bot;
            const isConfiguring = triggeringProvider === agent.provider;
            const previewOpen = expandedPreview[agent.provider] || false;

            const badgeVariant =
              agent.status === "configured" ? "success" :
              agent.status === "partial" ? "warning" : "error";

            const badgeText =
              agent.status === "configured" ? "FULLY CONFIGURED" :
              agent.status === "partial" ? "PARTIALLY SETUP" : "NOT SETUP";

            return (
              <div
                key={agent.provider}
                className="flex flex-col rounded border border-[var(--cp-border)] bg-[var(--cp-bg-1)] overflow-hidden hover:border-[var(--cp-cyan)]/40 transition-colors"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 p-4 bg-[var(--cp-bg-2)] border-b border-[var(--cp-border)]">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-[var(--cp-cyan)]">
                      <Icon size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-foreground tracking-wider uppercase">
                          {agent.label}
                        </h2>
                        <span className="text-[10px] text-muted-foreground uppercase">
                          [{agent.provider}]
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                        {agent.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge status={badgeText} variant={badgeVariant} size="sm" />
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {agent.present ? `Host dir: ${agent.presencePath}` : "Directory not detected"}
                    </span>
                  </div>
                </div>

                {/* Checklist of Parts */}
                <div className="p-4 space-y-3 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--cp-cyan)] uppercase tracking-wider">
                      SETUP BREAKDOWN & VERIFICATION
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {agent.parts.filter(p => p.configured).length} / {agent.parts.length} parts ready
                    </span>
                  </div>

                  <div className="space-y-2">
                    {agent.parts.map((part) => (
                      <div
                        key={part.id}
                        className={`p-2.5 rounded border transition-all ${
                          part.configured
                            ? "bg-emerald-500/5 border-emerald-500/30"
                            : "bg-red-500/5 border-red-500/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {part.configured ? (
                              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle size={14} className="text-red-400 shrink-0" />
                            )}
                            <span className="text-xs font-bold text-foreground">
                              {part.label}
                            </span>
                          </div>

                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              part.configured
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-red-500/20 text-red-300"
                            }`}
                          >
                            {part.configured ? "CONFIGURED" : "MISSING"}
                          </span>
                        </div>

                        <p className="text-[10px] text-muted-foreground font-sans mt-1 pl-5.5">
                          {part.details}
                        </p>

                        <div className="flex items-center justify-between gap-2 mt-1.5 pl-5.5 text-[10px]">
                          <span className="text-muted-foreground/80 font-mono truncate max-w-[320px]">
                            {part.path}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(part.path)}
                            className="p-1 hover:text-[var(--cp-cyan)] text-muted-foreground transition-colors cursor-pointer"
                            title="Copy path"
                          >
                            {copiedPath === part.path ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Collapsible Preview */}
                <div className="border-t border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-4 py-2 text-xs">
                  <button
                    type="button"
                    onClick={() => togglePreview(agent.provider)}
                    className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-[var(--cp-cyan)] transition-colors py-1 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      {previewOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      View Injection Template & MCP Config
                    </span>
                    <span className="text-[10px] uppercase font-mono">
                      {previewOpen ? "HIDE" : "SHOW TEMPLATE"}
                    </span>
                  </button>

                  {previewOpen && (
                    <div className="mt-2 space-y-2 text-[10px] font-mono pb-2">
                      <div className="p-2.5 rounded bg-[var(--cp-bg-3)] border border-[var(--cp-border)] overflow-x-auto">
                        <div className="text-[9px] text-[var(--cp-cyan)] mb-1 uppercase font-bold">
                          MCP Server Entry (JSON):
                        </div>
                        <pre className="text-slate-300">
{`"savant-knowledge": {
  "type": "sse",
  "url": "http://127.0.0.1:8094/sse?api_key=sk-ahmed-savant-001&app_name=savant-mcp"
}`}
                        </pre>
                      </div>

                      <div className="p-2.5 rounded bg-[var(--cp-bg-3)] border border-[var(--cp-border)] overflow-x-auto">
                        <div className="text-[9px] text-[var(--cp-cyan)] mb-1 uppercase font-bold">
                          Learning Persistence Mandate:
                        </div>
                        <pre className="text-slate-300 whitespace-pre-wrap">
{`Whenever you fix a bug, make an architectural decision, or establish a pattern:
1. Record it to Savant Knowledge via MCP 'savant-knowledge.store' (type: insight or issue).
2. Or invoke: ./record-learning.sh --type insight --title "..." --content "..."`}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="p-4 bg-[var(--cp-bg-2)] border-t border-[var(--cp-border)] flex items-center justify-between gap-3">
                  <div className="text-[10px] text-muted-foreground">
                    {agent.lastConfigured ? (
                      <span>Last setup: {new Date(agent.lastConfigured).toLocaleTimeString()}</span>
                    ) : (
                      <span>Not yet triggered in this session</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTriggerSetup(agent.provider)}
                    disabled={isConfiguring}
                    className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                      agent.status === "configured"
                        ? "border border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[var(--cp-cyan)]/10 hover:bg-[var(--cp-cyan)]/20"
                        : "bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] hover:bg-[var(--cp-cyan)]/80 shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                    }`}
                  >
                    <RefreshCw size={12} className={isConfiguring ? "animate-spin" : ""} />
                    {isConfiguring
                      ? `SETTING UP ${agent.provider.toUpperCase()}...`
                      : agent.status === "configured"
                      ? `RE-CONFIGURE ${agent.provider.toUpperCase()}`
                      : `TRIGGER SETUP FOR ${agent.provider.toUpperCase()}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Test Learning Modal Overlay */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--cp-bg-1)] border border-[var(--cp-border)] rounded shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--cp-cyan)]" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Test Learning Ingestion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground font-sans">
              Verify that Savant Knowledge is actively ingesting learnings from external agent hooks. This sends a test insight directly to the Savant Knowledge API.
            </p>

            <form onSubmit={handleTestPost} className="space-y-3">
              <div>
                <label className="block text-[10px] text-[var(--cp-cyan)] uppercase mb-1">
                  Insight Title
                </label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={e => setTestTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-xs text-foreground focus:outline-none focus:border-[var(--cp-cyan)]"
                  placeholder="Title of test learning..."
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-[var(--cp-cyan)] uppercase mb-1">
                  Content / Rationale
                </label>
                <textarea
                  rows={3}
                  value={testContent}
                  onChange={e => setTestContent(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-xs text-foreground focus:outline-none focus:border-[var(--cp-cyan)]"
                  placeholder="Rationale or outcome details..."
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTestModal(false)}
                  className="px-3 py-1.5 border border-[var(--cp-border)] text-xs hover:bg-[var(--cp-bg-3)]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isTestingPost}
                  className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] text-xs font-bold flex items-center gap-1.5 hover:bg-[var(--cp-cyan)]/80 disabled:opacity-50"
                >
                  <Send size={12} className={isTestingPost ? "animate-spin" : ""} />
                  {isTestingPost ? "POSTING..." : "POST TO KNOWLEDGE"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
