import { Plus } from "lucide-react";
import type { FormEvent } from "react";

interface KnowledgeAddModalProps {
  isOpen: boolean;
  title: string;
  nodeType: string;
  content: string;
  isSubmitting: boolean;
  nodeTypes: string[];
  onTitleChange: (value: string) => void;
  onNodeTypeChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

export function KnowledgeAddModal({
  isOpen,
  title,
  nodeType,
  content,
  isSubmitting,
  nodeTypes,
  onTitleChange,
  onNodeTypeChange,
  onContentChange,
  onClose,
  onSubmit,
}: KnowledgeAddModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 rounded shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2">
          <h3 className="text-sm font-mono text-[var(--section-label)] tracking-wider font-bold">ADD NODE</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Title</label>
            <input type="text" required value={title} onChange={(event) => onTitleChange(event.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs" />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Type</label>
            <select value={nodeType} onChange={(event) => onNodeTypeChange(event.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">
              {nodeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Content</label>
            <textarea rows={4} value={content} onChange={(event) => onContentChange(event.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] resize-none font-mono text-xs" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
              <Plus size={14} />{isSubmitting ? "CREATING..." : "CREATE_NODE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ImportDiff {
  newNodes: any[];
  newEdges: any[];
  existingNodeCount: number;
  existingEdgeCount: number;
}

interface KnowledgeImportExportPanelProps {
  pendingImport: ImportDiff | null;
  importNodes: boolean;
  importEdges: boolean;
  isLoading: boolean;
  onImportNodesChange: (value: boolean) => void;
  onImportEdgesChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function KnowledgeImportExportPanel({
  pendingImport,
  importNodes,
  importEdges,
  isLoading,
  onImportNodesChange,
  onImportEdgesChange,
  onClose,
  onConfirm,
}: KnowledgeImportExportPanelProps) {
  if (!pendingImport) return null;
  const hasAdditions = pendingImport.newNodes.length > 0 || pendingImport.newEdges.length > 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-lg p-6 rounded shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2">
          <div>
            <h3 className="text-sm font-mono text-[var(--section-label)] tracking-wider font-bold">IMPORT PREVIEW</h3>
            <p className="text-[10px] font-mono text-muted-foreground mt-1">Review the graph diff before adding anything.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "ADD NODES", count: pendingImport.newNodes.length, checked: importNodes, onChange: onImportNodesChange },
            { label: "ADD EDGES", count: pendingImport.newEdges.length, checked: importEdges, onChange: onImportEdgesChange },
          ].map((option) => (
            <label key={option.label} className={`border p-3 flex items-start gap-2 cursor-pointer ${option.checked ? "border-[var(--cp-cyan)] bg-[var(--cp-cyan)]/5" : "border-[var(--cp-border)]"}`}>
              <input type="checkbox" checked={option.checked} disabled={option.count === 0} onChange={(event) => option.onChange(event.target.checked)} className="mt-0.5 accent-[var(--cp-cyan)]" />
              <span>
                <span className="block text-xs font-mono text-foreground">{option.label}</span>
                <span className="block text-lg font-mono font-bold text-[var(--cp-cyan)]">{option.count}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-3 text-[10px] font-mono text-muted-foreground space-y-1">
          <div className="text-emerald-400">Required node and edge fields validated.</div>
          <div>{pendingImport.existingNodeCount} existing nodes will be skipped.</div>
          <div>{pendingImport.existingEdgeCount} existing edges will be skipped.</div>
          {!hasAdditions && <div className="text-amber-400">No additions are needed. This graph is already up to date.</div>}
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={isLoading || (!importNodes && !importEdges) || !hasAdditions} className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase font-mono disabled:opacity-50">
            {isLoading ? "IMPORTING..." : "OK, LET'S DO THIS"}
          </button>
        </div>
      </div>
    </div>
  );
}
