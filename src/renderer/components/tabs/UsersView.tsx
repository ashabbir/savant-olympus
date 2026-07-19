import React, { useState, useEffect } from "react";
import { Users, Key, Shield, UserCheck, Eye, EyeOff, X, Save, Mail, Plus, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { setStoredApiKey } from "../../services/auth";

interface User {
  id?: string;
  username: string;
  name: string;
  role: string;
  email?: string;
  active: boolean;
  api_key?: string;
  api_keys?: string[];
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

  // Navigation / Selection State
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Temporary generation modal credentials display
  const [generatedKeyDetails, setGeneratedKeyDetails] = useState<{
    username: string;
    apiKey: string;
  } | null>(null);

  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isUserPaneOpen, setIsUserPaneOpen] = useState(true);

  // Create user form state
  const [createUsername, setCreateUsername] = useState("");
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("operator");
  const [createActive, setCreateActive] = useState(true);

  // Editing state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editActive, setEditActive] = useState(true);

  // Domain Assignment State
  const [userDomains, setUserDomains] = useState<{ domain_node_id: string; domain_title?: string; can_write: boolean }[]>([]);
  const [availableDomains, setAvailableDomains] = useState<{ node_id: string; title: string }[]>([]);
  const [selectedDomainToAdd, setSelectedDomainToAdd] = useState("");

  const baseUrl = serverUrl.replace(/\/+$/, "");
  const authHeaders = { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" };

  const fetchUserDomains = async (uid: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/users/${uid}/domains`, {
        headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
      });
      if (res.ok) {
        const data = await res.json();
        setUserDomains(data.domains || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAvailableDomains = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/knowledge/graph?node_type=domain&slim=true`, {
        headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
      });
      if (res.ok) {
        const data = await res.json();
        const nodes = (data.nodes || []).filter((n: any) => n.node_type === "domain");
        setAvailableDomains(nodes);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      fetchUserDomains(selectedUserId);
      fetchAvailableDomains();
    }
  }, [selectedUserId, baseUrl, apiKey]);

  const handleAssignDomain = async (uid: string, targetDomainId?: string, canWrite: boolean = true) => {
    const domainId = targetDomainId || selectedDomainToAdd;
    if (!domainId) return;
    try {
      const res = await fetch(`${baseUrl}/api/users/${uid}/domains`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "X-App-Name": "savant-olympus",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domain_node_id: domainId, can_write: canWrite }),
      });
      if (res.ok) {
        if (!targetDomainId) setSelectedDomainToAdd("");
        await fetchUserDomains(uid);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveDomain = async (uid: string, domainNodeId: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/users/${uid}/domains/${domainNodeId}`, {
        method: "DELETE",
        headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
      });
      if (res.ok) {
        await fetchUserDomains(uid);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${baseUrl}/api/users?include_inactive=true&_=${Date.now()}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = (data || []).map((u: any) => ({
          ...u,
          id: u.id || u.user_id,
          username: u.username || u.user_id,
          active: u.active !== undefined ? u.active : (u.is_active === 1 || u.is_active === true)
        }));
        setUsers(mapped);
      } else {
        setUsers([]);
        setLoadError(`Unable to load users (${res.status}).`);
      }
    } catch (e) {
      console.error(e);
      setUsers([]);
      setLoadError("Unable to reach Savant server for user records.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [baseUrl, apiKey]);

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
    try {
      const res = await fetch(`${baseUrl}/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "X-API-Key": apiKey,
          "X-App-Name": "savant-olympus",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          role: editRole,
          is_active: editActive,
        }),
      });
      if (res.ok) {
        await fetchUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "X-App-Name": "savant-olympus",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: createUsername,
          username: createUsername,
          name: createName,
          email: createEmail,
          role: createRole,
          is_active: createActive,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const key = data.api_key || (data.api_keys && data.api_keys[0]);
        if (key) {
          setGeneratedKeyDetails({
            username: data.username || data.user_id || data.id || "",
            apiKey: key
          });
        }
        setCreateUsername("");
        setCreateName("");
        setCreateEmail("");
        setCreateRole("operator");
        setCreateActive(true);
        setShowCreateForm(false);
        const newUid = data.id || data.username || data.user_id;
        if (newUid) {
          setSelectedUserId(newUid);
          setEditName(data.name);
          setEditEmail(data.email || "");
          setEditRole(data.role);
          setEditActive(data.active !== undefined ? data.active : true);
        }
        await fetchUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/users/${userId}`, {
        method: "DELETE",
        headers: {
          "X-API-Key": apiKey,
          "X-App-Name": "savant-olympus",
        },
      });
      if (res.ok) {
        await fetchUsers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegenerateKey = async (userId: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/users/${userId}/api-key`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "X-App-Name": "savant-olympus",
        },
      });
      if (res.ok) {
        const data = await res.json();
        
        // If the rotated user key is the active user's key, update local settings and auth token
        const isSelf = activeUserId && (
          userId.toLowerCase() === activeUserId.toLowerCase() ||
          (selectedUser && (selectedUser.id || selectedUser.username || "").toLowerCase() === activeUserId.toLowerCase())
        );
        
        if (isSelf && data.api_key) {
          await window.system.saveSetting("user:apiKey", data.api_key);
          setStoredApiKey(data.api_key);
        }

        setGeneratedKeyDetails({
          username: userId,
          apiKey: data.api_key
        });
        
        if (isSelf && onSettingsChanged) {
          onSettingsChanged();
        }
        await fetchUsers();
      }
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

  const renderEditPage = (user: User) => {
    const userId = user.id || user.username;
    if (!isAdmin) {
      return (
        <div className="space-y-3 max-w-xl font-mono text-xs">
          <h3 className="text-sm font-bold text-[var(--cp-cyan)]">USER_{user.username}</h3>
          <p className="text-muted-foreground">Read-only user record. Administrator access is required to modify users.</p>
          <div>Name: {user.name}</div>
          <div>Email: {user.email || "—"}</div>
          <div>Role: {user.role}</div>
          <div>Status: {user.active ? "active" : "inactive"}</div>
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
          </div>
        </div>

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
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer"
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
                className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-3 py-2 focus:outline-none focus:border-[var(--cp-cyan)] font-mono cursor-pointer"
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
            {user.active && (
              <button
                onClick={() => handleDeleteUser(userId)}
                className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
                title="Deactivate user"
              >
                <X size={12} /> DEACTIVATE
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground opacity-60 leading-relaxed max-w-md">
            Regenerating the API key invalidates the current key instantly. Connected clients, services, or agents using the old key will be denied access.
          </p>
        </div>

        {/* Domain Access Control Section */}
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
                >
                  <Plus size={12} /> ASSIGN
                </button>
              </div>
            </div>
          )}
        </div>
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
