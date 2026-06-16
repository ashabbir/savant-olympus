import React, { useState, useEffect } from "react";
import { Bell, RefreshCw, X, AlertTriangle, CheckCircle2, EyeOff } from "lucide-react";
import { Calendar } from "../ui/calendar";

interface Reminder {
  id: string;
  text: string;
  description?: string;
  due_date: string;
  status: "pending" | "done" | "dismissed";
  user_id?: string;
}

interface UserOption {
  user_id: string;
  name: string;
}

interface RemindersViewProps {
  serverUrl: string;
  apiKey: string;
}

const DEFAULT_REMINDERS: Reminder[] = [
  {
    id: "rem-1",
    text: "Backup savant database",
    description: "Perform full backup of SQLite instances",
    due_date: "2026-06-20T12:00:00Z",
    status: "pending",
    user_id: "ahmed"
  },
  {
    id: "rem-2",
    text: "Update firewall rules",
    description: "Audit security groups and close unused ports",
    due_date: "2026-06-15T15:00:00Z",
    status: "done",
    user_id: "lex"
  },
  {
    id: "rem-3",
    text: "Review user access logs",
    description: "Perform weekly audit of login activities",
    due_date: "2026-06-14T09:00:00Z",
    status: "dismissed",
    user_id: "ahmed"
  }
];

