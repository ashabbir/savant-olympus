import React from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}: SearchBarProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search size={14} className="absolute left-3 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--cp-bg-1)] border border-[var(--cp-border)] rounded px-9 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
