import React from "react";
import { RefreshCw } from "lucide-react";

interface ViewHeaderProps {
  title: string;
  description?: string;
  count?: number;
  countLabel?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  actions?: React.ReactNode;
}

export function ViewHeader({
  title,
  description,
  count,
  countLabel = "items",
  onRefresh,
  isRefreshing = false,
  actions,
}: ViewHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-[var(--cp-border)] bg-[var(--cp-bg-2)] shrink-0 font-mono">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold uppercase tracking-wider text-[var(--cp-cyan)] font-mono">
            {title}
          </h1>
          {count !== undefined && (
            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-[var(--cp-cyan)]/15 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)]">
              {count} {countLabel}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground font-sans">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 border border-[var(--cp-border)] rounded hover:bg-[var(--cp-bg-3)] hover:text-[var(--cp-cyan)] disabled:opacity-50 transition-all cursor-pointer"
            title="Refresh View"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin text-[var(--cp-cyan)]" : ""} />
          </button>
        )}
        {actions}
      </div>
    </header>
  );
}
