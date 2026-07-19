import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-[var(--cp-border)] rounded-lg bg-[var(--cp-bg-2)]/50 my-auto font-mono space-y-3">
      {icon && <div className="text-muted-foreground opacity-80">{icon}</div>}
      <div className="space-y-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {description && (
          <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed font-sans font-normal">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
