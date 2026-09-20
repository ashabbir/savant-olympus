import React from "react";
import { Cpu, Zap } from "lucide-react";

export interface AthenaMcpContextBarProps {
  /** Resolved Savant Abilities persona name */
  persona?: string;
  /** Number of knowledge graph nodes retrieved */
  knowledgeRefs?: number;
  /** Number of code/AST references retrieved */
  codeRefs?: number;
  /** Number of workspace tasks tracked */
  workspaceTasks?: number;
  /** Number of reminders checked */
  remindersChecked?: number;
  /** Total tools in the MCP catalog */
  availableTools?: number;
  /** Optional extra className applied to the root element */
  className?: string;
}

/**
 * AthenaMcpContextBar — standardized MCP execution status bar for all Athena chat panels.
 *
 * Displays a compact row of colored badges reflecting the last Athena turn's MCP state:
 * abilities persona, knowledge graph hits, code/AST hits, workspace tasks, and reminders.
 *
 * Usage: Add this component to any Athena chat panel header after a successful response.
 * Hide when no run has occurred (i.e. all props are undefined).
 */
export function AthenaMcpContextBar({
  persona,
  knowledgeRefs,
  codeRefs,
  workspaceTasks,
  remindersChecked,
  availableTools,
  className = "",
}: AthenaMcpContextBarProps) {
  const hasAnyData =
    persona !== undefined ||
    knowledgeRefs !== undefined ||
    codeRefs !== undefined ||
    workspaceTasks !== undefined ||
    remindersChecked !== undefined ||
    availableTools !== undefined;

  if (!hasAnyData) return null;

  return (
    <div
      className={`flex items-center gap-1.5 flex-wrap px-2 py-1 border-t border-[var(--cp-border)]/50 bg-[var(--cp-bg-0)]/60 font-mono ${className}`}
      title="Savant MCP execution state from last Athena turn"
    >
      <span className="inline-flex items-center gap-1 text-[8px] text-muted-foreground uppercase tracking-wider opacity-60 shrink-0">
        <Cpu size={9} />
        MCP:
      </span>

      {persona && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold border bg-cyan-500/10 border-cyan-500/30 text-cyan-400 uppercase tracking-wide shrink-0">
          <Zap size={8} />
          {persona}
        </span>
      )}

      {knowledgeRefs !== undefined && (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shrink-0">
          KG: {knowledgeRefs}
        </span>
      )}

      {codeRefs !== undefined && (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold border bg-purple-500/10 border-purple-500/30 text-purple-400 shrink-0">
          AST: {codeRefs}
        </span>
      )}

      {workspaceTasks !== undefined && (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold border bg-amber-500/10 border-amber-500/30 text-amber-400 shrink-0">
          Tasks: {workspaceTasks}
        </span>
      )}

      {remindersChecked !== undefined && (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold border bg-blue-500/10 border-blue-500/30 text-blue-400 shrink-0">
          ⏰ {remindersChecked}
        </span>
      )}

      {availableTools !== undefined && (
        <span className="px-1.5 py-0.5 rounded text-[8px] border bg-zinc-700/40 border-zinc-600/30 text-zinc-400 shrink-0">
          {availableTools} tools
        </span>
      )}
    </div>
  );
}
