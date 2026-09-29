import React from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Terminal, Database, Layers, Bot } from "lucide-react";
import type { AthenaFacts, AthenaServerGroup, AthenaToolCall, AthenaQuality } from "@/lib/athenaFacts";

interface ServerTone {
  pill: string;
  bar: string;
}

const SERVER_TONES: Record<string, ServerTone> = {
  "savant-abilities": { pill: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300", bar: "bg-cyan-400" },
  "savant-knowledge": { pill: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300", bar: "bg-emerald-400" },
  "savant-context": { pill: "bg-purple-500/15 border-purple-500/40 text-purple-300", bar: "bg-purple-400" },
  "savant-workspace": { pill: "bg-amber-500/15 border-amber-500/40 text-amber-300", bar: "bg-amber-400" },
  "savant-reminders": { pill: "bg-blue-500/15 border-blue-500/40 text-blue-300", bar: "bg-blue-400" },
  gitlab: { pill: "bg-orange-500/15 border-orange-500/40 text-orange-300", bar: "bg-orange-400" },
  jira: { pill: "bg-sky-500/15 border-sky-500/40 text-sky-300", bar: "bg-sky-400" },
  confluence: { pill: "bg-indigo-500/15 border-indigo-500/40 text-indigo-300", bar: "bg-indigo-400" },
  github: { pill: "bg-zinc-500/15 border-zinc-500/40 text-zinc-300", bar: "bg-zinc-400" },
  shell: { pill: "bg-zinc-700/40 border-zinc-600/50 text-zinc-400", bar: "bg-zinc-500" },
  local: { pill: "bg-zinc-700/40 border-zinc-600/50 text-zinc-400", bar: "bg-zinc-600" },
};

const FALLBACK_TONES: ServerTone[] = [
  { pill: "bg-pink-500/15 border-pink-500/40 text-pink-300", bar: "bg-pink-400" },
  { pill: "bg-lime-500/15 border-lime-500/40 text-lime-300", bar: "bg-lime-400" },
  { pill: "bg-rose-500/15 border-rose-500/40 text-rose-300", bar: "bg-rose-400" },
  { pill: "bg-teal-500/15 border-teal-500/40 text-teal-300", bar: "bg-teal-400" },
  { pill: "bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300", bar: "bg-fuchsia-400" },
  { pill: "bg-yellow-500/15 border-yellow-500/40 text-yellow-300", bar: "bg-yellow-400" },
];

export function toneFor(server: string): ServerTone {
  if (SERVER_TONES[server]) return SERVER_TONES[server];
  let hash = 0;
  for (const ch of server) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_TONES[hash % FALLBACK_TONES.length];
}

const QUALITY_STYLES: Record<AthenaQuality, { ring: string; text: string; label: string }> = {
  strong: { ring: "#34d399", text: "text-emerald-300", label: "Strong" },
  fair: { ring: "#fbbf24", text: "text-amber-300", label: "Fair" },
  weak: { ring: "#f87171", text: "text-red-300", label: "Weak" },
};

const shortName = (server: string) => server.replace(/^savant-/, "");

function ScoreRing({ score, quality }: { score: number; quality: AthenaQuality }) {
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const style = QUALITY_STYLES[quality];
  return (
    <span className="relative inline-flex items-center justify-center w-7 h-7 shrink-0" aria-label={`Grounding score ${score}`}>
      <svg viewBox="0 0 28 28" className="w-7 h-7 -rotate-90">
        <circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-[var(--cp-border)]" />
        <circle cx="14" cy="14" r={radius} fill="none" stroke={style.ring} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} />
      </svg>
      <span className={`absolute text-[8px] font-bold ${style.text}`}>{score}</span>
    </span>
  );
}

function StatPill({ children, className, title }: { children: React.ReactNode; className: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold tabular-nums shrink-0 ${className}`}>
      {children}
    </span>
  );
}

function ServerMixBar({ groups, total }: { groups: AthenaServerGroup[]; total: number }) {
  if (!total) return null;
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-[var(--cp-border)]/40" aria-hidden>
      {groups.map((group) => (
        <div key={group.server} className={toneFor(group.server).bar} style={{ width: `${(group.calls.length / total) * 100}%` }} title={`${group.server}: ${group.calls.length}`} />
      ))}
    </div>
  );
}

function ResultChip({ call }: { call: AthenaToolCall }) {
  if (call.status === "error") return <StatPill className="bg-red-500/15 border-red-500/40 text-red-300">ERR</StatPill>;
  if (call.sizeKb !== undefined) return <StatPill className="bg-sky-500/15 border-sky-500/40 text-sky-300">{call.sizeKb} KB</StatPill>;
  if (call.resultCount === 0) return <StatPill className="bg-zinc-600/20 border-zinc-600/40 text-zinc-400">0</StatPill>;
  if (call.resultCount !== undefined) {
    return <StatPill className="bg-emerald-500/15 border-emerald-500/40 text-emerald-300">{call.resultCount}{call.isShell ? " ln" : ""}</StatPill>;
  }
  return null;
}

function CallRow({ call }: { call: AthenaToolCall }) {
  const detail = [call.args, call.result].filter(Boolean).join("  →  ");
  return (
    <li className="flex items-center gap-1.5 min-w-0 py-0.5" title={detail}>
      {call.status === "ok" ? <CheckCircle2 size={10} className="text-emerald-400 shrink-0" /> : <XCircle size={10} className="text-red-400 shrink-0" />}
      <span className="text-[10px] text-foreground/90 truncate">{call.tool}</span>
      {call.source === "prefetch" && <span className="text-[7px] uppercase tracking-wider px-1 rounded bg-[var(--cp-bg-2)] text-muted-foreground shrink-0">prefetch</span>}
      <span className="ml-auto shrink-0"><ResultChip call={call} /></span>
    </li>
  );
}

function ServerCard({ group }: { group: AthenaServerGroup }) {
  const tone = toneFor(group.server);
  const total = group.calls.length;
  return (
    <div className="rounded border border-[var(--cp-border)] bg-[var(--cp-bg-1)]/60 p-2 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wide ${tone.pill}`}>
          {group.calls[0].isShell ? <Terminal size={9} /> : <Database size={9} />}
          {shortName(group.server)}
        </span>
        <span className="text-[9px] text-muted-foreground tabular-nums">{total}×</span>
        {group.results > 0 && <span className="text-[9px] text-emerald-300 tabular-nums">{group.results} res</span>}
        {group.failed > 0 && <span className="text-[9px] text-red-300 tabular-nums">{group.failed} fail</span>}
      </div>
      <div className="flex h-1 rounded-full overflow-hidden bg-[var(--cp-border)]/40 mb-1.5" aria-hidden>
        <div className="bg-emerald-400" style={{ width: `${(group.ok / total) * 100}%` }} />
        <div className="bg-red-400" style={{ width: `${(group.failed / total) * 100}%` }} />
      </div>
      <ul className="space-y-0">
        {group.calls.map((call, index) => <CallRow key={`${call.tool}-${index}`} call={call} />)}
      </ul>
    </div>
  );
}

