import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Copy, HelpCircle, Trash2, Cpu, ChevronDown, ChevronRight } from "lucide-react";
import Mermaid from "@/components/Mermaid";
import { normalizeMermaidMarkdown } from "@/utils/mermaidMarkdown";

export interface AthenaMessageModel {
  id?: string;
  sender: "user" | "assistant";
  text: string;
  timestamp?: string;
}

interface AthenaMessageProps {
  message: AthenaMessageModel;
  variant?: "standard" | "skill" | "compact";
  onCopy?: (text: string) => void;
  onDelete?: () => void;
  actions?: React.ReactNode;
  messageIndex?: number;
  exportScope?: string;
}

const markdownClasses = "font-sans leading-relaxed [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-[var(--cp-border)] [&_th]:bg-[var(--cp-bg-1)] [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-[var(--cp-border)] [&_td]:p-2 [&_td]:align-top [&_pre]:bg-[var(--cp-bg-0)] [&_pre]:border [&_pre]:border-[var(--cp-border)] [&_pre]:p-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-[10px] [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--cp-cyan)] [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground";

const markdownComponents = {
  code({ inline, className, children, ...props }: any) {
    const language = /language-(\w+)/.exec(className || "")?.[1];
    const source = String(children).replace(/\n$/, "");
    if (!inline && language === "mermaid") {
      return <Mermaid chart={source} />;
    }
    return <code className={className} {...props}>{children}</code>;
  },
};

