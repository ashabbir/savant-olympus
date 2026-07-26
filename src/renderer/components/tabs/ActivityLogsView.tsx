import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ChevronRight, Clock3, GitCommit, RefreshCw, X } from "lucide-react";
import { createContextService } from "../../services/contextService";

type WindowId = "6h" | "12h" | "1d" | "1w" | "1m";
const WINDOWS: Array<{ id: WindowId; label: string; hours: number }> = [
  { id: "6h", label: "Last 6 hours", hours: 6 },
  { id: "12h", label: "Last 12 hours", hours: 12 },
  { id: "1d", label: "Last day", hours: 24 },
  { id: "1w", label: "Last week", hours: 24 * 7 },
  { id: "1m", label: "Last month", hours: 24 * 30 },
];

export const sortActivitiesNewestFirst = (items: any[]) =>
  [...items].sort((a, b) => {
    const time = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return time || Number(b.id || 0) - Number(a.id || 0);
  });

const jsonValue = (value: any, fallback: any) => {
  if (value && typeof value === "object") return value;
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));

const statusColor = (status: string) => ({
  success: "#27f2a4", done: "#27f2a4", failed: "#ff4d78", partial: "#ffbd59",
  cancelled: "#ffbd59", queued: "#7dd3fc", running: "#7dd3fc", skipped: "#9ca3af",
}[status] || "#9ca3af");

