import React, { useState, useEffect } from "react";
import { Users, Key, Shield, UserCheck, Eye, EyeOff, X, Save, Mail, Plus, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Copy, Activity, Bot, Terminal, Code2, FileText, Check, LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { setStoredApiKey } from "../../services/auth";
import { createUsersService, type UserContributions, type UserUsage } from "../../services/usersService";
import { ALL_CODING_AGENTS_META, buildUserMcpConfig, type AgentProvider, type AgentMcpTransport, type CodingAgentMeta } from "../../services/agentSetupService";

const USAGE_WINDOW_DAYS = 30;

const AGENT_ICONS: Record<AgentProvider, LucideIcon> = {
  copilot: Bot,
  claude: Terminal,
  hermes: Code2,
  codex: FileText,
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const ACTIVE_WITHIN_MS = 24 * 60 * 60 * 1000;

const isRecentlyActive = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= ACTIVE_WITHIN_MS;
};

function UsageCard({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-4 space-y-3" data-testid={testId}>
      <div className="text-[11px] font-bold text-[var(--cp-cyan)] tracking-wider uppercase flex items-center gap-2">
        <Activity size={14} /> {title}
      </div>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground italic bg-[var(--cp-bg-3)] border border-[var(--cp-border)]/50 p-2.5">{children}</p>
  );
}
import { SearchBar } from "../shared/SearchBar";
import { ViewHeader } from "../shared/ViewHeader";
import { StatusBadge } from "../shared/StatusBadge";
import { ModalBackdrop } from "../shared/ModalBackdrop";

interface User {
  id?: string;
  username: string;
  name: string;
  role: string;
  email?: string;
  active: boolean;
  api_key?: string;
  api_keys?: string[];
  last_login_at?: string | null;
}

interface UsersViewProps {
  serverUrl: string;
  apiKey: string;
  isAdmin: boolean;
  activeUserId?: string;
  onSettingsChanged?: () => void;
}

export function UsersView({ serverUrl, apiKey, activeUserId, onSettingsChanged, isAdmin }: UsersViewProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [generatedKeyDetails, setGeneratedKeyDetails] = useState<{ username: string; apiKey: string; role?: string; note?: string } | null>(null);
  const [previewAgentId, setPreviewAgentId] = useState<string>("claude");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isUserPaneOpen, setIsUserPaneOpen] = useState(true);
  const [createUsername, setCreateUsername] = useState("");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("operator");
  const [createActive, setCreateActive] = useState(true);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [userDomains, setUserDomains] = useState<{ domain_node_id: string; domain_title?: string; can_write: boolean }[]>([]);
  const [availableDomains, setAvailableDomains] = useState<{ node_id: string; title: string }[]>([]);
  const [selectedDomainToAdd, setSelectedDomainToAdd] = useState("");
  const [copySource, setCopySource] = useState<User | null>(null);
  const [copyUsername, setCopyUsername] = useState("");
  const [copyName, setCopyName] = useState("");
  const [copyEmail, setCopyEmail] = useState("");
  const [copyError, setCopyError] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const [userUsage, setUserUsage] = useState<UserUsage | null>(null);
  const [usageError, setUsageError] = useState("");
  const [userContributions, setUserContributions] = useState<UserContributions | null>(null);
  const [contributionsError, setContributionsError] = useState("");
  const [isRefreshingContributions, setIsRefreshingContributions] = useState(false);
  const [isAddingAllDomains, setIsAddingAllDomains] = useState(false);
  const [domainBulkNote, setDomainBulkNote] = useState("");
  const [detailTab, setDetailTab] = useState<"profile" | "access" | "usage" | "contributions">("profile");
  const [enabledAgents, setEnabledAgents] = useState<string[] | null>(null);
  const [mcpEndpoints, setMcpEndpoints] = useState<Record<string, string>>({});
  const [mcpTransport, setMcpTransport] = useState<AgentMcpTransport>("streamable-http");
  const [userApiKeysMap, setUserApiKeysMap] = useState<Record<string, string>>({});
  const [copiedAgentId, setCopiedAgentId] = useState<string | null>(null);
  const [showMcpPreview, setShowMcpPreview] = useState(false);
  const usersService = createUsersService(serverUrl, apiKey);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const settings = await (window as any).system?.getSettings?.();
        if (active && settings) {
          const ea = settings?.["agents:enabledList"] ?? settings?.["agents:enabled"];
          setEnabledAgents(Array.isArray(ea) ? ea : null);
          if (settings?.["mcp:endpoints"]) {
            setMcpEndpoints(settings["mcp:endpoints"]);
          }
          if (settings?.["mcp:transport"]) {
            setMcpTransport(settings["mcp:transport"]);
          }
        }
      } catch {
        // Fall back to defaults
      }
    };
    loadSettings();
    window.addEventListener("savant:settings-changed", loadSettings);
    window.addEventListener("focus", loadSettings);
    return () => {
      active = false;
      window.removeEventListener("savant:settings-changed", loadSettings);
      window.removeEventListener("focus", loadSettings);
    };
  }, []);

  const activeAgents = ALL_CODING_AGENTS_META.filter(
    (agent) => enabledAgents === null || enabledAgents.includes(agent.id)
  );

  const getUserApiKey = (user?: User | null): string => {
    if (!user) return apiKey || "";
    const uid = user.id || user.username;
    if (uid && userApiKeysMap[uid]) return userApiKeysMap[uid];
    if (user.api_key) return user.api_key;
    if (user.api_keys && user.api_keys.length > 0) return user.api_keys[0];
    const isSelf = !!activeUserId && uid && uid.toLowerCase() === activeUserId.toLowerCase();
    if (isSelf && apiKey) return apiKey;
    return apiKey || "";
  };

  const handleCopyAgentMcp = (agent: CodingAgentMeta, user: User, buttonKey?: string) => {
    const key = getUserApiKey(user);
    const config = buildUserMcpConfig(agent.id, key, serverUrl, mcpEndpoints, mcpTransport, user.role);
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(config);
    }
    const targetKey = buttonKey || agent.id;
    setCopiedAgentId(targetKey);
    setTimeout(() => {
      setCopiedAgentId((current) => (current === targetKey ? null : current));
    }, 2000);
    toast.success(`Copied ${agent.shortLabel} MCP settings to clipboard!`);
  };


  const fetchUserDomains = async (uid: string) => {
    try {
      setUserDomains(await usersService.listUserDomains(uid));
    } catch (error) {
      console.error(error);
      setUserDomains([]);
    }
  };

  const fetchAvailableDomains = async () => {
    try {
      setAvailableDomains(await usersService.listAvailableDomains());
    } catch (error) {
      console.error(error);
      setAvailableDomains([]);
    }
  };

  const [isRefreshingUsage, setIsRefreshingUsage] = useState(false);

  const fetchUserUsage = async (uid: string) => {
    setUsageError("");
    setIsRefreshingUsage(true);
    try {
      setUserUsage(await usersService.getUserUsage(uid, USAGE_WINDOW_DAYS));
    } catch (error: any) {
      console.error(error);
      setUserUsage(null);
      setUsageError(error?.message || "Failed to load usage.");
    } finally {
      setIsRefreshingUsage(false);
    }
  };

  const fetchUserContributions = async (uid: string) => {
    setContributionsError("");
    setIsRefreshingContributions(true);
    try {
      setUserContributions(await usersService.getUserContributions(uid));
    } catch (error: any) {
      console.error(error);
      setUserContributions(null);
      setContributionsError(error?.message || "Failed to load contributions.");
    } finally {
      setIsRefreshingContributions(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      void fetchUserDomains(selectedUserId);
      void fetchAvailableDomains();
    }
    setDomainBulkNote("");
    setDetailTab("profile");
  }, [selectedUserId, serverUrl, apiKey]);

  useEffect(() => {
    setUserUsage(null);
    setUsageError("");
    setUserContributions(null);
    setContributionsError("");
    if (selectedUserId && isAdmin) void fetchUserUsage(selectedUserId);
  }, [selectedUserId, serverUrl, apiKey, isAdmin]);

  useEffect(() => {
    if (selectedUserId && isAdmin && detailTab === "usage") {
      void fetchUserUsage(selectedUserId);
    }
  }, [detailTab]);

  useEffect(() => {
    if (selectedUserId && isAdmin && detailTab === "contributions") {
      void fetchUserContributions(selectedUserId);
    }
  }, [detailTab, selectedUserId, serverUrl, apiKey, isAdmin]);

  const missingDomains = availableDomains.filter((ad) => !userDomains.some((ud) => ud.domain_node_id === ad.node_id));

  const handleAssignAllMissingReadOnly = async (uid: string) => {
    if (missingDomains.length === 0) return;
    setIsAddingAllDomains(true);
    setDomainBulkNote("");
    try {
      const results = await Promise.allSettled(
        missingDomains.map((d) => usersService.assignDomain(uid, d.node_id, false))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const added = results.length - failed;
      setDomainBulkNote(
        failed
          ? `Added ${added} of ${results.length} domains as read-only; ${failed} failed.`
          : `Added ${added} domains as read-only.`
      );
      await fetchUserDomains(uid);
    } finally {
      setIsAddingAllDomains(false);
    }
  };

  const handleAssignDomain = async (uid: string, targetDomainId?: string, canWrite = true) => {
    const domainId = targetDomainId || selectedDomainToAdd;
    if (!domainId) return;
    const targetUser = users.find((u) => (u.id || u.username) === uid);
    const effectiveCanWrite = targetUser?.role === "guest" ? false : canWrite;
    try {
      await usersService.assignDomain(uid, domainId, effectiveCanWrite);
      if (!targetDomainId) setSelectedDomainToAdd("");
      await fetchUserDomains(uid);
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemoveDomain = async (uid: string, domainNodeId: string) => {
    try {
      await usersService.removeDomain(uid, domainNodeId);
      await fetchUserDomains(uid);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const data = await usersService.listUsers(true);
      const mapped = (data || []).map((u: any) => ({
        ...u,
        id: u.id || u.user_id,
        username: u.username || u.user_id,
        active: u.active !== undefined ? u.active : (u.is_active === 1 || u.is_active === true)
      }));
      setUsers(mapped);
    } catch (e: any) {
      console.error(e);
      setUsers([]);
      setLoadError(e?.message || "Unable to reach Savant server for user records.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [serverUrl, apiKey]);

  // Auto-select first user if selection invalid/empty and not on create form
  useEffect(() => {
    if (users.length > 0) {
      const exists = users.some((u) => (u.id || u.username) === selectedUserId);
      if (!exists && !showCreateForm) {
        const firstUser = users[0];
        const uid = firstUser.id || firstUser.username;
        setSelectedUserId(uid);
        setEditName(firstUser.name);
        setEditEmail(firstUser.email || "");
        setEditRole(firstUser.role);
        setEditActive(firstUser.active);
      }
    }
  }, [users, selectedUserId, showCreateForm]);

  const handleSaveEdit = async (e: React.FormEvent, userId: string) => {
    e.preventDefault();
    const isSelf = !!activeUserId && userId.toLowerCase() === activeUserId.toLowerCase();
    const currentUser = users.find((u) => (u.id || u.username) === userId);
    try {
      await usersService.updateUser(userId, {
        name: editName,
        email: editEmail,
        role: isSelf && currentUser ? currentUser.role : editRole,
        is_active: editActive,
      });
      await fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await usersService.createUser({
        user_id: createUsername,
        username: createUsername,
        name: createName,
        email: createEmail,
        role: createRole,
        is_active: createActive,
      });
      const key = data.api_key || (data.api_keys && data.api_keys[0]);
      if (key) {
        setGeneratedKeyDetails({ username: data.username || data.user_id || data.id || "", apiKey: key, role: data.role || createRole });
      }
      setCreateUsername("");
      setCreateName("");
      setCreateEmail("");
      setCreateRole("operator");
      setCreateActive(true);
      setShowCreateForm(false);
      const newUid = data.id || data.username || data.user_id;
      if (newUid) {
        if (key) {
          setUserApiKeysMap((prev) => ({ ...prev, [newUid]: key }));
        }
        setSelectedUserId(newUid);
        setEditName(data.name);
        setEditEmail(data.email || "");
        setEditRole(data.role);
        setEditActive(data.active !== undefined ? data.active : true);
      }
      await fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const openCopyDialog = (user: User) => {
    setCopySource(user);
    setCopyUsername("");
    setCopyName(user.name || "");
    setCopyEmail(user.email || "");
    setCopyError("");
  };

  const handleCopyUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copySource) return;
    const newUsername = copyUsername.trim();
    if (!newUsername) return;
    if (users.some((u) => u.username.toLowerCase() === newUsername.toLowerCase())) {
      setCopyError(`Username "${newUsername}" already exists.`);
      return;
    }
    setIsCopying(true);
    setCopyError("");
    try {
      const sourceId = copySource.id || copySource.username;
      const sourceDomains = copySource.role === "admin" ? [] : await usersService.listUserDomains(sourceId);
      const newName = copyName.trim() || copySource.name;
      const newEmail = copyEmail.trim() || copySource.email;
      const data = await usersService.createUser({
        user_id: newUsername,
        username: newUsername,
        name: newName,
        email: newEmail,
        role: copySource.role,
        is_active: copySource.active,
      });
      const newUid = data.id || data.user_id || newUsername;
      const results = await Promise.allSettled(
        sourceDomains.map((d: any) => usersService.assignDomain(newUid, d.domain_node_id, !!d.can_write))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const key = data.api_key || (data.api_keys && data.api_keys[0]);
      if (key) {
        setGeneratedKeyDetails({
          username: newUsername,
          apiKey: key,
          role: copySource.role,
          note: failed ? `${failed} of ${sourceDomains.length} domain assignments failed to copy — review Domain Access.` : undefined,
        });
        if (newUid) {
          setUserApiKeysMap((prev) => ({ ...prev, [newUid]: key }));
        }
      }
      setCopySource(null);
      setShowCreateForm(false);
      setSelectedUserId(newUid);
      setEditName(newName);
      setEditEmail(newEmail || "");
      setEditRole(copySource.role);
      setEditActive(copySource.active);
      await fetchUsers();
    } catch (err: any) {
      console.error(err);
      setCopyError(err?.message || "Failed to copy user.");
    } finally {
      setIsCopying(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await usersService.deleteUser(userId);
      await fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegenerateKey = async (userId: string) => {
    try {
      const data = await usersService.rotateApiKey(userId);
      if (data.api_key) {
        setUserApiKeysMap((prev) => ({ ...prev, [userId]: data.api_key }));
      }
        
        // If the rotated user key is the active user's key, update local settings and auth token
        const isSelf = activeUserId && (
          userId.toLowerCase() === activeUserId.toLowerCase() ||
          (selectedUser && (selectedUser.id || selectedUser.username || "").toLowerCase() === activeUserId.toLowerCase())
        );
        
        if (isSelf && data.api_key) {
          await window.system.saveSetting("user:apiKey", data.api_key);
          setStoredApiKey(data.api_key);
        }

        const targetUser = users.find((u) => (u.id || u.username) === userId) || selectedUser;
        setGeneratedKeyDetails({
          username: userId,
          apiKey: data.api_key,
          role: targetUser?.role || "operator",
        });
        
        if (isSelf && onSettingsChanged) {
          onSettingsChanged();
        }
      await fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  // Filtering logic
  const filteredUsers = users.filter((u) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = u.name?.toLowerCase().includes(term);
      const matchUsername = u.username?.toLowerCase().includes(term);
      const matchEmail = u.email?.toLowerCase().includes(term);
      if (!matchName && !matchUsername && !matchEmail) return false;
    }
    if (roleFilter !== "all" && u.role?.toLowerCase() !== roleFilter.toLowerCase()) {
      return false;
    }
    if (statusFilter !== "all") {
      const wantActive = statusFilter === "active";
      if (u.active !== wantActive) return false;
    }
    return true;
  });

  const selectedUser = users.find((u) => (u.id || u.username) === selectedUserId);

  const renderUserNode = (user: User) => {
    const userId = user.id || user.username;
    const isSelected = selectedUserId === userId && !showCreateForm;
    return (
      <button
        key={userId}
        onClick={() => {
          setSelectedUserId(userId);
          setShowCreateForm(false);
          setEditName(user.name);
          setEditEmail(user.email || "");
          setEditRole(user.role);
          setEditActive(user.active);
        }}
        title="Edit user information"
        className={`w-full text-left p-2 border font-mono transition-all duration-200 cursor-pointer flex items-center justify-between text-xs rounded-none ${
          isSelected
            ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.1)] text-[var(--cp-cyan)] shadow-[0_0_6px_rgba(0,229,255,0.2)]"
            : "border-[var(--cp-border)] bg-[var(--cp-bg-2)] text-muted-foreground hover:border-[rgba(0,229,255,0.3)] hover:text-foreground"
        }`}
      >
        <div className="truncate pr-2 flex items-center gap-1.5 min-w-0">
          <Users size={12} className={isSelected ? "text-[var(--cp-cyan)] shrink-0" : "text-muted-foreground shrink-0"} />
          {isRecentlyActive(user.last_login_at) && (
            <span
              title={`Active in the last 24h (last login: ${formatTimestamp(user.last_login_at)})`}
              className="w-1.5 h-1.5 rounded-full bg-[var(--cp-green)] shrink-0 shadow-[0_0_4px_var(--cp-green)]"
            />
          )}
          <span className="font-semibold truncate">{user.name}</span>
          <span className="text-[10px] opacity-60 shrink-0">({user.username})</span>
        </div>
        <span className={`text-[9px] px-1 border uppercase font-mono shrink-0 ${
          user.active ? "border-[var(--cp-green)]/30 text-[var(--cp-green)]" : "border-red-500/30 text-red-400"
        }`}>
          {user.role.toUpperCase()}
        </span>
      </button>
    );
  };

  const renderCreateForm = () => {
    return (
      <form onSubmit={handleCreateUser} className="space-y-4 font-mono text-xs max-w-xl">
        <div className="text-sm font-bold text-[var(--cp-cyan)] tracking-wider border-b border-[var(--cp-border)] pb-2 uppercase">Create New User Profile</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col space-y-1">
            <label htmlFor="create-username" className="text-[10px] text-muted-foreground uppercase font-mono">Username</label>
            <input
              id="create-username"
              type="text"
              required
              value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)}
              className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
              placeholder="e.g. john_doe"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label htmlFor="create-name" className="text-[10px] text-muted-foreground uppercase font-mono">Full Name</label>
            <input
              id="create-name"
              type="text"
              required
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
              placeholder="e.g. John Doe"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label htmlFor="create-email" className="text-[10px] text-muted-foreground uppercase font-mono">Email</label>
            <input
              id="create-email"
              type="email"
              required
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
              placeholder="e.g. john@savant.ai"
            />
          </div>
          <div className="flex flex-col space-y-1">
            <label htmlFor="create-role" className="text-[10px] text-muted-foreground uppercase font-mono">Role</label>
            <select
              id="create-role"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value)}
              className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer"
            >
              <option value="admin">ADMIN</option>
              <option value="operator">OPERATOR</option>
              <option value="guest">GUEST</option>
            </select>
          </div>
          <div className="flex flex-col space-y-1">
            <label htmlFor="create-active" className="text-[10px] text-muted-foreground uppercase font-mono">Status</label>
            <select
              id="create-active"
              value={createActive ? "true" : "false"}
              onChange={(e) => setCreateActive(e.target.value === "true")}
              className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer"
            >
              <option value="true">ACTIVE</option>
              <option value="false">INACTIVE</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(false);
              if (users.length > 0) {
                const uid = users[0].id || users[0].username;
                setSelectedUserId(uid);
                setEditName(users[0].name);
                setEditEmail(users[0].email || "");
                setEditRole(users[0].role);
                setEditActive(users[0].active);
              }
            }}
            className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-mono flex items-center gap-1 cursor-pointer"
          >
            <X size={12} /> CANCEL
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] text-xs font-mono flex items-center gap-1 cursor-pointer"
          >
            <Save size={12} /> CREATE_USER
          </button>
        </div>
      </form>
    );
  };

  const renderAgentMcpSettings = (user: User) => {
    return (
      <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-4 space-y-3" data-testid="user-mcp-settings">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold text-[var(--cp-cyan)] tracking-wider uppercase flex items-center gap-2">
            <Bot size={14} /> Agent MCP Settings
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            {activeAgents.length} SYSTEM ENABLED
          </span>
        </div>

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Copy Model Context Protocol (MCP) configuration for this user to clipboard for system-enabled coding agents.
        </p>

        {activeAgents.length === 0 ? (
          <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5">
            No external coding agents are currently enabled in Settings &gt; Agents.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 pt-1" data-testid="agent-mcp-buttons">
              {activeAgents.map((agent) => {
                const Icon = AGENT_ICONS[agent.id] || Bot;
                const isCopied = copiedAgentId === agent.id;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    data-testid={`copy-mcp-${agent.id}`}
                    onClick={() => handleCopyAgentMcp(agent, user)}
                    className={`px-3 py-1.5 border text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all ${
                      isCopied
                        ? "border-[var(--cp-green)] text-[var(--cp-green)] bg-[rgba(0,255,136,0.1)]"
                        : "border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)] hover:border-[var(--cp-cyan)]"
                    }`}
                    title={`Copy MCP configuration for ${agent.label} (${agent.configPath})`}
                  >
                    {isCopied ? <Check size={12} className="text-[var(--cp-green)]" /> : <Icon size={12} />}
                    <span>{isCopied ? "COPIED TO CLIPBOARD" : `COPY ${agent.shortLabel.toUpperCase()} MCP`}</span>
                  </button>
                );
              })}
            </div>

            {/* Collapsible Format Preview */}
            <div className="border-t border-[var(--cp-border)]/60 pt-2 text-xs">
              <button
                type="button"
                onClick={() => setShowMcpPreview((prev) => !prev)}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-[var(--cp-cyan)] transition-colors cursor-pointer"
              >
                {showMcpPreview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{showMcpPreview ? "HIDE MCP CONFIG PREVIEW" : "VIEW MCP CONFIG PREVIEW"}</span>
              </button>

              {showMcpPreview && (
                <div className="mt-2 p-2.5 rounded bg-[var(--cp-bg-3)] border border-[var(--cp-border)] overflow-x-auto text-[10px] font-mono">
                  <div className="text-[9px] text-[var(--cp-cyan)] mb-2 uppercase font-bold flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span>Preview ({user.username} - {user.role}):</span>
                      <div className="flex gap-1">
                        {activeAgents.map((ag) => (
                          <button
                            key={ag.id}
                            type="button"
                            onClick={() => setPreviewAgentId(ag.id)}
                            className={`px-1.5 py-0.5 text-[9px] uppercase border cursor-pointer ${
                              (previewAgentId || activeAgents[0]?.id) === ag.id
                                ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[var(--cp-cyan)]/10"
                                : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {ag.shortLabel} ({ag.format.toUpperCase()})
                          </button>
                        ))}
                      </div>
                    </div>
                    <span className="text-muted-foreground text-[8px] font-normal">{mcpTransport}</span>
                  </div>
                  <pre className="text-slate-300">
                    {buildUserMcpConfig(
                      previewAgentId || activeAgents[0]?.id || "claude",
                      getUserApiKey(user),
                      serverUrl,
                      mcpEndpoints,
                      mcpTransport,
                      user.role
                    )}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderEditPage = (user: User) => {
    const userId = user.id || user.username;
    const isSelf = !!activeUserId && userId.toLowerCase() === activeUserId.toLowerCase();
    if (!isAdmin) {
      return (
        <div className="space-y-4 max-w-xl font-mono text-xs">
          <div className="space-y-3 p-4 border border-[var(--cp-border)] bg-[var(--cp-bg-2)]">
            <h3 className="text-sm font-bold text-[var(--cp-cyan)]">USER_{user.username}</h3>
            <p className="text-muted-foreground">Read-only user record. Administrator access is required to modify users.</p>
            <div>Name: {user.name}</div>
            <div>Email: {user.email || "—"}</div>
            <div>Role: {user.role}</div>
            <div>Status: {user.active ? "active" : "inactive"}</div>
          </div>
          {renderAgentMcpSettings(user)}
        </div>
      );
    }
    return (
      <div className="space-y-6 max-w-xl font-mono text-xs">
        {/* Profile Details Header Block for Test Inspections */}
        <div className="text-sm font-bold text-[var(--cp-cyan)] tracking-wider border-b border-[var(--cp-border)] pb-2 flex flex-col gap-1.5 uppercase">
          <div className="flex justify-between items-center">
            <span>User Profile: {user.username}</span>
            <span className={`text-[10px] px-2 py-0.5 border ${
              user.active ? "border-[var(--cp-green)] text-[var(--cp-green)] bg-[rgba(0,255,136,0.05)]" : "border-red-500/30 text-red-400 bg-red-500/5"
            }`}>
              {user.active ? "ACTIVE" : "INACTIVE"}
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-normal text-muted-foreground mt-1">
            <span>Name: <span className="text-foreground">USER_{user.name}</span></span>
            {user.email && <span>Email: <span className="text-foreground">{user.email}</span></span>}
            <span>Role: <span className="text-foreground">{user.role.toUpperCase()}</span></span>
            <span>Status: <span className={user.active ? "text-[var(--cp-green)]" : "text-[var(--cp-magenta)]"}>{user.active ? "ACTIVE" : "INACTIVE"}</span></span>
            <span data-testid="user-last-login">Last login: <span className="text-foreground">{formatTimestamp(userUsage?.last_login_at ?? user.last_login_at)}</span></span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3" data-testid="user-quick-stats">
          <div className="flex items-center gap-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-2.5 py-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isRecentlyActive(userUsage?.last_login_at ?? user.last_login_at) ? "bg-[var(--cp-green)] shadow-[0_0_4px_var(--cp-green)]" : "bg-muted-foreground/40"
            }`} />
            <span className="text-[10px] uppercase text-muted-foreground">
              {isRecentlyActive(userUsage?.last_login_at ?? user.last_login_at) ? "Active last 24h" : "Inactive 24h"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-2.5 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Tool calls ({USAGE_WINDOW_DAYS}d):</span>
            <span className="text-[10px] text-foreground">{userUsage ? userUsage.total_calls : "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-2.5 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Logins ({USAGE_WINDOW_DAYS}d):</span>
            <span className="text-[10px] text-foreground">{userUsage ? userUsage.logins_per_day.reduce((n, d) => n + d.logins, 0) : "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-2.5 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Projects:</span>
            <span className="text-[10px] text-foreground">{userUsage ? userUsage.projects.length : "—"}</span>
          </div>
        </div>

        <div className="flex gap-1 border-b border-[var(--cp-border)]" role="tablist">
          {(["profile", "access", "usage", "contributions"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={detailTab === tab}
              onClick={() => setDetailTab(tab)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider border-b-2 -mb-px cursor-pointer transition-all ${
                detailTab === tab
                  ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "profile" ? "Profile" : tab === "access" ? "Access" : tab === "usage" ? "Usage" : "Contributions"}
            </button>
          ))}
        </div>

        {detailTab === "profile" && (<>
        <form onSubmit={(e) => handleSaveEdit(e, userId)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col space-y-1">
              <label htmlFor="edit-username" className="text-[10px] text-muted-foreground uppercase font-mono">Username</label>
              <input
                id="edit-username"
                type="text"
                disabled
                value={user.username}
                className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)]/50 text-muted-foreground/70 text-xs px-3 py-2 focus:outline-none font-mono cursor-not-allowed"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label htmlFor="edit-name" className="text-[10px] text-muted-foreground uppercase font-mono">Full Name</label>
              <input
                id="edit-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label htmlFor="edit-email" className="text-[10px] text-muted-foreground uppercase font-mono">Email</label>
              <input
                id="edit-email"
                type="email"
                required
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label htmlFor="edit-role" className="text-[10px] text-muted-foreground uppercase font-mono">Role</label>
              <select
                id="edit-role"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                disabled={isSelf}
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="admin">ADMIN</option>
                <option value="operator">OPERATOR</option>
                <option value="guest">GUEST</option>
              </select>
            </div>
            <div className="flex flex-col space-y-1">
              <label htmlFor="edit-active" className="text-[10px] text-muted-foreground uppercase font-mono">Status</label>
              <select
                id="edit-active"
                value={editActive ? "true" : "false"}
                onChange={(e) => setEditActive(e.target.value === "true")}
                disabled={isSelf}
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="true">ACTIVE</option>
                <option value="false">INACTIVE</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all duration-200"
            >
              <Save size={12} /> SAVE
            </button>
          </div>
        </form>

        {/* Security / Credentials Section */}
        <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-4 space-y-4">
          <div className="text-[11px] font-bold text-[var(--cp-cyan)] tracking-wider uppercase flex items-center gap-2">
            <Key size={14} /> Credentials & Key Management
          </div>

          <div className="flex flex-col space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Authorization Token</label>
            <div className="flex items-center gap-2 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] px-3 py-2 max-w-md">
              <Key size={12} className="text-muted-foreground shrink-0" />
              <span className="text-xs font-mono tracking-wide text-foreground truncate flex-1 select-none">
                ••••••••••••••••••••••••
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => handleRegenerateKey(userId)}
              className="px-3 py-1.5 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)] text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
              title="Regenerate API Key"
            >
              <RefreshCw size={12} /> REGEN_KEY
            </button>
            <button
              onClick={() => openCopyDialog(user)}
              className="px-3 py-1.5 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)] text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
              title="Create a new user with the same profile and domain access"
            >
              <Copy size={12} /> COPY_USER
            </button>
            {user.active && !isSelf && (
              <button
                onClick={() => handleDeleteUser(userId)}
                className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
                title="Deactivate user"
              >
                <X size={12} /> DEACTIVATE
              </button>
            )}
            {user.active && isSelf && (
              <button
                disabled
                className="px-3 py-1.5 border border-red-500/30 text-red-400 text-xs font-mono flex items-center gap-1.5 opacity-40 cursor-not-allowed"
              >
                <X size={12} /> DEACTIVATE
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground opacity-60 leading-relaxed max-w-md">
            Regenerating the API key invalidates the current key instantly. Connected clients, services, or agents using the old key will be denied access.
          </p>
        </div>

        {/* Agent MCP Settings Section */}
        {renderAgentMcpSettings(user)}

        </>)}

        {detailTab === "access" && (
        <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-4 space-y-4">
          <div className="text-[11px] font-bold text-[var(--cp-cyan)] tracking-wider uppercase flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield size={14} /> Domain Access & Write Permissions
            </span>
            <span className="text-[10px] text-muted-foreground font-mono font-normal">
              {user.role === "admin" ? "ADMIN: Full Read & Write to All Domains" : `${userDomains.length} Assigned Domains`}
            </span>
          </div>

          {user.role === "admin" ? (
            <div className="p-3 border border-[var(--cp-green)]/30 bg-[rgba(0,255,136,0.05)] text-xs text-[var(--cp-green)] font-mono">
              ★ ADMIN ROLE ACTIVE: Admin users have unrestricted Read and Write access across all domains and knowledge nodes.
            </div>
          ) : user.role === "guest" ? (
            <div className="space-y-3">
              <div className="p-3 border border-amber-500/40 bg-[rgba(255,170,0,0.06)] text-xs text-amber-300 font-mono">
                ⚠ GUEST USER RESTRICTIONS: Guest users have strictly Read-Only search access to their assigned domains. Write access cannot be granted to guest accounts.
              </div>
              {/* Assigned Domains List */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Assigned Domain Permissions</label>
                {userDomains.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic bg-[var(--cp-bg-3)] border border-[var(--cp-border)]/50 p-2.5">
                    No domains assigned. Guest user has no access to any knowledge nodes or MCP tools.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {userDomains.map((ud) => (
                      <div key={ud.domain_node_id} className="flex items-center gap-2 bg-[var(--cp-bg-3)] border border-amber-500/40 px-2.5 py-1.5 rounded text-xs font-mono">
                        <span className="text-foreground font-medium">{ud.domain_title || ud.domain_node_id}</span>
                        <span
                          className="text-[9px] px-2 py-0.5 border rounded font-semibold bg-[rgba(255,170,0,0.15)] text-amber-400 border-amber-500/40 cursor-not-allowed opacity-90"
                          title="Guest users are strictly read-only"
                        >
                          👁 READ ONLY
                        </span>
                        <button
                          onClick={() => handleRemoveDomain(userId, ud.domain_node_id)}
                          className="text-red-400 hover:text-red-300 ml-1 cursor-pointer"
                          title="Remove domain assignment"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assign New Domain Dropdown */}
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={selectedDomainToAdd}
                  onChange={(e) => setSelectedDomainToAdd(e.target.value)}
                  className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer flex-1"
                >
                  <option value="">-- Select Domain to Assign (Read-Only) --</option>
                  {availableDomains
                    .filter((ad) => !userDomains.some((ud) => ud.domain_node_id === ad.node_id))
                    .map((ad) => (
                      <option key={ad.node_id} value={ad.node_id}>
                        {ad.title} ({ad.node_id})
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => handleAssignDomain(userId, undefined, false)}
                  disabled={!selectedDomainToAdd}
                  className="px-3 py-1.5 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono flex items-center gap-1 cursor-pointer transition-all"
                  title="Assign read-only access to the selected domain"
                >
                  <Plus size={12} />
                </button>
                <button
                  onClick={() => handleAssignAllMissingReadOnly(userId)}
                  disabled={missingDomains.length === 0 || isAddingAllDomains}
                  className="px-3 py-1.5 border border-amber-500/50 text-amber-400 hover:bg-[rgba(255,170,0,0.1)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                  title={`Assign every domain this guest user is missing (${missingDomains.length}), with read-only access`}
                >
                  <Plus size={12} /><Plus size={12} /> {isAddingAllDomains ? "..." : "RO"}
                </button>
              </div>
              {domainBulkNote && (
                <p className="text-[10px] text-muted-foreground font-mono">{domainBulkNote}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Assigned Domains List */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Assigned Domain Permissions</label>
                {userDomains.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic bg-[var(--cp-bg-3)] border border-[var(--cp-border)]/50 p-2.5">
                    No domain nodes assigned. User has Read-Only access for general/unassigned knowledge graph nodes.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {userDomains.map((ud) => (
                      <div key={ud.domain_node_id} className="flex items-center gap-2 bg-[var(--cp-bg-3)] border border-[var(--cp-cyan)]/40 px-2.5 py-1.5 rounded text-xs font-mono">
                        <span className="text-foreground font-medium">{ud.domain_title || ud.domain_node_id}</span>
                        <button
                          onClick={() => handleAssignDomain(userId, ud.domain_node_id, !ud.can_write)}
                          className={`text-[9px] px-2 py-0.5 border rounded font-semibold cursor-pointer transition-all ${
                            ud.can_write
                              ? "bg-[rgba(0,255,136,0.15)] text-[var(--cp-green)] border-[var(--cp-green)]/40 hover:bg-[rgba(0,255,136,0.25)]"
                              : "bg-[rgba(255,170,0,0.15)] text-amber-400 border-amber-500/40 hover:bg-[rgba(255,170,0,0.25)]"
                          }`}
                          title="Click to toggle between Write and Read-Only permission"
                        >
                          {ud.can_write ? "✓ WRITE" : "👁 READ ONLY"}
                        </button>
                        <button
                          onClick={() => handleRemoveDomain(userId, ud.domain_node_id)}
                          className="text-red-400 hover:text-red-300 ml-1 cursor-pointer"
                          title="Remove domain assignment"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assign New Domain Dropdown */}
              <div className="flex items-center gap-2 pt-1">
                <select
                  value={selectedDomainToAdd}
                  onChange={(e) => setSelectedDomainToAdd(e.target.value)}
                  className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer flex-1"
                >
                  <option value="">-- Select Domain Node to Assign Write Access --</option>
                  {availableDomains
                    .filter((ad) => !userDomains.some((ud) => ud.domain_node_id === ad.node_id))
                    .map((ad) => (
                      <option key={ad.node_id} value={ad.node_id}>
                        {ad.title} ({ad.node_id})
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => handleAssignDomain(userId)}
                  disabled={!selectedDomainToAdd}
                  className="px-3 py-1.5 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono flex items-center gap-1 cursor-pointer transition-all"
                  title="Assign write access to the selected domain"
                >
                  <Plus size={12} />
                </button>
                <button
                  onClick={() => handleAssignAllMissingReadOnly(userId)}
                  disabled={missingDomains.length === 0 || isAddingAllDomains}
                  className="px-3 py-1.5 border border-amber-500/50 text-amber-400 hover:bg-[rgba(255,170,0,0.1)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                  title={`Assign every domain this user is missing (${missingDomains.length}), with read-only access`}
                >
                  <Plus size={12} /><Plus size={12} /> {isAddingAllDomains ? "..." : "RW"}
                </button>
              </div>
              {domainBulkNote && (
                <p className="text-[10px] text-muted-foreground font-mono">{domainBulkNote}</p>
              )}
            </div>
          )}
        </div>
        )}

        {detailTab === "usage" && (
        <div className="space-y-4" data-testid="user-mcp-usage">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-muted-foreground border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-3">
            <div className="flex flex-wrap gap-4">
              <span>Last login: <span className="text-foreground">{formatTimestamp(userUsage?.last_login_at ?? user.last_login_at)}</span></span>
              {userUsage && (
                <>
                  <span>Logins ({USAGE_WINDOW_DAYS}d): <span className="text-foreground">{userUsage.logins_per_day.reduce((n, d) => n + d.logins, 0)}</span></span>
                  <span>Tool calls ({USAGE_WINDOW_DAYS}d): <span className="text-foreground">{userUsage.total_calls}</span></span>
                  <span>Projects: <span className="text-foreground">{userUsage.projects.length}</span></span>
                </>
              )}
            </div>
            <button
              onClick={() => selectedUserId && void fetchUserUsage(selectedUserId)}
              disabled={isRefreshingUsage}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh usage statistics"
            >
              <RefreshCw size={12} className={isRefreshingUsage ? "animate-spin" : ""} />
              <span>{isRefreshingUsage ? "REFRESHING..." : "REFRESH"}</span>
            </button>
          </div>

          {usageError ? (
            <p className="text-xs text-red-400 font-mono">{usageError}</p>
          ) : !userUsage ? (
            <p className="text-xs text-muted-foreground font-mono">Loading usage…</p>
          ) : (<>
          <UsageCard title="Logins per day" testId="usage-logins">
            {userUsage.logins_per_day.length === 0 ? (
              <EmptyNote>No logins recorded in this window.</EmptyNote>
            ) : (
              <div className="space-y-1">
                {userUsage.logins_per_day.map((d) => {
                  const max = Math.max(...userUsage.logins_per_day.map((x) => x.logins));
                  return (
                    <div key={d.day} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-24 text-muted-foreground shrink-0">{d.day}</span>
                      <div className="flex-1 h-2 bg-[var(--cp-bg-3)]">
                        <div className="h-2 bg-[var(--cp-cyan)]/70" style={{ width: `${(d.logins / max) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right text-foreground">{d.logins}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </UsageCard>

          <UsageCard title="Projects" testId="usage-projects">
            {userUsage.projects.length === 0 ? (
              <EmptyNote>No repo or workspace activity recorded in this window.</EmptyNote>
            ) : (
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase text-left">
                    <th className="py-1 pr-2">Type</th>
                    <th className="py-1 pr-2">Project</th>
                    <th className="py-1 pr-2 text-right">Calls</th>
                    <th className="py-1 pr-2 text-right">Active days</th>
                    <th className="py-1 text-right">Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {userUsage.projects.map((p) => (
                    <tr key={`${p.project_type}:${p.project}`} className="border-t border-[var(--cp-border)]/40">
                      <td className="py-1 pr-2 text-muted-foreground uppercase">{p.project_type}</td>
                      <td className="py-1 pr-2 text-foreground" title={p.project}>{p.project_name}</td>
                      <td className="py-1 pr-2 text-right text-foreground">{p.calls}</td>
                      <td className="py-1 pr-2 text-right text-muted-foreground">{p.active_days}</td>
                      <td className="py-1 text-right text-muted-foreground">{formatTimestamp(p.last_used_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </UsageCard>

          <UsageCard title="MCP tools" testId="usage-tools">
          {userUsage.tools.length === 0 ? (
            <EmptyNote>No MCP tool calls recorded in this window.</EmptyNote>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase text-left">
                  <th className="py-1 pr-2">MCP</th>
                  <th className="py-1 pr-2">Tool</th>
                  <th className="py-1 pr-2 text-right">Calls</th>
                  <th className="py-1 pr-2 text-right">Calls / day</th>
                  <th className="py-1 text-right">Last used</th>
                </tr>
              </thead>
              <tbody>
                {userUsage.tools.map((t) => (
                  <tr key={`${t.mcp_server}:${t.tool_name}`} className="border-t border-[var(--cp-border)]/40">
                    <td className="py-1 pr-2 text-muted-foreground">{t.mcp_server}</td>
                    <td className="py-1 pr-2 text-foreground">{t.tool_name}</td>
                    <td className="py-1 pr-2 text-right text-foreground">{t.calls}</td>
                    <td className="py-1 pr-2 text-right text-[var(--cp-cyan)]" title={`${t.active_days} active day(s)`}>
                      {t.avg_calls_per_active_day}
                    </td>
                    <td className="py-1 text-right text-muted-foreground">{formatTimestamp(t.last_called_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </UsageCard>

          <UsageCard title={`Recent queries (latest ${userUsage.recent_queries.length})`} testId="usage-queries">
            {userUsage.recent_queries.length === 0 ? (
              <EmptyNote>No search queries recorded in this window.</EmptyNote>
            ) : (
              <ul className="space-y-1.5 max-h-80 overflow-y-auto">
                {userUsage.recent_queries.map((q, i) => (
                  <li key={`${q.created_at}:${i}`} className="text-xs font-mono border-t border-[var(--cp-border)]/40 pt-1.5">
                    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      <span>{formatTimestamp(q.created_at)}</span>
                      <span className="text-[var(--cp-cyan)]">{q.tool_name}</span>
                      <span>{q.mcp_server}</span>
                      {q.repo && <span>repo: {q.repo}</span>}
                    </div>
                    <div className="text-foreground break-words">{q.query}</div>
                  </li>
                ))}
              </ul>
            )}
          </UsageCard>
          </>)}
        </div>
        )}

        {detailTab === "contributions" && (
        <div className="space-y-4" data-testid="user-contributions">
          <UsageCard title="Knowledge graph contributions" testId="contributions-summary">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                <span>Nodes created: <span className="text-foreground">{userContributions?.node_count ?? "—"}</span></span>
                <span>Committed: <span className="text-foreground">{userContributions?.committed_count ?? "—"}</span></span>
                <span>Staged: <span className="text-foreground">{userContributions?.staged_count ?? "—"}</span></span>
                <span>Latest: <span className="text-foreground">{userContributions ? formatTimestamp(userContributions.latest_created_at) : "—"}</span></span>
              </div>
              <button
                type="button"
                onClick={() => selectedUserId && void fetchUserContributions(selectedUserId)}
                disabled={isRefreshingContributions}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh knowledge graph contributions"
              >
                <RefreshCw size={12} className={isRefreshingContributions ? "animate-spin" : ""} />
                <span>{isRefreshingContributions ? "REFRESHING..." : "REFRESH"}</span>
              </button>
            </div>
            {contributionsError ? (
              <p className="text-xs text-red-400 font-mono">{contributionsError}</p>
            ) : !userContributions ? (
              <p className="text-xs text-muted-foreground font-mono">Loading creator-attributed nodes…</p>
            ) : userContributions.by_type.length === 0 ? (
              <EmptyNote>No knowledge graph nodes have been attributed to this user yet.</EmptyNote>
            ) : (
              <div className="flex flex-wrap gap-2">
                {userContributions.by_type.map(({ node_type, node_count }) => (
                  <span key={node_type} className="border border-[var(--cp-border)] bg-[var(--cp-bg-3)] px-2 py-1 text-[11px] font-mono text-muted-foreground">
                    {node_type}: <span className="text-foreground">{node_count}</span>
                  </span>
                ))}
              </div>
            )}
          </UsageCard>
        </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3 shrink-0">
        <div>
          <h2 className="text-lg font-medium text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            USERS & CREDENTIALS
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">Provisioned identities and authorization keys</p>
        </div>
        {isAdmin && <button
          onClick={() => {
            setShowCreateForm(true);
            setSelectedUserId(null);
          }}
          className={`px-3 py-1.5 border text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
            showCreateForm
              ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.1)] text-[var(--cp-cyan)] shadow-[0_0_6px_rgba(0,229,255,0.2)]"
              : "border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)]"
          }`}
        >
          <Plus size={14} /> ADD_USER
        </button>}
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
        {/* Left Column: User Index Tree with Search & Filters on Top */}
        <div className={`${isUserPaneOpen ? "w-full md:w-80" : "w-11"} flex flex-col space-y-4 shrink-0 overflow-hidden transition-all duration-200`}>
          <div className="flex items-center justify-between border border-[var(--cp-border)] bg-[var(--cp-bg-1)] px-2 py-1.5 shrink-0">
            {isUserPaneOpen && <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">User tree</h3>}
            <button
              type="button"
              onClick={() => setIsUserPaneOpen((open) => !open)}
              title={isUserPaneOpen ? "Collapse user tree" : "Expand user tree"}
              aria-label={isUserPaneOpen ? "Collapse user tree" : "Expand user tree"}
              className="h-6 w-6 inline-flex items-center justify-center border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
            >
              {isUserPaneOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>

          {isUserPaneOpen ? (
            <>
              {/* Search and Filter Panel */}
              <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-3 space-y-3 shrink-0">
                <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">Search & Filters</h3>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer"
                  >
                    <option value="all">ALL ROLES</option>
                    <option value="admin">ADMIN</option>
                    <option value="operator">OPERATOR</option>
                    <option value="guest">GUEST</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer"
                  >
                    <option value="all">ALL STATUS</option>
                    <option value="active">ACTIVE</option>
                    <option value="inactive">INACTIVE</option>
                  </select>
                </div>
              </div>

              {/* User Flat list */}
              <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-3 overflow-y-auto space-y-2">
                {isLoading ? (
                  <div className="text-center py-6 text-xs text-[var(--cp-cyan)] animate-pulse font-mono">RESOLVING_USERS...</div>
                ) : loadError ? (
                  <div className="text-center py-6 text-xs text-red-400 font-mono">{loadError}</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground opacity-50 font-mono">NO USERS RECORDED</div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredUsers.map(renderUserNode)}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex items-center justify-center">
              <span className="font-mono text-[10px] text-[var(--cp-cyan)] [writing-mode:vertical-rl] rotate-180 tracking-widest">
                USERS
              </span>
            </div>
          )}
        </div>

        {/* Right Column: User Edit Page or Create Form */}
        <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 overflow-y-auto">
          {showCreateForm ? (
            renderCreateForm()
          ) : selectedUser ? (
            renderEditPage(selectedUser)
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
              <Users size={48} className="text-muted-foreground mb-3" />
              <p className="text-sm font-mono uppercase text-[var(--section-label)] tracking-wider">No user selected</p>
              <p className="text-xs text-muted-foreground mt-1">Select a user from the sidebar index or add a new one.</p>
            </div>
          )}
        </div>
      </div>

      {copySource && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono">
          <form
            onSubmit={handleCopyUser}
            className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 flex flex-col space-y-4 shadow-2xl"
          >
            <div className="text-sm font-bold text-[var(--cp-cyan)] tracking-wider uppercase border-b border-[var(--cp-border)] pb-2 flex items-center gap-2">
              <Copy size={16} /> Copy User: {copySource.username}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Role, status and domain access are copied. Name and email are pre-filled from the source user and can be edited. A new API key is generated.
            </p>
            <div className="flex flex-col space-y-1">
              <label htmlFor="copy-username" className="text-[10px] text-muted-foreground uppercase font-mono">New Username</label>
              <input
                id="copy-username"
                type="text"
                required
                autoFocus
                value={copyUsername}
                onChange={(e) => setCopyUsername(e.target.value)}
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                placeholder="e.g. john_doe_2"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label htmlFor="copy-name" className="text-[10px] text-muted-foreground uppercase font-mono">Full Name</label>
              <input
                id="copy-name"
                type="text"
                value={copyName}
                onChange={(e) => setCopyName(e.target.value)}
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="flex flex-col space-y-1">
              <label htmlFor="copy-email" className="text-[10px] text-muted-foreground uppercase font-mono">Email</label>
              <input
                id="copy-email"
                type="email"
                value={copyEmail}
                onChange={(e) => setCopyEmail(e.target.value)}
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                placeholder="e.g. john.doe@example.com"
              />
            </div>
            {copyError && <div className="text-[10px] text-red-400">{copyError}</div>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setCopySource(null)}
                className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-mono flex items-center gap-1 cursor-pointer"
              >
                <X size={12} /> CANCEL
              </button>
              <button
                type="submit"
                disabled={isCopying || !copyUsername.trim()}
                className="px-3 py-1.5 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono flex items-center gap-1 cursor-pointer"
              >
                <Copy size={12} /> {isCopying ? "COPYING..." : "CREATE_COPY"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Temporary API key generation modal display */}
      {generatedKeyDetails && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono">
          <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 flex flex-col space-y-4 shadow-2xl relative">
            <div className="text-sm font-bold text-[var(--cp-green)] tracking-wider uppercase border-b border-[var(--cp-border)] pb-2 flex items-center gap-2">
              <Key size={16} /> CREDENTIALS GENERATED
            </div>
            
            <p className="text-xs text-foreground leading-relaxed">
              A new API key has been generated for user <strong className="text-[var(--cp-cyan)]">{generatedKeyDetails.username}</strong>.
            </p>
            
            {generatedKeyDetails.note && (
              <div className="border border-amber-500/30 bg-amber-500/5 p-2.5 text-[10px] text-amber-400">
                {generatedKeyDetails.note}
              </div>
            )}

            <div className="bg-red-950/20 border border-red-500/20 p-3 text-[10px] text-red-400 rounded leading-relaxed uppercase">
              [WARNING] Please copy this key now. For security reasons, you will not be able to view it again after closing this window.
            </div>

            <div className="flex items-center gap-2 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] px-3 py-2.5">
              <span className="text-xs font-mono tracking-wide text-[var(--cp-cyan)] select-all truncate flex-1">
                {generatedKeyDetails.apiKey}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedKeyDetails.apiKey);
                }}
                className="px-2.5 py-1 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] text-[10px] font-bold uppercase hover:opacity-90 cursor-pointer flex items-center gap-1"
              >
                <Copy size={10} /> Copy
              </button>
            </div>

            {/* Quick copy MCP settings for newly generated key */}
            {activeAgents.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--cp-border)]/50">
                <div className="text-[10px] text-muted-foreground uppercase font-mono flex items-center gap-1.5">
                  <Bot size={12} className="text-[var(--cp-cyan)]" /> Copy Agent MCP Settings:
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeAgents.map((agent) => {
                    const Icon = AGENT_ICONS[agent.id] || Bot;
                    const isCopied = copiedAgentId === `modal-${agent.id}`;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        data-testid={`modal-copy-mcp-${agent.id}`}
                        onClick={() =>
                          handleCopyAgentMcp(
                            agent,
                            { username: generatedKeyDetails.username, api_key: generatedKeyDetails.apiKey, role: generatedKeyDetails.role || "operator" } as any,
                            `modal-${agent.id}`
                          )
                        }
                        className={`px-2.5 py-1 border text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-all ${
                          isCopied
                            ? "border-[var(--cp-green)] text-[var(--cp-green)] bg-[rgba(0,255,136,0.1)]"
                            : "border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
                        }`}
                      >
                        {isCopied ? <Check size={10} className="text-[var(--cp-green)]" /> : <Icon size={10} />}
                        <span>{isCopied ? "COPIED!" : `${agent.shortLabel.toUpperCase()} MCP`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setGeneratedKeyDetails(null)}
                className="px-4 py-2 border border-[var(--cp-border)] hover:bg-[var(--cp-bg-2)] text-xs uppercase cursor-pointer"
              >
                I have saved the key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
