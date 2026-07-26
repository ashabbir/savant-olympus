import React, { useState, useEffect, useRef } from "react";
import { Cpu, Save, Plus, Trash2, Shield, RefreshCcw, Sparkles, Folder, FileText, Check, ChevronLeft, ChevronRight, Download, Upload, PackageOpen, Bot, Send } from "lucide-react";
import { createAbilitiesService } from "../../services/abilitiesService";
import { SearchBar } from "../shared/SearchBar";
import { ViewHeader } from "../shared/ViewHeader";
import { StatusBadge } from "../shared/StatusBadge";
import { ModalBackdrop } from "../shared/ModalBackdrop";
import { buildAthenaConversationPrompt } from "../../lib/athenaContext";
import { AthenaMessage } from "../shared/AthenaMessage";
import { AthenaConversationExport, AthenaMessageExportActions } from "../shared/AthenaExportActions";
import { createScopedLocalAthenaThreadStore, readLocalAthenaHistory, useAthenaThread } from "../../hooks/useAthenaThread";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

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

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  suggestedAsset?: Partial<AbilityAsset>;
  proposedActions?: Array<{
    type: "create" | "update" | "delete";
    id: string;
    assetType?: string;
    name?: string;
    priority?: number;
    tags?: string[];
    includes?: string[];
    body?: string;
  }>;
}

interface AbilityAssetProposal {
  id: string;
  type: string;
  name: string;
  priority: number;
  tags: string[];
  includes: string[];
  body: string;
  rationale?: string;
}

const ATHENA_CHAT_HISTORY_KEY = "savant_athena_chat_history";
const ATHENA_ABILITIES_SCOPE = "abilities";

interface AbilitiesViewProps {
  serverUrl: string;
  apiKey: string;
  isAdmin: boolean;
  activeModel?: { provider: string; model: string };
}

