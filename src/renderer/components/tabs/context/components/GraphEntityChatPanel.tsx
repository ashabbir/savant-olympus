import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { AthenaMessage, AthenaMessageModel } from "@/components/shared/AthenaMessage";
import { AthenaThreadStore, useAthenaThread } from "@/hooks/useAthenaThread";
import {
  buildAthenaPromptSections,
  fetchAthenaCodeContext,
  fetchAthenaKnowledgeContext,
  fetchAthenaMcpTools,
  formatAthenaContextHits,
} from "@/lib/athenaContext";

export interface GraphEntityChatTarget {
  node_id: string;
  node_type: string;
  title: string;
  content?: string;
  metadata?: any;
}

interface GraphEntityChatPanelProps {
  node: GraphEntityChatTarget;
  repoName: string;
  serverUrl: string;
  apiKey: string;
  activeModel?: { provider: string; model: string };
}

interface GraphChatMessage extends AthenaMessageModel {
  id: string;
  timestamp: string;
}

function createGraphChatStore(): AthenaThreadStore<GraphChatMessage> {
  return {
    async load(threadId) {
      const messages = await window.system.getChatHistory(threadId);
      return Array.isArray(messages) ? messages : [];
    },
    save(threadId, messages) {
      return window.system.saveChatHistory(threadId, messages);
    },
  };
}

export function GraphEntityChatPanel({ node, repoName, serverUrl, apiKey, activeModel }: GraphEntityChatPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const store = useMemo(createGraphChatStore, []);
  const threadId = `savant_chat_history_graphify_${repoName}_${node.node_id}`;
  const { messages, setMessages, removeMessage, clearMessages } = useAthenaThread<GraphChatMessage>({ threadId, store });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const buildPrompt = async (basePrompt: string, query: string) => {
    const [codeHits, knowledgeHits, tools] = await Promise.all([
      fetchAthenaCodeContext(serverUrl, apiKey, query, repoName),
      fetchAthenaKnowledgeContext(serverUrl, apiKey, query),
      fetchAthenaMcpTools(serverUrl, apiKey),
    ]);
    return buildAthenaPromptSections([
      ["BASE PROMPT", basePrompt],
      ["RETRIEVED CODE CONTEXT", formatAthenaContextHits(codeHits)],
      ["RETRIEVED KNOWLEDGE CONTEXT", formatAthenaContextHits(knowledgeHits)],
      ["AVAILABLE SAVANT MCP TOOLS", tools.length ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools available."],
    ]);
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;
    const userMessage: GraphChatMessage = { id: crypto.randomUUID(), sender: "user", text: trimmed, timestamp: new Date().toISOString() };
    const history = [...messages, userMessage];
    setMessages(history);
    setInputValue("");
    setIsThinking(true);

    try {
      const settings = activeModel ? null : await window.system.getSettings();
      const chain = settings?.["provider:chain"] || [];
      const provider = activeModel?.provider || chain[0]?.provider || "gemini";
      const model = activeModel?.model || chain[0]?.model || "3.5";
      const prompt = `You are ATHENA, an AI assistant integrated into Savant Olympus.
The user is discussing a Project Graph entity:
- Name: ${node.title}
- Node Type: ${node.node_type.toUpperCase()}
- Node ID: ${node.node_id}
${node.content ? `- Content:\n${node.content}\n` : ""}
${node.metadata ? `- Metadata: ${JSON.stringify(node.metadata)}\n` : ""}

[CONVERSATION HISTORY]
${history.slice(0, -1).map((message) => `${message.sender === "user" ? "User" : "ATHENA"}: ${message.text}`).join("\n")}

[NEW USER MESSAGE]
${trimmed}

Explain how this entity fits into the repository, its dependencies and relationships, and suggest relevant code or architectural improvements. Use Savant MCP tools when they can provide stronger evidence.`;
      const response = await window.ipcRenderer.invoke("run-agent", {
        provider,
        model,
        prompt: await buildPrompt(prompt, `${node.title} ${trimmed} ${node.content || ""}`),
      });
      setMessages([...history, { id: crypto.randomUUID(), sender: "assistant", text: response || "No response received from the gateway.", timestamp: new Date().toISOString() }]);
    } catch (error: any) {
      setMessages([...history, { id: crypto.randomUUID(), sender: "assistant", text: `Error calling ATHENA agent: ${error.message || "Unknown error"}. Make sure Savant Gateway is running.`, timestamp: new Date().toISOString() }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-3">
      <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2 space-y-3 min-h-0 flex flex-col pr-1">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4 my-auto">
            <Sparkles className="w-8 h-8 text-[var(--cp-cyan)] animate-pulse" />
            <div><h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider font-mono">ATHENA</h4><p className="text-[9px] text-muted-foreground max-w-[200px] leading-relaxed font-sans">Ask ATHENA questions about this entity and its codebase relationships.</p></div>
            <div className="w-full flex flex-col gap-1.5 pt-2">
              <button onClick={() => sendMessage(`Explain what the entity "${node.title}" does.`)} className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded text-[9px]">🔍 Explain this entity</button>
              <button onClick={() => sendMessage(`How does "${node.title}" relate to the rest of the codebase?`)} className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded text-[9px]">🕸️ How does it relate to others?</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 flex-1">
            {messages.map((message) => <AthenaMessage key={message.id} message={message} variant="compact" onCopy={(text) => navigator.clipboard.writeText(text)} onDelete={() => removeMessage(message.id)} />)}
            {isThinking && <div className="flex items-center gap-2 p-2 border border-[var(--cp-border)] bg-[var(--cp-bg-3)] text-[10px]"><Loader2 size={12} className="animate-spin text-[var(--cp-cyan)]" /><span>ATHENA IS THINKING...</span></div>}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void sendMessage(inputValue); }} className="flex gap-2 shrink-0">
        <textarea value={inputValue} onChange={(event) => setInputValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(inputValue); } }} placeholder="Ask ATHENA about this entity..." disabled={isThinking} rows={1} className="flex-1 bg-[var(--cp-bg-0)] border border-[var(--cp-border)] px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] resize-none min-h-[32px]" />
        <button type="submit" disabled={isThinking || !inputValue.trim()} className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase disabled:opacity-50 font-mono">ASK</button>
        {messages.length > 0 && <button type="button" onClick={clearMessages} className="px-2 py-1.5 border border-red-500/20 text-red-400 text-xs font-mono">CLEAR</button>}
      </form>
    </div>
  );
}
