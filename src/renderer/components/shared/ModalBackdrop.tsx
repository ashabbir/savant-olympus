import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalBackdropProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function ModalBackdrop({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-xl",
}: ModalBackdropProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full ${maxWidth} bg-[var(--cp-bg-3)] border border-[var(--cp-border)] rounded-lg shadow-2xl overflow-hidden flex flex-col font-mono text-foreground`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--cp-border)] bg-[var(--cp-bg-2)]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--cp-cyan)]">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1 rounded hover:bg-[var(--cp-bg-1)]"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="p-4 overflow-y-auto max-h-[80vh]">{children}</div>
      </div>
    </div>
  );
}