export function RemindersView({ serverUrl, apiKey }: RemindersViewProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "done" | "dismissed">("all");
  const [userFilter, setUserFilter] = useState<string>("all");

  const baseUrl = serverUrl.replace(/\/+$/, "");

  const fetchReminders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/reminders?_=${Date.now()}`, {
        headers: { "X-API-Key": apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setReminders(list.length > 0 ? list : DEFAULT_REMINDERS);
      } else {
        setError(`Failed to fetch reminders: ${res.status} ${res.statusText}`);
        setReminders(DEFAULT_REMINDERS);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to reach server");
      setReminders(DEFAULT_REMINDERS);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/users?include_inactive=true&_=${Date.now()}`, {
        headers: { "X-API-Key": apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        const mapped = list.map((u: any) => {
          const uid = u.user_id || u.username || u.id || "";
          return {
            user_id: uid,
            name: u.name || uid || "Unknown User"
          };
        }).filter(u => u.user_id);

        const unique: UserOption[] = [];
        const seen = new Set<string>();
        for (const u of mapped) {
          if (!seen.has(u.user_id)) {
            seen.add(u.user_id);
            unique.push(u);
          }
        }
        setUsers(unique);
      } else {
        setUsers([
          { user_id: "ahmed", name: "Ahmed Shabbir" },
          { user_id: "lex", name: "Lex Friedman" }
        ]);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setUsers([
        { user_id: "ahmed", name: "Ahmed Shabbir" },
        { user_id: "lex", name: "Lex Friedman" }
      ]);
    }
  };

  useEffect(() => {
    fetchReminders();
    fetchUsers();
  }, [baseUrl]);

  // Check if a date has any pending reminder
  const isPendingReminderDate = (date: Date) => {
    return reminders.some(r => {
      if (r.status !== "pending" || !r.due_date) return false;
      const dueDate = new Date(r.due_date);
      return (
        date.getDate() === dueDate.getDate() &&
        date.getMonth() === dueDate.getMonth() &&
        date.getFullYear() === dueDate.getFullYear()
      );
    });
  };

  const formatDueDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  // Filter logic
  const filteredReminders = reminders.filter(r => {
    // 1. Filter by status
    if (statusFilter !== "all" && r.status !== statusFilter) {
      return false;
    }
    // 2. Filter by selected calendar date
    if (selectedDate) {
      if (!r.due_date) return false;
      const dueDate = new Date(r.due_date);
      const isSameDay = (
        selectedDate.getDate() === dueDate.getDate() &&
        selectedDate.getMonth() === dueDate.getMonth() &&
        selectedDate.getFullYear() === dueDate.getFullYear()
      );
      if (!isSameDay) return false;
    }
    // 3. Filter by selected user
    if (userFilter !== "all" && r.user_id !== userFilter) {
      return false;
    }
    return true;
  });

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case "pending":
        return "border-[var(--cp-yellow)] text-[var(--cp-yellow)] bg-[rgba(255,230,0,0.05)]";
      case "done":
        return "border-[var(--cp-green)] text-[var(--cp-green)] bg-[rgba(0,255,136,0.05)]";
      case "dismissed":
        return "border-gray-500/30 text-muted-foreground/60 bg-[rgba(255,255,255,0.02)]";
      default:
        return "border-[var(--cp-border)] text-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <AlertTriangle size={12} className="text-[var(--cp-yellow)]" />;
      case "done":
        return <CheckCircle2 size={12} className="text-[var(--cp-green)]" />;
      case "dismissed":
        return <EyeOff size={12} className="text-muted-foreground/60" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--cp-cyan)] tracking-wider flex items-center gap-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            <Bell size={18} className="text-[var(--cp-cyan)] animate-pulse" />
            // SYSTEM REMINDERS
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">Scheduled administrative tasks, checkpoints, and pending operations alerts</p>
        </div>
        <button
          onClick={fetchReminders}
          disabled={isLoading}
          style={{ borderColor: "rgba(0, 229, 255, 0.3)" }}
          className="p-1.5 border text-xs text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-50 flex items-center gap-1.5 font-mono cursor-pointer transition-all duration-200"
          title="Refresh Reminders"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          <span className="text-[10px] tracking-wider uppercase">REFRESH</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
        {/* Left Column: Calendar & Filters */}
        <div className="w-full md:w-80 flex flex-col space-y-4 shrink-0">
          {/* Calendar Widget */}
          <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-3 flex flex-col items-center">
            <h3 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider font-mono w-full text-left mb-2">// Scheduler Matrix</h3>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-2 w-full flex justify-center"
              modifiers={{
                hasReminder: isPendingReminderDate
              }}
              modifiersStyles={{
                hasReminder: {
                  border: "2px solid var(--cp-yellow)",
                  borderRadius: "4px",
                  color: "var(--cp-yellow)",
                  boxShadow: "0 0 6px rgba(255, 230, 0, 0.4)",
                  fontWeight: "bold",
                  backgroundColor: "rgba(255, 230, 0, 0.1)"
                }
              }}
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(undefined)}
                className="mt-3 w-full py-1 border border-[var(--cp-magenta)] hover:bg-[rgba(255,0,170,0.1)] text-[10px] text-[var(--cp-magenta)] font-mono flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer"
              >
                <X size={10} />
                CLEAR DATE FILTER
              </button>
            )}
          </div>

          {/* Status Filters */}
          <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-3 space-y-2">
            <h3 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider font-mono">// Status Filters</h3>
            <div className="grid grid-cols-2 gap-2">
              {(["all", "pending", "done", "dismissed"] as const).map((status) => {
                const isActive = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2 py-1.5 border text-xs font-mono transition-all duration-200 cursor-pointer text-center truncate ${
                      isActive
                        ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.1)] text-[var(--cp-cyan)] shadow-[0_0_6px_rgba(0,229,255,0.2)]"
                        : "border-[var(--cp-border)] bg-[var(--cp-bg-2)] text-muted-foreground hover:border-[rgba(0,229,255,0.3)] hover:text-foreground"
                    }`}
                  >
                    {status.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Filters */}
          <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-3 space-y-2">
            <h3 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider font-mono">// User Filters</h3>
            <div className="relative">
              <select
                id="user-filter-select"
                aria-label="Filter by user"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground hover:border-[rgba(0,229,255,0.3)] px-3 py-1.5 pr-8 text-xs font-mono focus:outline-none focus:border-[var(--cp-cyan)] focus:shadow-[0_0_6px_rgba(0,229,255,0.2)] transition-all duration-200 cursor-pointer appearance-none rounded-none"
              >
                <option value="all">ALL USERS</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.name.toUpperCase()} ({u.user_id})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--cp-cyan)]">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Reminders List */}
        <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs uppercase text-[var(--cp-cyan)] tracking-wider font-mono flex items-center gap-1.5">
              // ACTIVE_TASKS_QUEUE
              {selectedDate && (
                <span className="text-[10px] text-muted-foreground lowercase">
                  (due on {selectedDate.toLocaleDateString()})
                </span>
              )}
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground">
              COUNT: {filteredReminders.length}
            </span>
          </div>

          {error && !reminders.length && (
            <div className="p-3 mb-3 border border-[var(--cp-magenta)]/30 bg-[rgba(255,0,170,0.02)] text-xs text-[var(--cp-magenta)] font-mono">
              [WARNING] {error}. Using simulated offline cache.
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {isLoading && reminders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-12">
                <span className="text-xs tracking-widest font-mono text-[var(--cp-cyan)] uppercase animate-pulse">
                  establishing_api_link...
                </span>
              </div>
            ) : filteredReminders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-12">
                <Bell size={32} className="text-muted-foreground mb-2" />
                <span className="text-xs tracking-widest font-mono text-[var(--cp-cyan)] uppercase">
                  queue_empty
                </span>
              </div>
            ) : (
              filteredReminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="p-3 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] hover:border-[rgba(0,229,255,0.25)] hover:shadow-[0_0_8px_rgba(0,229,255,0.05)] transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <span className="text-[var(--cp-cyan)] font-mono text-xs font-normal">#{reminder.id}</span>
                      <span className="truncate">{reminder.text}</span>
                    </div>
                    {reminder.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 pr-2">
                        {reminder.description}
                      </p>
                    )}
                    <div className="text-[10px] font-mono text-muted-foreground opacity-70 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <div className="flex items-center gap-1.5">
                        <span>DUE_DATE:</span>
                        <span className="text-foreground">{formatDueDate(reminder.due_date)}</span>
                      </div>
                      {reminder.user_id && (
                        <div className="flex items-center gap-1.5 border-l border-[var(--cp-border)] pl-3">
                          <span>USER:</span>
                          <span className="text-[var(--cp-cyan)]">{reminder.user_id.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className={`text-[9px] px-2 py-0.5 border font-semibold tracking-wider font-mono flex items-center gap-1.5 ${getStatusBadgeStyles(
                        reminder.status
                      )}`}
                    >
                      {getStatusIcon(reminder.status)}
                      {reminder.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
