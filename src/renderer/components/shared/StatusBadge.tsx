import React from "react";

export interface StatusBadgeProps {
  status: string;
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  size?: "sm" | "md";
}

export function StatusBadge({ status, variant = "neutral", size = "sm" }: StatusBadgeProps) {
  const variantStyles = {
    success: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
    warning: "bg-amber-500/15 border-amber-500/40 text-amber-400",
    error: "bg-red-500/15 border-red-500/40 text-red-400",
    info: "bg-cyan-500/15 border-cyan-500/40 text-cyan-400",
    neutral: "bg-slate-500/15 border-slate-500/40 text-slate-300",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[9px]",
    md: "px-2.5 py-1 text-[10px]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full font-mono font-bold uppercase tracking-wider ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
