import React, { useState, useEffect } from "react";
import { Users, Key, Shield, UserCheck, Eye, EyeOff, Edit3, X, Save, Mail } from "lucide-react";

interface Operator {
  username: string;
  name: string;
  role: string;
  email?: string;
  api_key?: string;
  api_keys?: string[];
}

interface UsersViewProps {
  serverUrl: string;
  apiKey: string;
}

export function UsersView({ serverUrl, apiKey }: UsersViewProps) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});

  // Editing state
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editKey, setEditKey] = useState("");

  const baseUrl = serverUrl.replace(/\/+$/, "");

  const fetchOperators = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/auth/operators?_=${Date.now()}`, {
        headers: { "X-API-Key": apiKey },
      });
      if (res.ok) {
        const data = await res.json();
        setOperators(data.operators || data || []);
      } else {
        setOperators([
          { username: "ahmed", name: "Ahmed Shabbir", email: "ahmed@savant.ai", role: "admin", api_keys: ["sk-ahmed-savant-001"] },
          { username: "lex", name: "Lex Friedman", email: "lex@savant.ai", role: "operator", api_keys: ["sk-lex-savant-001"] },
        ]);
      }
    } catch (e) {
      console.error(e);
      // fallback
      setOperators([
        { username: "ahmed", name: "Ahmed Shabbir", email: "ahmed@savant.ai", role: "admin", api_keys: ["sk-ahmed-savant-001"] },
        { username: "lex", name: "Lex Friedman", email: "lex@savant.ai", role: "operator", api_keys: ["sk-lex-savant-001"] },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOperators();
  }, [baseUrl, apiKey]);

  const toggleShowKey = (username: string) => {
    setShowKeyMap((prev) => ({ ...prev, [username]: !prev[username] }));
  };

  const handleStartEdit = (op: Operator) => {
    setEditingUsername(op.username);
    setEditName(op.name);
    setEditEmail(op.email || "");
    setEditRole(op.role);
    setEditKey(op.api_keys?.[0] || op.api_key || "");
  };

  const handleCancelEdit = () => {
    setEditingUsername(null);
  };

  const handleSaveEdit = (username: string) => {
    setOperators(prev => prev.map(op => {
      if (op.username === username) {
        return {
          ...op,
          name: editName,
          email: editEmail,
          role: editRole,
          api_key: editKey,
          api_keys: [editKey],
        };
      }
      return op;
    }));
    setEditingUsername(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--cp-cyan)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            // OPERATORS & CREDENTIALS
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">Provisioned identities and authorization keys</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4">
        {isLoading ? (
          <div className="text-center py-12 text-xs text-[var(--cp-cyan)] animate-pulse">RESOLVING_OPERATORS...</div>
        ) : (
          <div className="space-y-4">
            {operators.map((op) => {
              const isEditing = editingUsername === op.username;
              return (
                <div key={op.username} className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
                  {isEditing ? (
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex flex-col space-y-1">
                          <label htmlFor="edit-name" className="text-[10px] text-muted-foreground uppercase font-mono">Full Name</label>
                          <input
                            id="edit-name"
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1 focus:outline-none font-mono"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label htmlFor="edit-email" className="text-[10px] text-muted-foreground uppercase font-mono">Email</label>
                          <input
                            id="edit-email"
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1 focus:outline-none font-mono"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label htmlFor="edit-role" className="text-[10px] text-muted-foreground uppercase font-mono">Role</label>
                          <select
                            id="edit-role"
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1 focus:outline-none font-mono"
                          >
                            <option value="admin">ADMIN</option>
                            <option value="operator">OPERATOR</option>
                            <option value="guest">GUEST</option>
                          </select>
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label htmlFor="edit-key" className="text-[10px] text-muted-foreground uppercase font-mono">API Key</label>
                          <input
                            id="edit-key"
                            type="text"
                            value={editKey}
                            onChange={(e) => setEditKey(e.target.value)}
                            className="bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1 focus:outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={handleCancelEdit}
                          className="px-2.5 py-1 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-mono flex items-center gap-1 cursor-pointer"
                        >
                          <X size={12} /> CANCEL
                        </button>
                        <button
                          onClick={() => handleSaveEdit(op.username)}
                          className="px-2.5 py-1 border border-[var(--cp-cyan)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.1)] text-xs font-mono flex items-center gap-1 cursor-pointer"
                        >
                          <Save size={12} /> SAVE
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] flex items-center justify-center text-[var(--cp-cyan)] shrink-0">
                          <Users size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-foreground font-mono truncate">
                              {op.name}
                            </h3>
                            <span className="text-[10px] text-muted-foreground font-mono">({op.username})</span>
                            <button
                              onClick={() => handleStartEdit(op)}
                              className="text-muted-foreground hover:text-[var(--cp-cyan)] p-1 cursor-pointer"
                              title="Edit operator information"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground font-mono">
                            <div className="flex items-center gap-1">
                              <Shield size={12} className="text-[var(--cp-cyan)]" />
                              Role: <span className="text-foreground">{op.role.toUpperCase()}</span>
                            </div>
                            {op.email && (
                              <div className="flex items-center gap-1">
                                <Mail size={12} className="text-[var(--cp-cyan)]" />
                                <span className="text-foreground truncate">{op.email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1.5 md:items-end shrink-0">
                        <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">// Authorization Token</span>
                        <div className="flex items-center gap-2 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] px-2.5 py-1">
                          <Key size={12} className="text-muted-foreground" />
                          <span className="text-xs font-mono tracking-wide text-foreground">
                            {showKeyMap[op.username]
                              ? (op.api_keys?.[0] || op.api_key || "NONE")
                              : "••••••••••••••••••••••••"}
                          </span>
                          <button
                            onClick={() => toggleShowKey(op.username)}
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            {showKeyMap[op.username] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