export function ActivityLogsView({ serverUrl, apiKey, isAdmin }: {
  serverUrl: string; apiKey: string; isAdmin: boolean;
}) {
  const service = useMemo(() => createContextService(serverUrl, apiKey), [serverUrl, apiKey]);
  const [windowId, setWindowId] = useState<WindowId>("1d");
  const [repo, setRepo] = useState("");
  const [repos, setRepos] = useState<string[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError("");
    const hours = WINDOWS.find((item) => item.id === windowId)?.hours || 24;
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    try {
      const [activity, repositoryRows] = await Promise.all([
        service.getActivityLogs(repo || undefined, since, 500),
        service.listRepositories(),
      ]);
      setLogs(sortActivitiesNewestFirst(activity.logs || []));
      setRepos(repositoryRows.map((item: any) => item.name).filter(Boolean).sort());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load activity");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, repo, service, windowId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  if (!isAdmin) return <main className="h-full grid place-items-center text-sm opacity-60">Administrator access required.</main>;

  return (
    <section className="h-full overflow-hidden flex flex-col p-5 gap-4" style={{ background: "var(--cp-bg-0)" }}>
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[var(--cp-cyan)]"><Activity size={18} /><h1 className="font-bold tracking-[0.18em]">ACTIVITY LOG</h1></div>
          <p className="text-xs opacity-55 mt-1">Scheduled and user-triggered repository execution history</p>
        </div>
        <button aria-label="Refresh activity logs" onClick={() => void load()} className="p-2 border border-[var(--cp-border)] text-[var(--cp-cyan)]">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      <div className="flex gap-3 items-center text-xs">
        <label className="flex items-center gap-2"><Clock3 size={13} />
          <select aria-label="Time range" value={windowId} onChange={(e) => setWindowId(e.target.value as WindowId)}
            className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-3 py-2">
            {WINDOWS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <select aria-label="Repository" value={repo} onChange={(e) => setRepo(e.target.value)}
          className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-3 py-2 min-w-48">
          <option value="">All repositories</option>
          {repos.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <span className="ml-auto opacity-55">{logs.length} runs</span>
      </div>

      {error && <div role="alert" className="border border-red-500/40 bg-red-500/10 text-red-300 p-3 text-xs">{error}</div>}
      <div className="flex-1 overflow-auto border border-[var(--cp-border)]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-[var(--cp-bg-2)] text-left text-[10px] uppercase tracking-wider">
            <tr>{["Date & time", "Repository", "Activity", "Trigger", "Status", "Commit", "Changes", ""].map((x) => <th key={x} className="p-3 border-b border-[var(--cp-border)]">{x}</th>)}</tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const files = jsonValue(log.files_changed, { added: [], modified: [], deleted: [] });
              const total = files.added.length + files.modified.length + files.deleted.length;
              return <tr key={log.id} onClick={() => setSelected(log)} className="border-b border-[var(--cp-border)] hover:bg-cyan-400/5 cursor-pointer">
                <td className="p-3 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                <td className="p-3 font-semibold text-[var(--cp-cyan)]">{log.repo_name}</td>
                <td className="p-3">{String(log.operation || "").replaceAll("_", " ")}</td>
                <td className="p-3">{log.trigger || "unknown"}{log.actor_id ? ` · ${log.actor_id}` : ""}</td>
                <td className="p-3"><span style={{ color: statusColor(log.status) }}>● {log.status}</span></td>
                <td className="p-3 font-mono">{(log.after_commit || log.before_commit || "—").slice(0, 10)}</td>
                <td className="p-3">{total} files</td>
                <td className="p-3"><ChevronRight size={14} /></td>
              </tr>;
            })}
            {!loading && !logs.length && <tr><td colSpan={8} className="p-12 text-center opacity-50">No activity in this time range.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && <ActivityInfoDrawer log={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function ActivityInfoDrawer({ log, onClose }: { log: any; onClose: () => void }) {
  const files = jsonValue(log.files_changed, { added: [], modified: [], deleted: [] });
  const stats = jsonValue(log.change_stats, {});
  return <div role="dialog" aria-label="Activity information" className="fixed top-0 bottom-0 left-10 right-10 z-[1000] flex justify-end bg-black/65 backdrop-blur-sm">
    <aside className="h-full w-full max-w-5xl overflow-auto border-l border-[var(--cp-cyan)] bg-[var(--cp-bg-1)] p-6 shadow-2xl animate-in slide-in-from-right">
      <header className="flex justify-between items-start border-b border-[var(--cp-border)] pb-4">
        <div><div className="text-[10px] uppercase tracking-[0.25em] text-[var(--cp-cyan)]">Run information</div><h2 className="text-xl font-bold mt-1">{log.repo_name} · {String(log.operation).replaceAll("_", " ")}</h2></div>
        <button aria-label="Close activity information" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5 text-xs">
        {[
          ["Date & time", formatDateTime(log.created_at)], ["Status", log.status], ["Trigger", log.trigger],
          ["Actor", log.actor_id || "system"], ["Source app", log.source_app || "—"], ["Duration", `${log.duration_ms || 0} ms`],
          ["Provider", log.provider || "—"], ["Branch", log.branch || "—"],
        ].map(([label, value]) => <div key={label} className="border border-[var(--cp-border)] p-3"><div className="opacity-45 uppercase text-[9px]">{label}</div><div className="mt-1 break-all">{value}</div></div>)}
      </div>
      <section className="border border-[var(--cp-border)] p-4 mb-4">
        <h3 className="flex gap-2 items-center font-bold"><GitCommit size={15} /> Git changes</h3>
        <div className="font-mono text-xs mt-3 break-all">Before: {log.before_commit || "—"}<br />After: {log.after_commit || "—"}</div>
        {log.commit_subject && <div className="mt-2 text-sm">{log.commit_subject}</div>}
        <div className="flex gap-4 mt-3 text-xs"><span className="text-green-400">+{stats.insertions || 0}</span><span className="text-red-400">-{stats.deletions || 0}</span><span>{stats.files_total || 0} files</span></div>
      </section>
      {(["added", "modified", "deleted"] as const).map((kind) => <section key={kind} className="mb-4">
        <h3 className="uppercase text-[10px] tracking-wider opacity-60">{kind} files ({files[kind]?.length || 0})</h3>
        <div className="mt-2 border border-[var(--cp-border)] font-mono text-xs">{(files[kind] || []).map((file: string) => <div key={file} className="px-3 py-2 border-b border-[var(--cp-border)] last:border-0">{file}</div>)}{!files[kind]?.length && <div className="p-3 opacity-40">None</div>}</div>
      </section>)}
      <section className="border border-[var(--cp-border)] p-4 text-xs"><h3 className="uppercase tracking-wider mb-2">Execution details</h3><pre className="whitespace-pre-wrap break-words">{log.details || "No additional details."}</pre>{log.error && <pre className="mt-3 text-red-300 whitespace-pre-wrap">{log.error}</pre>}</section>
    </aside>
  </div>;
}
