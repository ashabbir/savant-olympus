import React from "react";
import { Gauge } from "lucide-react";
import { estimateTokens, getAthenaPromptStats, subscribeAthenaPromptStats } from "@/services/athenaService";
import { contextWindowFor, useAthenaModel } from "@/lib/athenaModel";
import { parseAthenaResponse } from "@/lib/athenaFacts";

interface AthenaContextMeterProps {
  sessionKey: string;
  messages: Array<{ sender: string; text: string }>;
  className?: string;
}

const LEVELS = [
  { max: 0.5, bar: "bg-emerald-400", text: "text-emerald-300", label: "Healthy" },
  { max: 0.8, bar: "bg-amber-400", text: "text-amber-300", label: "Getting long" },
  { max: Infinity, bar: "bg-red-400", text: "text-red-300", label: "Context flooding — start a new chat" },
];

const formatK = (tokens: number) => (tokens >= 1000 ? `${(tokens / 1000).toFixed(tokens >= 100_000 ? 0 : 1)}k` : String(tokens));

/** Estimates the next ATHENA prompt against the model's context window. */
export function estimateAthenaContext(messages: Array<{ sender: string; text: string }>, overheadTokens: number) {
  const history = messages.reduce((sum, message) => (
    sum + estimateTokens(message.sender === "assistant" ? parseAthenaResponse(message.text).body : message.text) + 4
  ), 0);
  return overheadTokens + history;
}

export function AthenaContextMeter({ sessionKey, messages, className = "" }: AthenaContextMeterProps) {
  const model = useAthenaModel();
  const [, force] = React.useReducer((count: number) => count + 1, 0);
  React.useEffect(() => subscribeAthenaPromptStats(force), []);
  if (!messages.length) return null;

  const stats = getAthenaPromptStats(sessionKey);
  const used = estimateAthenaContext(messages, stats?.overheadTokens ?? 6000);
  const limit = contextWindowFor(model);
  const ratio = used / limit;
  const level = LEVELS.find((entry) => ratio < entry.max) || LEVELS[LEVELS.length - 1];

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 font-mono text-[9px] border-b border-[var(--cp-border)]/60 bg-[var(--cp-bg-0)]/60 ${className}`}
      title={`Estimated next prompt ≈ ${used.toLocaleString()} tokens of ~${limit.toLocaleString()} (${messages.length} messages${stats?.prefetchCached ? ", MCP prefetch reused" : ""})`}
      data-testid="athena-context-meter"
    >
      <Gauge size={10} className={level.text} />
      <span className="uppercase tracking-wider opacity-60 shrink-0">Context</span>
      <div className="flex-1 h-1.5 min-w-[60px] rounded-full overflow-hidden bg-[var(--cp-border)]/40">
        <div className={`h-full ${level.bar}`} style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }} />
      </div>
      <span className={`tabular-nums font-bold shrink-0 ${level.text}`}>{Math.round(ratio * 100)}%</span>
      <span className="tabular-nums opacity-60 shrink-0">{formatK(used)}/{formatK(limit)}</span>
      {ratio >= 0.5 && <span className={`font-bold shrink-0 ${level.text}`}>{level.label}</span>}
      {stats?.prefetchCached && <span className="px-1 rounded bg-[var(--cp-bg-2)] opacity-70 shrink-0" title="MCP context was fetched once at chat start and reused">MCP cached</span>}
    </div>
  );
}