export function AbilitiesView({ serverUrl, apiKey, isAdmin, activeModel }: AbilitiesViewProps) {
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
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const [archiveAction, setArchiveAction] = useState<"zip" | "tar" | "import" | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [importReceipt, setImportReceipt] = useState<{ imported_count: number; skipped_count: number } | null>(null);

  // AI Generation Chat states
  const [isAiMode, setIsAiMode] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [assetProposal, setAssetProposal] = useState<AbilityAssetProposal | null>(null);
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const baseUrl = serverUrl.replace(/\/+$/, "");
  const abilitiesService = createAbilitiesService(serverUrl, apiKey);

  const historyStore = React.useMemo(
    () => createScopedLocalAthenaThreadStore<ChatMessage>(ATHENA_CHAT_HISTORY_KEY, ATHENA_ABILITIES_SCOPE),
    [],
  );
  const { messages: chatMessages, setMessages: setChatMessages, removeMessage: removeChatMessage, clearMessages: clearChatMessages } = useAthenaThread<ChatMessage>({
    threadId: ATHENA_ABILITIES_SCOPE,
    store: historyStore,
  });

  const readSharedAthenaHistory = () => readLocalAthenaHistory<ChatMessage>(ATHENA_CHAT_HISTORY_KEY);
  const formatAthenaHistory = (messages: any[]) =>
    messages.length > 0
      ? messages.map(msg => `[${msg.scope || "general"}] ${msg.sender.toUpperCase()}: ${msg.text}`).join("\n")
      : "No previous messages in this conversation.";
  const handleCopyMessage = (text: string) => navigator.clipboard.writeText(text);
  const handleDeleteMessage = (id: string) => {
    removeChatMessage(id);
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiChatLoading]);

  const handleCreateProposal = async () => {
    if (!assetProposal || isCreatingAsset) return;
    setIsCreatingAsset(true);
    setCreateError("");
    try {
      await abilitiesService.createAsset({
        id: assetProposal.id,
        type: assetProposal.type,
        name: assetProposal.name,
        priority: assetProposal.priority,
        tags: assetProposal.tags,
        includes: assetProposal.includes,
        body: assetProposal.body,
      });

      await fetchAssets();
      setSelectedId(assetProposal.id);
      setIsAiMode(false);
      setAssetProposal(null);

      const newAsset: AbilityAsset = {
        id: assetProposal.id,
        type: assetProposal.type,
        name: assetProposal.name,
        priority: assetProposal.priority,
        tags: assetProposal.tags,
        includes: assetProposal.includes,
        body: assetProposal.body,
      };
      setSelectedAsset(newAsset);
      setEditBody(newAsset.body || "");
      setEditPriority(newAsset.priority);
      setEditTags(newAsset.tags || []);
      setEditIncludes(newAsset.includes || []);
      setIsDirty(false);

      setChatMessages(current => [...current, {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Created asset **${assetProposal.id}** on the Savant Server.`,
        timestamp: new Date().toISOString(),
      }]);
    } catch (error: any) {
      setCreateError(error?.message || "The server could not create this asset.");
    } finally {
      setIsCreatingAsset(false);
    }
  };

  const handleApplyProposedActions = async (actions: ChatMessage["proposedActions"], messageId: string) => {
    if (!actions || actions.length === 0) return;
    try {
      for (const action of actions) {
        if (action.type === "create") {
          await abilitiesService.createAsset({
            id: action.id,
            type: action.assetType || action.id.split(".")[0],
            name: action.name || action.id.split(".").pop(),
            priority: action.priority || 900,
            tags: action.tags || [],
            includes: action.includes || [],
            body: action.body || ""
          });
        } else if (action.type === "update") {
          await abilitiesService.updateAsset(action.id, {
            priority: action.priority,
            tags: action.tags,
            includes: action.includes,
            body: action.body
          });
        } else if (action.type === "delete") {
          await abilitiesService.deleteAsset(action.id);
        }
      }
      await fetchAssets();

      setChatMessages(prev => prev.map(m => m.id === messageId ? { ...m, proposedActions: undefined } : m));

      setChatMessages(current => [...current, {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Successfully applied ${actions.length} proposed system changes.`,
        timestamp: new Date().toISOString(),
      }]);
    } catch (e: any) {
      alert(`Error applying actions: ${e.message}`);
    }
  };

  const handleSendAiChatMessage = async (finalize = false) => {
    if (isAiChatLoading || (!finalize && !chatInput.trim())) return;
    if (finalize && chatMessages.every(message => message.sender !== "user") && !chatInput.trim()) return;

    const pendingText = chatInput.trim();
    const userMsg: ChatMessage | null = pendingText ? {
      id: Math.random().toString(),
      sender: "user",
      text: pendingText,
      timestamp: new Date().toISOString()
    } : null;

    const nextMessages = userMsg ? [...chatMessages, userMsg] : chatMessages;
    setChatMessages(nextMessages);
    setChatInput("");
    setIsAiChatLoading(true);
    setIsFinalizing(finalize);

    try {
      const chatHistory = nextMessages
        .map(msg => `${msg.sender.toUpperCase()}: ${msg.text}`)
        .join("\n");

      const existingAssetsMeta = Object.values(assets).flat().map(a => ({
        id: a.id,
        type: a.type,
        name: a.name || a.id.split(".").pop(),
        tags: a.tags || [],
        includes: a.includes || []
      }));

      const promptPayload = `You are a collaborative AI Ability Asset Architect designing a system prompt/ability asset for Savant through conversation.

Here is the list of existing assets already in the system:
${JSON.stringify(existingAssetsMeta, null, 2)}

Here is the conversation history so far:
${formatAthenaHistory(readSharedAthenaHistory())}
${chatHistory}

You MUST respond with a valid JSON object. Do not include any markdown wrap, extra explanation, or conversational text outside of the JSON.

DIRECTIONS:
- This request is in ${finalize ? "FINALIZE" : "CONVERSATION"} mode.
- In CONVERSATION mode, you can discuss new designs, answer questions, analyze existing assets for duplicates/redundancies, identify wordy assets that need condensing, and suggest cleanup plans.
- If the user asks you to find duplicates, analyze wordiness, or fix issues, or if you notice duplication/redundancies:
  1. Explain clearly in "response" what issues exist and what should be done.
  2. If the user explicitly asks to "fix it", "do it", or when proposing a specific concrete change, include a list of proposed "actions" in the JSON.
  3. Actions can be of type:
     - "create": { "type": "create", "assetType": "persona|rule|policy|style|repo", "id": "...", "name": "...", "priority": 900, "tags": [...], "includes": [...], "body": "..." }
     - "update": { "type": "update", "id": "...", "priority": 900, "tags": [...], "includes": [...], "body": "..." }
     - "delete": { "type": "delete", "id": "..." }
  4. Explain the plan and ask the user to confirm/say okay before executing.

- In FINALIZE mode, stop asking questions. Resolve remaining ambiguity with the recommendations and assumptions already discussed, then return status "ready" with the finalized asset definition.

In CONVERSATION mode return:
{
  "status": "conversational",
  "response": "A concise explanation of duplicates, wordiness issues, or answers to the user's questions.",
  "question": "Optional question asking for permission to apply changes, or clarifying details.",
  "suggestion": "Recommended cleanup direction.",
  "assumptions": ["Any working assumptions"],
  "actions": [
    { "type": "create|update|delete", "assetType": "persona|rule|policy|style|repo", "id": "asset.id", "name": "optional name", "priority": 900, "tags": [], "includes": [], "body": "markdown body text" }
  ]
}

In FINALIZE mode return:
{
  "status": "ready",
  "id": "type.snake_case_name",
  "type": "persona|rule|policy|style|repo",
  "name": "Human-friendly asset name",
  "priority": 900,
  "tags": ["tag1", "tag2"],
  "includes": ["other.asset.id1", "other.asset.id2"],
  "body": "The complete prompt content in Markdown format, with headers, explanations, rules, etc.",
  "rationale": "Why this type, tag list, and include hierarchy is sufficient and avoids duplication."
}

STEERING RULES:
- Asset ID must match the format: \`type.snake_case_name\` (e.g. \`rule.naming_conventions\` or \`persona.backend_lead\`).
- If proposing updates to condense, ensure the "body" contains the actual condensed markdown.
- Recommend specific tags and includes based on existing assets to reduce replication of guidelines.
- Always provide a solid default value for the body prompt in FINALIZE mode.`;

      const res = await window.system.runAgentViaGateway({
        provider: activeModel?.provider || "gemini",
        model: activeModel?.model || "3.5",
        prompt: await buildAthenaConversationPrompt({
          context: {
            area: "Abilities > Create with Athena",
            repository: "savant-olympus",
            selected: { type: "new-ability-design", proposal: assetProposal },
            screen: { mode: finalize ? "finalize" : "conversation" },
          },
          history: chatMessages,
          userMessage: pendingText || "Finalize the asset design using the pinned context and complete conversation.",
          instructions: promptPayload,
          query: `${pendingText || "finalize asset design"} ${chatHistory}`,
          baseUrl,
          apiKey,
          repo: "savant-olympus",
        })
      });

      let cleanRes = res || "";

      const parseJsonSafely = (text: string) => {
        try {
          return JSON.parse(text.trim());
        } catch (e) {}

        const codeBlockRegex = /```(?:json)?([\s\S]*?)```/;
        const match = text.match(codeBlockRegex);
        if (match && match[1]) {
          try {
            return JSON.parse(match[1].trim());
          } catch (e) {}
        }

        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const candidate = text.substring(startIdx, endIdx + 1);
          try {
            return JSON.parse(candidate.trim());
          } catch (e) {}
        }
        throw new Error("Invalid JSON structure");
      };

      try {
        const parsed = parseJsonSafely(cleanRes);
        if (parsed.status === "conversational") {
          const assistantMsg = {
            id: Math.random().toString(),
            sender: "assistant" as const,
            text: `${parsed.response}${parsed.question ? `\n\n**Question:** ${parsed.question}` : ""}${parsed.suggestion ? `\n\n**Athena suggests:** ${parsed.suggestion}` : ""}${Array.isArray(parsed.assumptions) && parsed.assumptions.length ? `\n\n**Working assumptions:** ${parsed.assumptions.join("; ")}` : ""}`,
            timestamp: new Date().toISOString(),
            proposedActions: parsed.actions
          };
          setChatMessages(prev => [...prev, assistantMsg]);
        } else if (parsed.status === "ready" && parsed.id && parsed.type && parsed.body) {
          const proposal: AbilityAssetProposal = {
            id: parsed.id,
            type: parsed.type,
            name: parsed.name || parsed.id.split(".").pop() || "",
            priority: parsed.priority || 900,
            tags: parsed.tags || [],
            includes: parsed.includes || [],
            body: parsed.body,
            rationale: parsed.rationale
          };
          setAssetProposal(proposal);
          setCreateError("");

          const assistantMsg = {
            id: Math.random().toString(),
            sender: "assistant" as const,
            text: `I recommend the **${proposal.id}** structure below. Review the details, then create it on the server or tell me what to change.`,
            timestamp: new Date().toISOString(),
          };
          setChatMessages(prev => [...prev, assistantMsg]);
        } else {
          throw new Error("Missing status properties.");
        }
      } catch (parseErr) {
        const assistantMsg = {
          id: Math.random().toString(),
          sender: "assistant" as const,
          text: cleanRes,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, assistantMsg]);
      }
    } catch (e: any) {
      console.error(e);
      const assistantMsg = {
        id: Math.random().toString(),
        sender: "assistant" as const,
        text: `Error contacting the AI model: ${e.message || "Unknown error"}. Make sure your Savant Gateway is running.`,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } finally {
      setIsAiChatLoading(false);
    }
  };


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
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("rule");
  const [newPriority, setNewPriority] = useState(900);
  const [newTagsString, setNewTagsString] = useState("");
  const [createError, setCreateError] = useState("");

  const toSnakeCase = (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  };

  const generatedId = newName.trim() ? `${newType}.${toSnakeCase(newName)}` : "";
  const allAssetIds = Object.values(assets).flat().map(a => a.id);
  const isDuplicate = Boolean(generatedId && allAssetIds.includes(generatedId));

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
    setCreateError("");

    const cleanName = newName.trim();
    if (!cleanName) {
      setCreateError("Name is required.");
      return;
    }

    const snakeName = toSnakeCase(cleanName);
    if (!snakeName) {
      setCreateError("Invalid name format.");
      return;
    }

    const targetId = `${newType}.${snakeName}`;
    if (allAssetIds.includes(targetId)) {
      setCreateError(`Asset ID '${targetId}' already exists. Choose a unique name or type.`);
      return;
    }

    try {
      const tags = newTagsString.split(",").map(t => t.trim()).filter(Boolean);
      const payload = {
        id: targetId,
        type: newType,
        name: cleanName,
        priority: newPriority,
        tags,
        body: `# ${cleanName}\n\nContent here...\n`,
      };
      await abilitiesService.createAsset(payload);
      setNewName("");
      setNewTagsString("");
      setCreateError("");
      setShowNewModal(false);
      await fetchAssets();
      await loadAsset(payload.id);
    } catch (e: any) {
      setCreateError(`Create error: ${e.message}`);
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

  const handleExportArchive = async (format: "zip" | "tar") => {
    setArchiveAction(format);
    setArchiveError("");
    try {
      const archive = await abilitiesService.exportArchive(format);
      const url = URL.createObjectURL(archive.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = archive.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setArchiveError(e?.message || "Could not create the migration package.");
    } finally {
      setArchiveAction(null);
    }
  };

  const handleImportArchive = async (file?: File) => {
    if (!file) return;
    setArchiveAction("import");
    setArchiveError("");
    setImportReceipt(null);
    try {
      const receipt = await abilitiesService.importArchive(file);
      setImportReceipt(receipt);
      await fetchAssets();
    } catch (e: any) {
      setArchiveError(e?.message || "Could not import the migration package.");
    } finally {
      setArchiveAction(null);
      if (archiveInputRef.current) archiveInputRef.current.value = "";
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

      <section className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] px-3 py-2.5 flex flex-col lg:flex-row lg:items-center gap-3" aria-label="Ability migration package">
        <div className="flex items-center gap-2 min-w-0 lg:mr-auto">
          <div className="h-8 w-8 shrink-0 border border-[var(--cp-cyan)]/30 bg-[var(--cp-cyan)]/5 text-[var(--cp-cyan)] flex items-center justify-center">
            <PackageOpen size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[11px] font-bold font-mono text-foreground uppercase tracking-wider">Migration package</h3>
            <p className="text-[10px] text-muted-foreground font-mono truncate">Preserves the abilities directory tree. Import adds missing files and safely skips existing paths.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExportArchive("zip")}
            disabled={archiveAction !== null}
            className="px-2.5 py-1.5 border border-[var(--cp-border)] text-[10px] font-mono text-foreground hover:border-[var(--cp-cyan)] hover:text-[var(--cp-cyan)] disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download size={11} /> {archiveAction === "zip" ? "PACKING ZIP..." : "DOWNLOAD ZIP"}
          </button>
          <button
            type="button"
            onClick={() => handleExportArchive("tar")}
            disabled={archiveAction !== null}
            className="px-2.5 py-1.5 border border-[var(--cp-border)] text-[10px] font-mono text-foreground hover:border-[var(--cp-cyan)] hover:text-[var(--cp-cyan)] disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download size={11} /> {archiveAction === "tar" ? "PACKING TAR..." : "DOWNLOAD TAR"}
          </button>
          {isAdmin && (
            <>
              <input
                ref={archiveInputRef}
                type="file"
                accept=".zip,.tar,application/zip,application/x-tar"
                className="hidden"
                aria-label="Choose abilities archive"
                onChange={(event) => handleImportArchive(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => archiveInputRef.current?.click()}
                disabled={archiveAction !== null}
                className="px-2.5 py-1.5 border border-[var(--cp-cyan)]/50 bg-[var(--cp-cyan)]/5 text-[10px] font-mono text-[var(--cp-cyan)] hover:bg-[var(--cp-cyan)]/10 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Upload size={11} /> {archiveAction === "import" ? "IMPORTING..." : "IMPORT PACKAGE"}
              </button>
            </>
          )}
        </div>
        {(importReceipt || archiveError) && (
          <div className={`text-[10px] font-mono lg:border-l lg:pl-3 ${archiveError ? "text-red-400 border-red-500/30" : "text-emerald-400 border-emerald-500/30"}`} role="status">
            {archiveError || `${importReceipt?.imported_count || 0} added · ${importReceipt?.skipped_count || 0} existing/unsupported skipped`}
          </div>
        )}
      </section>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Left Side: Asset Browser */}
        <div className={`${isAssetPaneOpen ? "w-80" : "w-11"} flex flex-col space-y-3 shrink-0 overflow-hidden transition-all duration-200`}>

          <div className="flex items-center justify-between">
            {isAssetPaneOpen && <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">Asset Trees</h3>}
            <div className="flex items-center gap-1">
              {isAssetPaneOpen && isAdmin && (
                <>
                  <button
                    onClick={() => {
                      setIsAiMode(!isAiMode);
                      if (!isAiMode && chatMessages.length === 0) {
                        setChatMessages([
                          {
                            id: "welcome",
                            sender: "assistant",
                            text: "Hi! I am the Savant AI Ability Assistant. Tell me what system ability, persona, rule, policy, style, or repository prompt you'd like to build, and I will generate the complete configuration and prompt body for you!",
                            timestamp: new Date().toISOString()
                          }
                        ]);
                      }
                    }}
                    style={{ borderColor: isAiMode ? "var(--cp-magenta)" : "rgba(0, 229, 255, 0.3)" }}
                    className={`px-1.5 py-0.5 border text-[10px] flex items-center gap-1 font-mono cursor-pointer transition-all ${
                      isAiMode
                        ? "text-[var(--cp-magenta)] hover:bg-[rgba(255,0,229,0.1)]"
                        : "text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)]"
                    }`}
                  >
                    <Sparkles size={10} />
                    {isAiMode ? "VIEW EDITOR" : "CREATE WITH ATHENA"}
                  </button>
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="px-2 py-0.5 border text-[10px] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] flex items-center gap-1 font-mono cursor-pointer"
                    style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
                  >
                    <Plus size={10} /> NEW_ASSET
                  </button>
                </>
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
        {isAiMode ? (
          /* AI Ability Generation Chat Panel */
          <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden relative">
            <div className="flex flex-col h-full bg-[var(--cp-bg-0)]">
              {/* Chat Title bar */}
              <div className="flex items-center justify-between border-b border-[var(--cp-border)] px-4 py-2.5 bg-[var(--cp-bg-1)] font-mono text-xs text-[var(--cp-cyan)]">
                <span className="flex items-center gap-1.5 font-bold">
                  <Bot size={14} /> AI_ABILITY_CREATOR_CHAT
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">Explain the prompt/ability, AI does the rest</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to reset this chat?")) {
                        clearChatMessages();
                        setAssetProposal(null);
                      }
                    }}
                    className="px-1.5 py-0.5 border border-red-500/30 text-[9px] text-[var(--cp-magenta)] hover:bg-red-950/20 font-bold cursor-pointer"
                  >
                    RESET CHAT
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <AthenaConversationExport messages={chatMessages} title="Athena ability creator" scope="abilities-athena" />
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((msg, index) => (
                  <div key={msg.id} className="space-y-2">
                    <AthenaMessage
                      message={msg}
                      messageIndex={index}
                      exportScope="abilities-athena"
                      variant="skill"
                      onCopy={handleCopyMessage}
                      onDelete={() => handleDeleteMessage(msg.id)}
                      actions={<AthenaMessageExportActions message={msg} index={index} title="Athena ability creator" scope="abilities-athena" />}
                    />
                    {msg.proposedActions && msg.proposedActions.length > 0 && (
                      <div className="ml-10 max-w-2xl border border-[var(--cp-cyan)]/30 bg-[var(--cp-bg-1)] p-3 space-y-3 font-mono text-xs">
                        <div className="text-xs font-bold text-[var(--cp-cyan)] uppercase tracking-wider">
                          Proposed Changes
                        </div>
                        <div className="space-y-2 divide-y divide-[var(--cp-border)]/50">
                          {msg.proposedActions.map((action, actionIdx) => (
                            <div key={actionIdx} className="pt-2 first:pt-0">
                              <div className="flex items-center gap-2">
                                <span className={`px-1 text-[9px] font-bold uppercase ${
                                  action.type === "delete" ? "bg-red-950/40 text-red-400 border border-red-500/20" :
                                  action.type === "create" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20" :
                                  "bg-blue-950/40 text-blue-400 border border-blue-500/20"
                                }`}>
                                  {action.type}
                                </span>
                                <span className="font-bold">{action.id}</span>
                              </div>
                              {action.body && (
                                <div className="mt-2 border border-[var(--cp-border)] max-h-40 overflow-auto bg-[#1e1e1e]">
                                  <SyntaxHighlighter
                                    language="markdown"
                                    style={vscDarkPlus}
                                    customStyle={{ margin: 0, padding: "8px", background: "transparent", fontSize: "9px" }}
                                    wrapLongLines
                                  >
                                    {action.body}
                                  </SyntaxHighlighter>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setChatMessages(prev => prev.map(m => m.id === msg.id ? { ...m, proposedActions: undefined } : m));
                            }}
                            className="px-2.5 py-1 border border-[var(--cp-border)] text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            DISCARD
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyProposedActions(msg.proposedActions!, msg.id)}
                            className="px-3 py-1 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] text-[10px] font-bold"
                          >
                            APPLY CHANGES
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isAiChatLoading && (
                  <div className="flex items-center gap-2.5 mr-auto max-w-[85%]">
                    <div className="p-1 border border-pink-500/30 bg-pink-950/10 text-pink-400 rounded animate-spin">
                      <RefreshCcw size={14} />
                    </div>
                    <div className="p-3 border border-dashed border-pink-500/25 bg-[var(--cp-bg-1)] text-xs font-mono text-pink-400/80 animate-pulse">
                      {isFinalizing ? "Finalizing the ability asset structure..." : "Athena is reviewing your message and shaping the ability asset..."}
                    </div>
                  </div>
                )}

                {assetProposal && (
                  <div className="ml-auto w-full max-w-2xl border border-[var(--cp-cyan)]/40 bg-[var(--cp-bg-1)] p-3 space-y-3 font-mono text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-[var(--cp-cyan)]">PROPOSED_ASSET / {assetProposal.id}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">Type: {assetProposal.type.toUpperCase()} · Name: {assetProposal.name}</div>
                      </div>
                      <span className="text-[9px] text-[var(--cp-green)] border border-[var(--cp-green)]/30 px-1.5 py-0.5">REVIEW</span>
                    </div>
                    {assetProposal.rationale && <p className="text-[10px] text-muted-foreground">{assetProposal.rationale}</p>}

                    <div className="space-y-2 border border-[var(--cp-border)] p-2 bg-[var(--cp-bg-2)] text-[10px]">
                      <div><span className="text-muted-foreground uppercase">Priority:</span> {assetProposal.priority}</div>
                      <div><span className="text-muted-foreground uppercase">Tags:</span> {assetProposal.tags.join(", ") || "(none)"}</div>
                      <div><span className="text-muted-foreground uppercase">Includes:</span> {assetProposal.includes?.join(", ") || "(none)"}</div>
                    </div>

                    <div className="border border-[var(--cp-border)] max-h-80 overflow-auto bg-[#1e1e1e]">
                      <div className="sticky top-0 z-10 flex justify-between px-3 py-1.5 bg-[#181818] border-b border-white/10 text-[9px] text-muted-foreground">
                        <span>body.md</span>
                        <span>MARKDOWN</span>
                      </div>
                      <SyntaxHighlighter
                        language="markdown"
                        style={vscDarkPlus}
                        customStyle={{ margin: 0, padding: "12px", background: "transparent", fontSize: "10px", lineHeight: 1.55 }}
                        wrapLongLines
                      >
                        {assetProposal.body || ""}
                      </SyntaxHighlighter>
                    </div>

                    {createError && <div className="text-[10px] text-red-400">{createError}</div>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setAssetProposal(null)} className="px-2.5 py-1 border border-[var(--cp-border)] text-[10px] text-muted-foreground hover:text-foreground">DISCARD</button>
                      <button type="button" onClick={handleCreateProposal} disabled={isCreatingAsset} className="px-3 py-1 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] text-[10px] font-bold disabled:opacity-50">
                        {isCreatingAsset ? "CREATING..." : "CREATE ON SERVER"}
                      </button>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col gap-3 shadow-[0_-12px_28px_rgba(0,0,0,0.18)]">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--cp-cyan)]">Continue the design conversation</span>
                  <span className="text-[9px] text-muted-foreground">Enter sends · Shift+Enter adds a line</span>
                </div>
                <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-0)] focus-within:border-[var(--cp-cyan)] transition-colors">
                  <textarea
                    placeholder="Describe the prompt/ability context, answer Athena, or redirect her recommendation..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (chatInput.trim() && !isAiChatLoading) {
                          handleSendAiChatMessage();
                        }
                      }
                    }}
                    disabled={isAiChatLoading}
                    rows={4}
                    className="w-full bg-transparent px-3 py-3 text-xs font-mono text-foreground focus:outline-none resize-y min-h-[112px] max-h-[240px] overflow-y-auto leading-relaxed"
                  />
                </div>
                {isAdmin && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] text-muted-foreground font-mono">Finalize uses the complete conversation and Athena's recommended defaults.</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSendAiChatMessage(false)}
                        disabled={isAiChatLoading || !chatInput.trim()}
                        className="px-4 py-2 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] font-bold text-[10px] uppercase hover:bg-[rgba(0,229,255,0.08)] disabled:opacity-40 font-mono flex items-center gap-1.5"
                      >
                        <Send size={11} /> SEND MESSAGE
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendAiChatMessage(true)}
                        disabled={isAiChatLoading || (chatMessages.every(message => message.sender !== "user") && !chatInput.trim())}
                        className="px-4 py-2 bg-[var(--cp-magenta)] text-white font-bold text-[10px] uppercase hover:opacity-90 disabled:opacity-40 font-mono flex items-center gap-1.5"
                      >
                        <Sparkles size={11} /> FINALIZE &amp; GENERATE
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : showBuilder ? (
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
                <p className="text-[10px] text-muted-foreground font-mono">Asset Type: {(selectedAsset.type || "").toUpperCase()}</p>
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
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setCreateError("");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 font-mono text-xs">
              <div className="flex flex-col space-y-1">
                <label className="text-muted-foreground uppercase">Type</label>
                <select
                  value={newType}
                  onChange={e => {
                    setNewType(e.target.value);
                    setCreateError("");
                  }}
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
                <label className="text-muted-foreground uppercase">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. JS Naming or some thing"
                  value={newName}
                  onChange={e => {
                    setNewName(e.target.value);
                    setCreateError("");
                  }}
                  className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground p-1.5 focus:outline-none"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <label className="text-muted-foreground uppercase">Generated Identifier (Machine Generated)</label>
                <input
                  type="text"
                  readOnly
                  value={generatedId || `${newType}.<name>`}
                  className={`bg-[var(--cp-bg-2)]/60 border ${
                    isDuplicate ? "border-red-500 text-red-400" : "border-[var(--cp-border)] text-muted-foreground"
                  } p-1.5 focus:outline-none cursor-not-allowed`}
                />
                {isDuplicate && (
                  <span className="text-[10px] text-red-400">⚠ Identifier '{generatedId}' already exists</span>
                )}
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

              {createError && (
                <div className="text-[10px] text-red-400 font-mono bg-red-950/30 border border-red-500/30 p-1.5">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    setCreateError("");
                  }}
                  className="px-3 py-1 border border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isDuplicate}
                  className={`px-3 py-1 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold ${
                    isDuplicate ? "opacity-50 cursor-not-allowed" : "hover:opacity-90 cursor-pointer"
                  }`}
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
