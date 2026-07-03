import React, { useState, useEffect } from "react";
import { Folder, ChevronRight, ChevronLeft, X, Check } from "lucide-react";

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface FileBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath: string;
  basePath: string;
  serverUrl: string;
  apiKey: string;
}

export function FileBrowserModal({ isOpen, onClose, onSelect, initialPath, basePath, serverUrl, apiKey }: FileBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || basePath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDirectory(currentPath);
    }
  }, [isOpen, currentPath]);

  const loadDirectory = async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const baseUrl = serverUrl.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/api/context/repos/browse?path=${encodeURIComponent(path)}`, {
        headers: { "X-API-Key": apiKey },
      });
      if (res.ok) {
        const results = await res.json();
        setEntries(results || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to load directory: ${res.status} ${res.statusText}`);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load directory from server");
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigate = (entry: FileEntry) => {
    if (entry.isDirectory) {
      setCurrentPath(entry.path);
    }
  };

  const handleGoBack = () => {
    if (currentPath === "" || currentPath === basePath) return;
    const parts = currentPath.split(/[/\\]/);
    if (parts.length > 0) {
      parts.pop();
      setCurrentPath(parts.join("/"));
    }
  };

  const handleConfirm = () => {
    // Return relative path (currentPath is already relative to BASE_CODE_DIR)
    onSelect(currentPath);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 font-mono">
      <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-2xl h-[500px] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--cp-border)] p-3 bg-[var(--cp-bg-2)]">
          <div className="flex items-center gap-2">
            <Folder size={16} className="text-[var(--cp-cyan)]" />
            <span className="text-xs font-bold text-[var(--cp-cyan)] tracking-wider">
              BROWSE SERVER (BASE_CODE_DIR)
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Path Breadcrumbs / Nav */}
        <div className="flex items-center gap-2 p-2 bg-[var(--cp-bg-3)] border-b border-[var(--cp-border)] text-[10px]">
          <button 
            onClick={handleGoBack}
            disabled={currentPath === "" || currentPath === basePath}
            className="p-1 hover:bg-[var(--cp-bg-4)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
          </button>
          <div className="flex-1 truncate opacity-70">
            BASE_CODE_DIR / {currentPath || ""}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-xs opacity-50 italic">
              Loading directory content...
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-xs text-red-400 p-4 text-center">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs opacity-30 italic">
              Empty directory
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => handleNavigate(entry)}
                className={`flex items-center justify-between p-2 text-xs hover:bg-[var(--cp-bg-2)] group cursor-pointer transition-colors ${
                  entry.isDirectory ? "text-foreground" : "text-muted-foreground opacity-60"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder
                    size={14}
                    className={entry.isDirectory ? "text-amber-500/70" : "text-muted-foreground/40"}
                  />
                  <span className="truncate">{entry.name}</span>
                </div>
                {entry.isDirectory && (
                  <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-[var(--cp-cyan)]" />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--cp-border)] p-3 bg-[var(--cp-bg-2)] flex justify-between items-center">
          <div className="text-[9px] text-muted-foreground max-w-[70%] truncate">
            Selected: <span className="text-foreground">{currentPath}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[10px] border border-[var(--cp-border)] hover:bg-[var(--cp-bg-3)] uppercase"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-1.5 text-[10px] bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold hover:opacity-90 flex items-center gap-1.5 uppercase"
            >
              <Check size={14} /> Select Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
