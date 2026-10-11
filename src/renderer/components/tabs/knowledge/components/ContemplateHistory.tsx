import React, { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { KnowledgeService, KnowledgeMaintenanceHistory } from "@/services/knowledgeService";

export function ContemplateHistory({ service, onClose }: { service: KnowledgeService; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<KnowledgeMaintenanceHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true);
    setHistory(null);
    setError("");
    void service.getMaintenanceRuns(page).then(result => {
      if (id === request.current) setHistory(result);
    }).catch(err => {
      if (id === request.current) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (id === request.current) setLoading(false);
    });
    return () => { request.current++; };
  }, [service, page, refresh]);

  const download = async (runId: number) => {
    setDownloading(runId);
    setError("");
    try {
      const report = await service.getMaintenanceReport(runId);
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `contemplate-run-${runId}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-3rem)] max-w-3xl max-h-[calc(100%-3rem)] overflow-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 text-xs">
        <div className="flex items-center justify-between gap-4 mb-4">
          <Dialog.Title>Contemplate run history</Dialog.Title>
          <div className="flex gap-4">
            <button onClick={() => setRefresh(value => value + 1)} disabled={loading}>Refresh</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        {error && <p role="alert" className="text-red-400 mb-3">{error}</p>}
        {loading ? <p role="status">Loading runs…</p> : history?.runs.length === 0 ? <p>No runs yet.</p> : null}
        {!loading && history?.runs.map(run => (
          <article key={run.id} className="border-t border-[var(--cp-border)] py-3">
            <div className="flex items-center justify-between gap-4">
              <span>Run {run.id} · {run.status.toUpperCase()} · {run.trigger} · {new Date(run.finished_at || run.started_at).toLocaleString()}</span>
              {run.report_available ? <button disabled={downloading !== null} onClick={() => void download(run.id)}>{downloading === run.id ? "Downloading…" : "Download report"}</button> : <span>Undo report unavailable</span>}
            </div>
            <p className="mt-2 text-muted-foreground">
              {run.nodes_promoted} committed · {run.duplicates_merged} merged · {run.nodes_expired} expired · {run.edges_pruned} edges pruned · {" "}
              {run.details?.affected_node_count === undefined ? "Merge/delete count unavailable" : `${run.details.affected_node_count}/20 merge/delete nodes`} · {" "}
              {run.details?.deferred_operations ?? 0} deferred{run.details?.limit_reached ? " · Limit reached" : ""}
            </p>
            {run.error && <p className="text-red-400 mt-1">{run.error}</p>}
          </article>
        ))}
        <div className="flex items-center justify-between mt-4">
          <button disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
          <span>Page {page} of {Math.max(1, Math.ceil((history?.total ?? 0) / 20))}</span>
          <button disabled={loading || !history || page * 20 >= history.total} onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
