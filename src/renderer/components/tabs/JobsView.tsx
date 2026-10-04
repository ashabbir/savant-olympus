import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers,
  ChevronRight,
  RefreshCw,
  X,
  XCircle,
  Trash2,
  Copy,
  Check,
  Search,
  Filter,
  AlertTriangle,
  Play,
  RotateCw,
} from "lucide-react";
import { createContextService } from "../../services/contextService";

export interface JobRecord {
  id: string;
  job_type: string;
  target: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled" | "cancelling";
  progress: number;
  phase?: string;
  message?: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  result?: any;
}

export const formatJobDuration = (startedAt?: string | null, finishedAt?: string | null) => {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  if (diffMs < 1000) return `${diffMs} ms`;
  if (diffMs < 60_000) return `${(diffMs / 1000).toFixed(1)} s`;
  const minutes = Math.floor(diffMs / 60_000);
  const seconds = Math.round((diffMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  } catch {
    return String(value);
  }
};

export const statusColor = (status: string) => {
  switch (status) {
    case "done":
    case "success":
    case "completed":
      return "#27f2a4";
    case "running":
    case "cancelling":
      return "#7dd3fc";
    case "queued":
      return "#ffbd59";
    case "failed":
      return "#ff4d78";
    case "cancelled":
      return "#a1a1aa";
    default:
      return "#9ca3af";
  }
};

export function JobsView({
  serverUrl,
  apiKey,
  isAdmin,
}: {
  serverUrl: string;
  apiKey: string;
  isAdmin: boolean;
}) {
  const service = useMemo(() => createContextService(serverUrl, apiKey), [serverUrl, apiKey]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [targetSearch, setTargetSearch] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [actionNotice, setActionNotice] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    try {
      const res = await service.listJobs();
      const list: JobRecord[] = Array.isArray(res) ? res : res.jobs || [];
      setJobs(list);
      setSummary(res.summary || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load jobs");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, service]);

  useEffect(() => {
    void load();
  }, [load]);

  // Periodic polling for live updates when auto-refresh is active
  useEffect(() => {
    if (!autoRefresh || !isAdmin) return;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const res = await service.listJobs();
          const list: JobRecord[] = Array.isArray(res) ? res : res.jobs || [];
          setJobs(list);
          setSummary(res.summary || null);
        } catch {
          // ignore transient poll error
        }
      })();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, isAdmin, service]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedJob(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCopy = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCancelJob = async (jobId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Cancel job ${jobId.slice(0, 8)}?`)) return;
    try {
      await service.cancelJob(jobId);
      setActionNotice(`Cancellation requested for job ${jobId.slice(0, 8)}`);
      await load();
      setTimeout(() => setActionNotice(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel job");
    }
  };

  const handleDeleteJob = async (jobId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Delete finished job ${jobId.slice(0, 8)}?`)) return;
    try {
      await service.deleteJob(jobId);
      setActionNotice(`Job ${jobId.slice(0, 8)} deleted`);
      if (selectedJob?.id === jobId) setSelectedJob(null);
      await load();
      setTimeout(() => setActionNotice(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job");
    }
  };

  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (statusFilter !== "all") {
        if (statusFilter === "running" && !["running", "cancelling"].includes(job.status)) return false;
        if (statusFilter !== "running" && job.status !== statusFilter) return false;
      }
      if (typeFilter !== "all" && job.job_type !== typeFilter) return false;
      if (targetSearch.trim()) {
        const query = targetSearch.toLowerCase();
        const matchesTarget = job.target?.toLowerCase().includes(query);
        const matchesId = job.id?.toLowerCase().includes(query);
        const matchesType = job.job_type?.toLowerCase().includes(query);
        if (!matchesTarget && !matchesId && !matchesType) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, typeFilter, targetSearch]);

  const distinctTypes = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => {
      if (j.job_type) set.add(j.job_type);
    });
    return Array.from(set).sort();
  }, [jobs]);

  const counts = useMemo(() => {
    let queued = 0;
    let running = 0;
    let done = 0;
    let failed = 0;
    let cancelled = 0;
    jobs.forEach((j) => {
      if (j.status === "queued") queued++;
      else if (j.status === "running" || j.status === "cancelling") running++;
      else if (j.status === "done") done++;
      else if (j.status === "failed") failed++;
      else if (j.status === "cancelled") cancelled++;
    });
    return { total: jobs.length, queued, running, done, failed, cancelled };
  }, [jobs]);

  if (!isAdmin) {
    return (
      <main className="h-full grid place-items-center text-sm opacity-60">
        Administrator access required to inspect and manage jobs.
      </main>
    );
  }

  return (
    <section className="h-full overflow-hidden flex flex-col p-5 gap-4" style={{ background: "var(--cp-bg-0)" }}>
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[var(--cp-cyan)]">
            <Layers size={18} />
            <h1 className="font-bold tracking-[0.18em]">JOB QUEUE & WORKERS</h1>
          </div>
          <p className="text-xs opacity-55 mt-1">
            Dedicated worker container queue: indexing, AST parsing, LST, and CodeGraph synchronization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs opacity-75 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-[var(--cp-cyan)]"
            />
            Auto-refresh (3s)
          </label>
          <button
            aria-label="Refresh job list"
            onClick={() => void load()}
            className="p-2 border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-cyan-500/10 transition-colors"
            title="Refresh jobs"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <KpiCard label="Total Jobs" value={counts.total} color="var(--cp-cyan)" active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <KpiCard label="Running" value={counts.running} color="#7dd3fc" active={statusFilter === "running"} onClick={() => setStatusFilter("running")} pulse={counts.running > 0} />
        <KpiCard label="Queued" value={counts.queued} color="#ffbd59" active={statusFilter === "queued"} onClick={() => setStatusFilter("queued")} />
        <KpiCard label="Completed" value={counts.done} color="#27f2a4" active={statusFilter === "done"} onClick={() => setStatusFilter("done")} />
        <KpiCard label="Failed" value={counts.failed} color="#ff4d78" active={statusFilter === "failed"} onClick={() => setStatusFilter("failed")} />
        <KpiCard label="Cancelled" value={counts.cancelled} color="#a1a1aa" active={statusFilter === "cancelled"} onClick={() => setStatusFilter("cancelled")} />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-3 items-center text-xs">
        <div className="flex items-center gap-2 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-2.5 py-1.5 flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="opacity-50 text-[var(--cp-cyan)]" />
          <input
            type="text"
            placeholder="Search by repo, type, or ID..."
            value={targetSearch}
            onChange={(e) => setTargetSearch(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-xs text-[var(--cp-text)]"
          />
          {targetSearch && (
            <button onClick={() => setTargetSearch("")} className="opacity-50 hover:opacity-100">
              <X size={12} />
            </button>
          )}
        </div>

        <select
          aria-label="Filter by Job Type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-3 py-2 text-xs"
        >
          <option value="all">All Job Types</option>
          {distinctTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <span className="ml-auto opacity-55 text-xs">{visibleJobs.length} jobs listed</span>
      </div>

      {actionNotice && (
        <div className="border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 p-2.5 text-xs flex items-center gap-2">
          <Check size={14} />
          {actionNotice}
        </div>
      )}

      {error && (
        <div role="alert" className="border border-red-500/40 bg-red-500/10 text-red-300 p-3 text-xs flex items-center gap-2">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-[var(--cp-bg-2)] text-left text-[10px] uppercase tracking-wider z-10">
            <tr>
              {["Job ID", "Type", "Target Repo", "Status", "Progress / Phase", "Created", "Duration", "Actions", ""].map((header) => (
                <th key={header} className="p-3 border-b border-[var(--cp-border)]">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleJobs.map((job) => {
              const isRunning = job.status === "running" || job.status === "cancelling";
              const isQueued = job.status === "queued";
              const canCancel = isRunning || isQueued;
              const canDelete = !isRunning;

              return (
                <tr
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="border-b border-[var(--cp-border)] hover:bg-cyan-400/5 cursor-pointer transition-colors"
                >
                  {/* Job ID */}
                  <td className="p-3 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-opacity-80">{job.id.slice(0, 8)}</span>
                      <button
                        title="Copy full Job ID"
                        onClick={(e) => handleCopy(job.id, e)}
                        className="opacity-40 hover:opacity-100 p-0.5 text-[var(--cp-cyan)]"
                      >
                        {copiedId === job.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded text-[11px] font-mono text-[var(--cp-cyan)]">
                      {job.job_type}
                    </span>
                  </td>

                  {/* Target Repo */}
                  <td className="p-3 font-semibold text-[var(--cp-text)]">{job.target}</td>

                  {/* Status */}
                  <td className="p-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: statusColor(job.status) }}>
                      <span
                        className={`size-2 rounded-full inline-block ${isRunning ? "animate-ping" : ""}`}
                        style={{ backgroundColor: statusColor(job.status) }}
                      />
                      {job.status}
                    </span>
                  </td>

                  {/* Progress / Phase */}
                  <td className="p-3 min-w-[180px]">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="opacity-80 truncate max-w-[140px]" title={job.phase || job.message || ""}>
                          {job.phase || (isQueued ? "Waiting in queue" : "Processing")}
                        </span>
                        <span className="font-mono">{job.progress ?? 0}%</span>
                      </div>
                      <div className="w-full bg-[var(--cp-bg-0)] border border-[var(--cp-border)] h-1.5 overflow-hidden">
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${Math.min(Math.max(job.progress ?? 0, 0), 100)}%`,
                            backgroundColor: statusColor(job.status),
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Created */}
                  <td className="p-3 whitespace-nowrap opacity-65 font-mono text-[11px]">
                    {formatDateTime(job.created_at)}
                  </td>

                  {/* Duration */}
                  <td className="p-3 whitespace-nowrap font-mono text-[11px] opacity-75">
                    {formatJobDuration(job.started_at, job.finished_at)}
                  </td>

                  {/* Actions */}
                  <td className="p-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {canCancel && (
                        <button
                          title="Cancel Job"
                          onClick={(e) => handleCancelJob(job.id, e)}
                          className="flex items-center gap-1 px-2 py-1 border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-[10px] font-mono transition-colors"
                        >
                          <XCircle size={12} />
                          Cancel
                        </button>
                      )}
                      {canDelete && (
                        <button
                          title="Delete Job Record"
                          onClick={(e) => handleDeleteJob(job.id, e)}
                          className="p-1 border border-[var(--cp-border)] text-red-400/70 hover:text-red-300 hover:border-red-500/50 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Arrow */}
                  <td className="p-3 text-right">
                    <ChevronRight size={14} className="opacity-40" />
                  </td>
                </tr>
              );
            })}

            {!loading && !visibleJobs.length && (
              <tr>
                <td colSpan={9} className="p-12 text-center opacity-50">
                  No jobs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Side Drawer for Job Details */}
      {selectedJob && (
        <JobInfoDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onCancel={handleCancelJob}
          onDelete={handleDeleteJob}
          onCopy={handleCopy}
          copiedId={copiedId}
        />
      )}
    </section>
  );
}

function KpiCard({
  label,
  value,
  color,
  active,
  pulse,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active?: boolean;
  pulse?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-3 text-left border transition-all ${
        active ? "border-[var(--cp-cyan)] bg-cyan-500/10" : "border-[var(--cp-border)] bg-[var(--cp-bg-1)] hover:border-cyan-500/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider opacity-60">{label}</span>
        {pulse && <span className="size-2 rounded-full bg-cyan-400 animate-ping inline-block" />}
      </div>
      <div className="text-xl font-bold font-mono mt-1" style={{ color }}>
        {value}
      </div>
    </button>
  );
}

function JobInfoDrawer({
  job,
  onClose,
  onCancel,
  onDelete,
  onCopy,
  copiedId,
}: {
  job: JobRecord;
  onClose: () => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  copiedId: string | null;
}) {
  const isRunning = job.status === "running" || job.status === "cancelling";
  const canCancel = isRunning || job.status === "queued";
  const canDelete = !isRunning;

  return (
    <div
      role="dialog"
      aria-label="Job Details"
      className="fixed inset-0 z-[1000] flex justify-end bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-2xl overflow-auto border-l border-[var(--cp-cyan)] bg-[var(--cp-bg-1)] p-6 shadow-2xl flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-start border-b border-[var(--cp-border)] pb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--cp-cyan)]">Job Details</div>
            <h2 className="text-xl font-bold mt-1 flex items-center gap-2">
              <span>{job.job_type}</span>
              <span className="opacity-40">·</span>
              <span className="text-[var(--cp-cyan)]">{job.target}</span>
            </h2>
          </div>
          <button aria-label="Close job details" onClick={onClose} className="p-1 hover:text-[var(--cp-cyan)]">
            <X size={20} />
          </button>
        </header>

        {/* Quick Actions */}
        <div className="flex items-center gap-3">
          {canCancel && (
            <button
              onClick={() => onCancel(job.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-orange-500/50 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 text-xs font-mono transition-colors"
            >
              <XCircle size={14} />
              Cancel Job
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(job.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs font-mono transition-colors"
            >
              <Trash2 size={14} />
              Delete Record
            </button>
          )}
        </div>

        {/* Status & Progress Card */}
        <div className="p-4 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold" style={{ color: statusColor(job.status) }}>
              ● Status: {job.status.toUpperCase()}
            </span>
            <span className="font-mono text-sm">{job.progress ?? 0}%</span>
          </div>

          <div className="w-full bg-[var(--cp-bg-0)] border border-[var(--cp-border)] h-2 overflow-hidden">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.min(Math.max(job.progress ?? 0, 0), 100)}%`,
                backgroundColor: statusColor(job.status),
              }}
            />
          </div>

          {(job.phase || job.message) && (
            <div className="text-xs opacity-80 mt-1">
              {job.phase && <span className="font-semibold text-[var(--cp-cyan)]">{job.phase}: </span>}
              <span>{job.message || "—"}</span>
            </div>
          )}
        </div>

        {/* Key Attributes */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--cp-cyan)]">Metadata</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetaRow label="Job ID">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span>{job.id}</span>
                <button onClick={() => onCopy(job.id)} className="text-[var(--cp-cyan)]">
                  {copiedId === job.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                </button>
              </div>
            </MetaRow>
            <MetaRow label="Target Repo">{job.target}</MetaRow>
            <MetaRow label="Job Type">{job.job_type}</MetaRow>
            <MetaRow label="Created At">{formatDateTime(job.created_at)}</MetaRow>
            <MetaRow label="Started At">{formatDateTime(job.started_at)}</MetaRow>
            <MetaRow label="Finished At">{formatDateTime(job.finished_at)}</MetaRow>
            <MetaRow label="Execution Duration">{formatJobDuration(job.started_at, job.finished_at)}</MetaRow>
          </div>
        </section>

        {/* Error Details */}
        {job.status === "failed" && job.message && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-red-400">Error Information</h3>
            <div className="p-3 border border-red-500/40 bg-red-500/10 text-red-300 font-mono text-xs whitespace-pre-wrap max-h-48 overflow-auto">
              {job.message}
            </div>
          </section>
        )}

        {/* Raw Payload / Result */}
        {job.result && Object.keys(job.result).length > 0 && (
          <section className="flex flex-col gap-2 flex-1 min-h-[160px]">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--cp-cyan)]">Payload & Execution Results</h3>
            <pre className="p-3 border border-[var(--cp-border)] bg-[var(--cp-bg-0)] text-[var(--cp-cyan)] font-mono text-[11px] overflow-auto flex-1 max-h-80">
              {JSON.stringify(job.result, null, 2)}
            </pre>
          </section>
        )}
      </aside>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-2.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wider opacity-50">{label}</span>
      <div className="text-xs break-all">{children}</div>
    </div>
  );
}