const SERVER_BADGE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  "savant-abilities": { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
  "savant-knowledge": { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  "savant-context": { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  "savant-workspace": { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  "savant-reminders": { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  jira: { bg: "bg-blue-600/10", border: "border-blue-600/30", text: "text-blue-300" },
  confluence: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400" },
  github: { bg: "bg-zinc-500/10", border: "border-zinc-500/30", text: "text-zinc-300" },
};

function detectMcpServers(text: string): string[] {
  const servers = new Set<string>();
  if (/savant-abilities/i.test(text)) servers.add("savant-abilities");
  if (/savant-knowledge/i.test(text)) servers.add("savant-knowledge");
  if (/savant-context/i.test(text)) servers.add("savant-context");
  if (/savant-workspace/i.test(text)) servers.add("savant-workspace");
  if (/savant-reminders/i.test(text)) servers.add("savant-reminders");
  if (/\bjira\b/i.test(text)) servers.add("jira");
  if (/\bconfluence\b/i.test(text)) servers.add("confluence");
  if (/\bgithub\b/i.test(text)) servers.add("github");
  return Array.from(servers);
}

function McpExecutionSection({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const servers = detectMcpServers(text);

  return (
    <div className="mt-3 pt-2 border-t border-[var(--cp-border)]/70 text-left font-mono">
      <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-[var(--cp-bg-0)]/60 border border-[var(--cp-border)]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--cp-cyan)]/15 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)]">
            <Cpu size={10} /> MCP Activity
          </span>
          {servers.map((s) => {
            const style = SERVER_BADGE_STYLES[s] || { bg: "bg-zinc-800", border: "border-zinc-700", text: "text-zinc-300" };
            return (
              <span key={s} className={`px-1.5 py-0.5 rounded text-[8px] border font-bold uppercase ${style.bg} ${style.border} ${style.text}`}>
                {s.replace(/^savant-/, "")}
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-[var(--cp-cyan)] transition-colors px-1 py-0.5 cursor-pointer"
          title={isExpanded ? "Collapse MCP execution audit" : "Expand MCP execution audit"}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{isExpanded ? "Hide Trace" : "View Trace"}</span>
        </button>
      </div>

      {isExpanded && (
        <div className="mt-2 p-2 rounded bg-[var(--cp-bg-0)]/40 border border-[var(--cp-border)]/50 text-[10px] leading-relaxed overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function AssistantMessageContent({ text }: { text: string }) {
  const auditIdx = text.search(/(?:^|\n)### Savant MCP Execution & Audit/);
  if (auditIdx === -1) {
    return (
      <div data-athena-export-content className={markdownClasses}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {normalizeMermaidMarkdown(text)}
        </ReactMarkdown>
      </div>
    );
  }

  const mainBody = text.slice(0, auditIdx).trim();
  const auditBody = text.slice(auditIdx).trim();

  return (
    <div data-athena-export-content className={markdownClasses}>
      {mainBody && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {normalizeMermaidMarkdown(mainBody)}
        </ReactMarkdown>
      )}
      <McpExecutionSection text={auditBody} />
    </div>
  );
}

function MessageActions({ message, onCopy, onDelete, actions }: AthenaMessageProps) {
  if (!onCopy && !onDelete && !actions) return null;
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {onCopy && (
        <button type="button" onClick={() => onCopy(message.text)} title="Copy message text" aria-label="Copy message text" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-[var(--cp-cyan)]">
          <Copy size={9} />
        </button>
      )}
      {actions}
      {onDelete && (
        <button type="button" onClick={onDelete} title="Delete message" aria-label="Delete message" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-red-400">
          <Trash2 size={9} />
        </button>
      )}
    </div>
  );
}

export function AthenaMessage(props: AthenaMessageProps) {
  const { message, variant = "standard", messageIndex, exportScope = "athena-chat" } = props;
  const exportAttributes = { "data-athena-export-scope": exportScope, "data-athena-message-index": messageIndex };

  if (variant === "skill") {
    return (
      <div {...exportAttributes} className={`flex items-start gap-2.5 max-w-[85%] ${message.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
        <div className={`p-1 border rounded shrink-0 ${message.sender === "user" ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.1)] text-[var(--cp-cyan)]" : "border-pink-500/30 bg-pink-950/10 text-pink-400"}`}>
          {message.sender === "user" ? <HelpCircle size={14} /> : <Bot size={14} />}
        </div>
        <div className="relative group">
          <div className={`p-3 border text-xs leading-relaxed font-mono ${message.sender === "user" ? "bg-[var(--cp-bg-2)] border-[var(--cp-border)] text-foreground" : "bg-[var(--cp-bg-1)] border-pink-500/15 text-pink-50/90"}`}>
            <div className="absolute -top-2 right-1"><MessageActions {...props} /></div>
            {message.sender === "assistant" ? <AssistantMessageContent text={message.text} /> : <p data-athena-export-content className="whitespace-pre-wrap leading-relaxed">{message.text}</p>}
            {message.timestamp && <span className="block mt-1.5 text-[9px] text-muted-foreground opacity-50 text-right">{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div {...exportAttributes} className={`flex flex-col space-y-1 group relative ${message.sender === "user" ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 text-[8px] text-muted-foreground opacity-60">
          <span>{message.sender === "user" ? "USER" : "ATHENA"}</span>
          <MessageActions {...props} />
        </div>
        <div className={`p-2 rounded border max-w-full overflow-hidden font-mono text-[10px] leading-relaxed break-words text-foreground ${message.sender === "user" ? "bg-[rgba(0,229,255,0.06)] border-[rgba(0,229,255,0.25)] text-right" : "bg-[rgba(167,139,250,0.06)] border-[rgba(167,139,250,0.2)] text-left"}`}>
          {message.sender === "user" ? <span data-athena-export-content className="whitespace-pre-wrap">{message.text}</span> : <AssistantMessageContent text={message.text} />}
        </div>
      </div>
    );
  }

  return (
    <div {...exportAttributes} className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"}`}>
      <div className="relative group max-w-[85%]">
        <div className={`rounded px-3 py-2 text-xs font-mono border ${message.sender === "user" ? "bg-[var(--cp-cyan)]/10 border-[var(--cp-cyan)]/25 text-foreground" : "bg-[var(--cp-bg-2)] border-[var(--cp-border)] text-foreground/90"}`}>
          <div className="absolute -top-2 right-1"><MessageActions {...props} /></div>
          {message.sender === "assistant" ? <AssistantMessageContent text={message.text} /> : <p data-athena-export-content className="whitespace-pre-wrap leading-relaxed">{message.text}</p>}
        </div>
      </div>
      {message.timestamp && <span className="text-[8px] text-muted-foreground mt-1 px-1 font-mono uppercase">{message.sender === "user" ? "USER" : "ATHENA"} • {new Date(message.timestamp).toLocaleTimeString()}</span>}
    </div>
  );
}