function ModelPill({ model }: { model: string }) {
  return (
    <span title="Model that produced this response" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold bg-violet-500/15 border-violet-500/40 text-violet-300 shrink-0">
      <Bot size={9} /> {model}
    </span>
  );
}

export function AthenaFactsPanel({ facts, defaultOpen = false }: { facts: AthenaFacts; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (!facts.calls.length && !facts.summary.length) {
    return facts.model ? (
      <div className="mt-3 pt-2 border-t border-[var(--cp-border)]/70 font-mono" data-testid="athena-facts">
        <ModelPill model={facts.model} />
      </div>
    ) : null;
  }
  const quality = QUALITY_STYLES[facts.quality];
  const hasMcp = facts.mcpCalls > 0;

  return (
    <div className="mt-3 pt-2 border-t border-[var(--cp-border)]/70 font-mono text-left" data-testid="athena-facts">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={open ? "Collapse facts" : "Expand facts"}
        className="w-full flex flex-col gap-1.5 p-1.5 rounded border border-[var(--cp-border)] bg-[var(--cp-bg-0)]/60 hover:border-[var(--cp-cyan)]/50 transition-colors cursor-pointer"
      >
        <div className="w-full flex items-center gap-1.5 flex-wrap">
          {open ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
          {hasMcp && <ScoreRing score={facts.score} quality={facts.quality} />}
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[var(--cp-cyan)]">
            <Layers size={10} /> Facts
          </span>
          {hasMcp && <span className={`text-[9px] font-bold uppercase ${quality.text}`}>{quality.label}</span>}
          {facts.model && <ModelPill model={facts.model} />}
          <StatPill className="bg-[var(--cp-cyan)]/10 border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)]" title="Distinct MCP servers">{facts.mcpServers} MCP</StatPill>
          <StatPill className="bg-zinc-600/20 border-zinc-500/40 text-zinc-300" title="MCP tool calls">{facts.mcpCalls} calls</StatPill>
          <StatPill className="bg-emerald-500/15 border-emerald-500/40 text-emerald-300" title="Results returned">{facts.results} facts</StatPill>
          {facts.sizeKb > 0 && <StatPill className="bg-sky-500/15 border-sky-500/40 text-sky-300" title="Large payloads read">{facts.sizeKb} KB</StatPill>}
          {facts.failed > 0 && <StatPill className="bg-red-500/15 border-red-500/40 text-red-300" title="Failed calls"><XCircle size={9} />{facts.failed}</StatPill>}
          {facts.shellCalls > 0 && <StatPill className="bg-zinc-700/40 border-zinc-600/50 text-zinc-400" title="Shell / local tool calls (not MCP)"><Terminal size={9} />{facts.shellCalls}</StatPill>}
          <span className="ml-auto flex items-center gap-1">
            {facts.groups.filter((group) => !group.calls[0].isShell).map((group) => (
              <span key={group.server} className={`px-1.5 py-0.5 rounded-full border text-[8px] font-bold uppercase ${toneFor(group.server).pill}`}>
                {shortName(group.server)} {group.calls.length}
              </span>
            ))}
          </span>
        </div>
        <ServerMixBar groups={facts.groups} total={facts.calls.length} />
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            {facts.groups.map((group) => <ServerCard key={group.server} group={group} />)}
          </div>
          {facts.summary.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {facts.summary.map((item) => (
                <span key={item.label} className="inline-flex items-center rounded-full border border-[var(--cp-border)] overflow-hidden text-[8px]">
                  <span className="px-1.5 py-0.5 bg-[var(--cp-bg-2)] text-muted-foreground uppercase">{item.label}</span>
                  <span className="px-1.5 py-0.5 text-foreground/90">{item.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
