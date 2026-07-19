import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Folder, RefreshCw, Download, Trash2, Cpu, FileCode, CheckCircle, Database, AlertTriangle, Layers, Play, Square, Trash, Zap, Clock, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { ContextVisualizations, analyzeProjectSource } from "./ContextVisualizations";
import { GraphifyVisualizer } from "./GraphifyVisualizer";
import { FileBrowserModal } from "../FileBrowserModal";
import { toast } from "sonner";

interface Repo {
  id?: string | number;
  repo_id?: string | number;
  name: string;
  path: string;
  source?: "github" | "gitlab" | "git" | "directory" | "unknown";
  source_label?: string;
  source_origin?: string;
  status?: string;
  file_count?: number;
  memory_count?: number;
  chunk_count?: number;
  ast_node_count?: number;
  indexed_at?: string;
  created_at?: string;
  languages?: Record<string, number>;
  provider?: string;
  freshness?: string;
  graph_version?: string;
  code_intelligence?: StructuralHealth;
}

interface StructuralHealth {
  provider?: string;
  freshness?: "fresh" | "pending_sync" | "stale" | "degraded" | "unavailable" | string;
  indexed?: boolean;
  graph_version?: string | null;
  warnings?: string[];
  current_job?: Record<string, any> | null;
  last_job?: Record<string, any> | null;
}

interface ContextViewProps {
  serverUrl: string;
  apiKey: string;
  onSelectProject: (projName: string | null) => void;
  selectedProject: string | null;
  activeModel?: { provider: string; model: string };
  isAdmin?: boolean;
}



export function ContextView({ serverUrl, apiKey, onSelectProject, selectedProject, activeModel, isAdmin = false }: ContextViewProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPath, setNewRepoPath] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshingRepo, setRefreshingRepo] = useState<string | null>(null);
  const [indexingStatus, setIndexingStatus] = useState<Record<string, any>>({});
  const previousIndexingStatusRef = useRef<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isRepoPaneOpen, setIsRepoPaneOpen] = useState(true);
  const [structuralHealth, setStructuralHealth] = useState<StructuralHealth | null>(null);
  const [isLoadingStructuralHealth, setIsLoadingStructuralHealth] = useState(false);

  const baseUrl = serverUrl.replace(/\/+$/, "");
  const authHeaders = { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" };

  const fetchRepos = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${baseUrl}/api/context/repos`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`Unable to load projects (${res.status}).`);
      const data = await res.json();
      setRepos(data.repos || data || []);
    } catch (e: any) {
      console.error(e);
      setRepos([]);
      setLoadError(e.message || "Unable to reach Savant server for projects.");
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, apiKey]);

  const fetchIndexingStatus = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/context/repos/indexing-status`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        const nextStatus = data.status || data || {};
        const previousStatus = previousIndexingStatusRef.current;
        const changedRepos = Object.keys({ ...previousStatus, ...nextStatus }).filter((name) => {
          const previous = previousStatus[name] || {};
          const next = nextStatus[name] || {};
          return ["status", "progress", "phase", "current_file", "error"].some((key) => previous[key] !== next[key]);
        });
        const completedRepo = changedRepos.some((name) => {
          const previous = previousStatus[name]?.status;
          const next = nextStatus[name]?.status;
          const active = ["indexing", "running", "queued", "processing"].includes(next);
          return previous && previous !== next && !active;
        });

        previousIndexingStatusRef.current = nextStatus;
        setIndexingStatus(nextStatus);
        if (completedRepo) fetchRepos();
      }
    } catch (e) {
      console.error(e);
    }
  }, [baseUrl, apiKey, fetchRepos]);

  useEffect(() => {
    fetchRepos();
    fetchIndexingStatus();
    const interval = setInterval(fetchIndexingStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchRepos, fetchIndexingStatus]);

  const [astNodes, setAstNodes] = useState<any[]>([]);
  const [analysisResults, setAnalysisResults] = useState<any | null>(null);
  const [detailsTab, setDetailsTab] = useState<"overview" | "visuals" | "graphify">("overview");

  const [graphifyJson, setGraphifyJson] = useState<any | null>(null);
  const [graphifyStats, setGraphifyStats] = useState<any | null>(null);
  const [isUploadingGraphify, setIsUploadingGraphify] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [graphVersion, setGraphVersion] = useState(0);

  const repoIdentity = (repo: Repo) => String(repo.repo_id ?? repo.id ?? repo.name);

  const fetchGraphifyStats = async (repo: Repo) => {
    try {
      const res = await fetch(`${baseUrl}/api/graphify/stats?repo_id=${encodeURIComponent(repoIdentity(repo))}&workspace_id=${encodeURIComponent(repo.name)}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setGraphifyStats(data);
        if ((!data || data.total === 0) && detailsTab === "graphify") {
          setDetailsTab("overview");
        }
      } else {
        setGraphifyStats(null);
        if (detailsTab === "graphify") {
          setDetailsTab("overview");
        }
      }
    } catch (e) {
      console.error(e);
      setGraphifyStats(null);
      if (detailsTab === "graphify") {
        setDetailsTab("overview");
      }
    }
  };

  const fetchStructuralHealth = useCallback(async (repo: Repo) => {
    setIsLoadingStructuralHealth(true);
    try {
      const res = await fetch(`${baseUrl}/api/context/code-intelligence/repos/${encodeURIComponent(repoIdentity(repo))}/health`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`Structural health unavailable (${res.status})`);
      setStructuralHealth(await res.json());
    } catch (error) {
      console.error(error);
      setStructuralHealth({
        provider: repo.provider || repo.code_intelligence?.provider || "legacy",
        freshness: repo.freshness || repo.code_intelligence?.freshness || "unavailable",
        graph_version: repo.graph_version || repo.code_intelligence?.graph_version,
        warnings: ["Structural health is currently unavailable."],
      });
    } finally {
      setIsLoadingStructuralHealth(false);
    }
  }, [baseUrl, apiKey]);

  const handleUploadGraphify = async () => {
    if (!selectedRepo) return;
    setIsUploadingGraphify(true);
    setUploadSuccess(null);
    try {
      let graphData = graphifyJson;
      if (typeof window.system?.readGraphifyJson === 'function') {
        const freshJson = await window.system.readGraphifyJson(selectedRepo.path);
        if (freshJson) {
          graphData = freshJson;
          setGraphifyJson(freshJson);
        } else {
          throw new Error("Could not read local graphify-out/graph.json. Please generate it first.");
        }
      } else if (!graphData) {
        throw new Error("Local graphify-out/graph.json is not loaded and filesystem is not accessible in this context.");
      }

      const res = await fetch(`${baseUrl}/api/graphify/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          repo_id: repoIdentity(selectedRepo),
          workspace_id: selectedRepo.name,
          graph: graphData
        })
      });
      if (res.ok) {
        const data = await res.json();
        setUploadSuccess(`Successfully uploaded Graphify KG! Imported ${data.nodes_imported} nodes and ${data.edges_imported} edges.`);
        fetchGraphifyStats(selectedRepo);
        setGraphVersion((prev) => prev + 1);
      } else {
        const err = await res.json();
        setUploadSuccess(`Upload failed: ${err.error || "unknown error"}`);
      }
    } catch (e: any) {
      setUploadSuccess(`Upload failed: ${e.message}`);
    } finally {
      setIsUploadingGraphify(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedRepo) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingGraphify(true);
    setUploadSuccess(null);

    const jsonFiles = Array.from(files).filter((file) => {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".json")) return false;
      const path = (file.webkitRelativePath || "").toLowerCase();
      if (path.includes("/cache/") || path.includes("\\cache\\")) return false;
      return true;
    });

    if (jsonFiles.length === 0) {
      setUploadSuccess("No JSON files found in the selected directory.");
      setIsUploadingGraphify(false);
      e.target.value = "";
      return;
    }

    const promises = jsonFiles.map((file) => {
      return new Promise<{ name: string; relPath: string; content: any }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const text = evt.target?.result;
            if (typeof text !== "string") throw new Error("Could not read file");
            const json = JSON.parse(text);
            resolve({
              name: file.name,
              relPath: file.webkitRelativePath || "",
              content: json
            });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsText(file);
      });
    });

    Promise.all(promises)
      .then(async (results) => {
        let graphJson: any = null;
        let metaJson: any = null;
        let bestGraphDepth = Infinity;
        let bestMetaDepth = Infinity;

        results.forEach((item) => {
          const depth = (item.relPath.match(/[\/\\]/g) || []).length;
          const isGraph = !!(item.content.nodes || item.content.edges || item.content.vertices || item.content.links);

          if (isGraph) {
            if (depth < bestGraphDepth) {
              graphJson = item.content;
              bestGraphDepth = depth;
            }
          } else {
            if (depth < bestMetaDepth) {
              metaJson = item.content;
              bestMetaDepth = depth;
            }
          }
        });

        // Fallback if only 1 file is selected
        if (!graphJson && results.length === 1) {
          graphJson = results[0].content;
        }

        if (!graphJson) {
          throw new Error("Could not find a valid graph JSON file containing nodes/edges in the selected directory.");
        }

        const res = await fetch(`${baseUrl}/api/graphify/import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders
          },
          body: JSON.stringify({
            repo_id: repoIdentity(selectedRepo),
            workspace_id: selectedRepo.name,
            graph: graphJson,
            meta: metaJson
          })
        });

        if (res.ok) {
          const data = await res.json();
          setUploadSuccess(`Successfully uploaded Graphify KG! Imported ${data.nodes_imported} nodes and ${data.edges_imported} edges.`);
          fetchGraphifyStats(selectedRepo);
          setGraphVersion((prev) => prev + 1);
        } else {
          const err = await res.json();
          setUploadSuccess(`Upload failed: ${err.error || "unknown error"}`);
        }
      })
      .catch((err: any) => {
        setUploadSuccess(`Upload failed: ${err.message}`);
      })
      .finally(() => {
        setIsUploadingGraphify(false);
        e.target.value = "";
      });
  };

  const selectedRepo = repos.find((r) => r.name === selectedProject);

  useEffect(() => {
    if (selectedRepo?.path) {
      setGraphifyJson(null);
      setUploadSuccess(null);
      if (typeof window.system?.readGraphifyJson === 'function') {
        window.system.readGraphifyJson(selectedRepo.path)
          .then((json) => {
            if (json) {
              setGraphifyJson(json);
            }
          })
          .catch((err) => {
            console.error("Failed to read graphify json on mount:", err);
          });
      }
      fetchGraphifyStats(selectedRepo);
      fetchStructuralHealth(selectedRepo);
    } else {
      setGraphifyJson(null);
      setGraphifyStats(null);
      setUploadSuccess(null);
    }
  }, [selectedRepo?.path, selectedRepo?.name, selectedRepo?.id, selectedRepo?.repo_id, baseUrl, apiKey, fetchStructuralHealth]);

  const fetchAstAndAnalyze = useCallback(async (projectName: string, repoOverride?: Repo) => {
    try {
      const repo = repoOverride || repos.find((item) => item.name === projectName);
      const identity = repo ? repoIdentity(repo) : projectName;
      const res = await fetch(`${baseUrl}/api/context/ast/list?repo_id=${encodeURIComponent(identity)}&repo=${encodeURIComponent(projectName)}`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to load AST list");
      const data = await res.json();
      const nodes = data.nodes || [];
      setAstNodes(nodes);

      const targetPaths = Array.from(new Set(nodes.map((n: any) => n.path).filter(Boolean))).slice(0, 100);
      const docs: any[] = [];
      await Promise.all(
        targetPaths.map(async (relPath: any) => {
          try {
            const uri = `${projectName}:${relPath}`;
            const fileRes = await fetch(`${baseUrl}/api/context/code/read?uri=${encodeURIComponent(uri)}`, {
              headers: authHeaders,
            });
            if (fileRes.ok) {
              const doc = await fileRes.json();
              docs.push({ path: relPath, language: doc.language || "", content: doc.content || "" });
            }
          } catch (err) {}
        })
      );

      const analysis = analyzeProjectSource(nodes, docs);
      setAnalysisResults(analysis);
    } catch (e) {
      console.error("Heuristics failed:", e);
      setAnalysisResults(null);
    }
  }, [baseUrl, apiKey, repos]);

  useEffect(() => {
    if (selectedRepo) {
      setAstNodes([]);
      setAnalysisResults(null);
      setDetailsTab("overview");
      fetchAstAndAnalyze(selectedRepo.name, selectedRepo);
    }
  }, [selectedRepo, fetchAstAndAnalyze]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const [sources, setSources] = useState<any>(null);
  const [selectedSource, setSelectedSource] = useState("github");
  const [repoUrl, setRepoUrl] = useState("");
  const [dirPath, setDirPath] = useState("");
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const normalizeFsPath = (input: string) => {
    return String(input || "").replace(/\\/g, "/").replace(/\/+$/, "");
  };

  const relativeToBase = (selectedPath: string, basePath: string) => {
    const selected = normalizeFsPath(selectedPath);
    const base = normalizeFsPath(basePath);
    if (!selected || !base) return "";
    if (selected === base) return "";
    if (!selected.startsWith(base + "/")) return "";
    return selected.slice(base.length + 1);
  };

  const handleOpenAddModal = async () => {
    setIsAddModalOpen(true);
    setAddError(null);
    setRepoUrl("");
    setDirPath("");
    try {
      const res = await fetch(`${baseUrl}/api/context/repos/sources`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to load sources");
      const data = await res.json();
      setSources(data.sources || null);
      
      if (data.sources) {
        const enabled = Object.entries(data.sources)
          .filter(([_, cfg]: any) => cfg && cfg.enabled)
          .map(([key]) => key);
        if (enabled.length > 0) {
          setSelectedSource(enabled[0]);
        }
      }
    } catch (e: any) {
      setAddError("Failed to load project sources: " + e.message);
    }
  };

  const handleBrowseDirectory = async () => {
    setIsFileBrowserOpen(true);
  };

  const handleConfirmAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setIsSubmittingAdd(true);

    const payload: any = { source: selectedSource };
    if (selectedSource === "directory") {
      if (!dirPath.trim()) {
        setAddError("Directory path is required");
        setIsSubmittingAdd(false);
        return;
      }
      payload.directory = dirPath.trim();
    } else {
      if (!repoUrl.trim()) {
        setAddError("Repository URL is required");
        setIsSubmittingAdd(false);
        return;
      }
      payload.url = repoUrl.trim();
    }

    try {
      const res = await fetch(`${baseUrl}/api/context/repos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errMessage = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          errMessage = errJson.error || errMessage;
        } catch {}
        throw new Error(errMessage);
      }
      setIsAddModalOpen(false);
      fetchRepos();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Poll for job completion and fire toast
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollForJobCompletion = useCallback((repoName: string, jobLabel: string) => {
    // Clear any existing poll
    if (jobPollRef.current) clearInterval(jobPollRef.current);

    jobPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${baseUrl}/api/context/repos/indexing-status`, {
          headers: authHeaders,
        });
        if (!res.ok) return;
        const data = await res.json();
        const nextStatus = data.status || data || {};
        const status = nextStatus[repoName] || {};
        const activeStatus = status.status || "idle";
        previousIndexingStatusRef.current = nextStatus;
        setIndexingStatus(nextStatus);

        if (activeStatus !== "indexing" && activeStatus !== "running" && activeStatus !== "queued" && activeStatus !== "processing") {
          if (jobPollRef.current) clearInterval(jobPollRef.current);
          jobPollRef.current = null;
          toast.success(`${jobLabel} completed for "${repoName}"`, {
            description: "Refreshing project data...",
            duration: 5000,
          });
          fetchRepos();
          if (selectedProject === repoName) {
            fetchAstAndAnalyze(repoName);
          }
        }
      } catch (e) {
        // Silently continue polling
      }
    }, 3000);
  }, [baseUrl, apiKey, selectedProject]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (jobPollRef.current) clearInterval(jobPollRef.current);
    };
  }, []);

  const handleRefreshRepo = async (repoName: string) => {
    setRefreshingRepo(repoName);
    try {
      const res = await fetch(`${baseUrl}/api/context/repos/${encodeURIComponent(repoName)}/refresh`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {}
        throw new Error(message);
      }
      toast.success(`Latest code pulled for "${repoName}"`, {
        description: "The checkout is now up to date. Queue indexing when you want to refresh Context data.",
        duration: 5000,
      });
      fetchRepos();
    } catch (e: any) {
      toast.error(`Failed to refresh "${repoName}"`, { description: e.message });
    } finally {
      setRefreshingRepo(null);
    }
  };

  const handleStartIndexing = async (repoName: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/context/repos/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ name: repoName }),
      });
      if (!res.ok) throw new Error("Failed to start indexing");
      toast.info(`Indexing job queued for "${repoName}"`, {
        description: "You will be notified when the job completes.",
        duration: 4000,
      });
      fetchIndexingStatus();
      pollForJobCompletion(repoName, "Index generation");
    } catch (e: any) {
      toast.error("Failed to queue indexing job", { description: e.message });
    }
  };

  const handleSyncCodeGraph = async (repo: Repo) => {
    try {
      const res = await fetch(`${baseUrl}/api/context/code-intelligence/repos/${encodeURIComponent(repoIdentity(repo))}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ mode: "create_or_sync" }),
      });
      if (!res.ok) throw new Error("Failed to sync code graph");
      toast.info(`Code graph sync queued for "${repo.name}"`, {
        description: "You will be notified when the job completes.",
        duration: 4000,
      });
      fetchIndexingStatus();
      pollForJobCompletion(repo.name, "Code graph sync");
      fetchStructuralHealth(repo);
    } catch (e: any) {
      toast.error("Failed to queue code graph sync", { description: e.message });
    }
  };

  const handleStopIndexing = async (repoName: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/context/repos/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ name: repoName }),
      });
      if (!res.ok) throw new Error("Failed to stop indexing");
      fetchIndexingStatus();
      setTimeout(fetchRepos, 1000);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handlePurgeRepo = async (repoName: string) => {
    if (!confirm(`Purge all indexed data for "${repoName}"? The project will be kept but all vectors and chunks will be removed.`)) return;
    try {
      const res = await fetch(`${baseUrl}/api/context/repos/purge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ name: repoName }),
      });
      if (!res.ok) throw new Error("Failed to purge repository");
      fetchRepos();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteRepo = async (repoName: string) => {
    if (!confirm(`Delete project "${repoName}" and all its indexed data?`)) return;
    try {
      const res = await fetch(`${baseUrl}/api/context/repos/${encodeURIComponent(repoName)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to delete repository");
      if (selectedProject === repoName) onSelectProject(null);
      fetchRepos();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const statusInfo = selectedProject ? indexingStatus[selectedProject] || {} : {};
  const liveStatus = (statusInfo.status || selectedRepo?.status || "ready").toLowerCase();
  const isCurrentlyIndexing = liveStatus === "indexing" || liveStatus === "running" || liveStatus === "queued" || liveStatus === "processing";
  const structuralJob = structuralHealth?.current_job || statusInfo.structural_job;
  const structuralJobStatus = String(structuralJob?.status || "").toLowerCase();
  const isStructuralJobActive = ["indexing", "running", "queued", "processing"].includes(structuralJobStatus);
  const structuralProvider = structuralHealth?.provider || selectedRepo?.provider || selectedRepo?.code_intelligence?.provider || "legacy";
  const structuralFreshness = structuralHealth?.freshness || selectedRepo?.freshness || selectedRepo?.code_intelligence?.freshness || "unavailable";
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredRepos = normalizedSearchQuery
    ? repos.filter((repo) => JSON.stringify({ ...repo, live_status: indexingStatus[repo.name] || {} }).toLowerCase().includes(normalizedSearchQuery))
    : repos;

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            CONTEXT ENGINE
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">Manage indexed code repositories & projects</p>
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Repository list */}
        <div className={`${isRepoPaneOpen ? "w-80" : "w-11"} flex flex-col space-y-3 shrink-0 overflow-hidden transition-all duration-200`}>
          <div className="flex items-center justify-between border border-[var(--cp-border)] bg-[var(--cp-bg-1)] px-2 py-1.5">
            {isRepoPaneOpen && (
              <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                Project tree
              </h3>
            )}
            <button
              type="button"
              onClick={() => setIsRepoPaneOpen((open) => !open)}
              title={isRepoPaneOpen ? "Collapse project tree" : "Expand project tree"}
              aria-label={isRepoPaneOpen ? "Collapse project tree" : "Expand project tree"}
              className="h-6 w-6 inline-flex items-center justify-center border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
            >
              {isRepoPaneOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>

          {isRepoPaneOpen ? (
            <>
              {isAdmin && (
                <>
                  <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                    Actions
                  </h3>
                  <button
                    onClick={handleOpenAddModal}
                    className="w-full py-2.5 text-xs bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold hover:opacity-90 cursor-pointer font-mono tracking-wider"
                  >
                    + REGISTER REPOSITORY
                  </button>
                </>
              )}

              <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider pt-2" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                Registered Projects
              </h3>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search projects..."
                  aria-label="Search projects"
                  className="w-full h-7 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] pl-7 pr-2 text-[10px] text-foreground font-mono outline-none focus:border-[var(--cp-cyan)]"
                />
              </div>
              <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2 space-y-2">
                {isLoading ? (
                  <div className="text-center py-6 text-xs text-[var(--cp-cyan)] animate-pulse">LOADING_REPOS...</div>
                ) : loadError ? (
                  <div className="text-center py-6 text-xs text-red-400 font-mono">{loadError}</div>
                ) : filteredRepos.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground opacity-40">
                    {normalizedSearchQuery ? "No matching projects." : "No projects registered."}
                  </div>
                ) : (
                  filteredRepos.map((repo) => {
                const status = indexingStatus[repo.name] || {};
                const isSelected = selectedProject === repo.name;
                const activeStatus = (status.status || repo.status || "ready").toLowerCase();
                const isFailed = activeStatus === "error" || activeStatus === "failed" || activeStatus === "stalled";
                const isBusy = activeStatus === "indexing" || activeStatus === "running" || activeStatus === "queued" || activeStatus === "processing";

                let tone = "border-[var(--cp-border)]";
                if (isSelected) {
                  tone = "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.05)]";
                } else if (isFailed) {
                  tone = "border-red-900 bg-[rgba(239,68,68,0.02)] hover:border-red-700";
                } else if (isBusy) {
                  tone = "border-amber-900 bg-[rgba(245,158,11,0.02)] hover:border-amber-700";
                } else {
                  tone = "border-[var(--cp-border)] bg-[var(--cp-bg-2)] hover:border-[rgba(0,229,255,0.3)]";
                }

                return (
                  <div
                    key={repo.name}
                    onClick={() => onSelectProject(repo.name)}
                    className={`p-2.5 border cursor-pointer transition-all ${tone}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
                        {repo.name}
                      </span>
                      {isAdmin && <div className="flex items-center gap-1.5">
                        {(repo.source === "github" || repo.source === "gitlab") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRefreshRepo(repo.name);
                            }}
                            title={`Refetch latest code from ${repo.source_label || repo.source}`}
                            aria-label={`Refetch code for ${repo.name}`}
                            className="p-1 hover:text-[var(--cp-cyan)]"
                            disabled={refreshingRepo === repo.name || isBusy}
                          >
                            <Download size={10} className={refreshingRepo === repo.name ? "animate-bounce text-[var(--cp-cyan)]" : ""} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartIndexing(repo.name);
                          }}
                          title="Trigger indexing"
                          aria-label={`Index ${repo.name}`}
                          className="p-1 hover:text-[var(--cp-cyan)]"
                          disabled={isBusy}
                        >
                          <RefreshCw size={10} className={isBusy ? "animate-spin text-amber-500" : ""} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRepo(repo.name);
                          }}
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{repo.path}</p>
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono mt-1.5">
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isFailed ? "bg-red-500" : isBusy ? "bg-amber-500" : "bg-green-500"
                        }`} />
                        STATUS: {activeStatus.toUpperCase()}
                      </span>
                      {status.progress != null && <span>{Math.round(status.progress)}%</span>}
                    </div>
                  </div>
                );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex items-center justify-center">
              <span className="font-mono text-[10px] text-[var(--cp-cyan)] [writing-mode:vertical-rl] rotate-180 tracking-widest">
                PROJECTS
              </span>
            </div>
          )}
        </div>

        {/* Project details */}
        <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 flex flex-col overflow-hidden">
          {selectedRepo ? (
            <div className={`flex flex-col h-full space-y-4 pr-1 ${detailsTab === "overview" ? "overflow-y-auto" : "overflow-hidden"}`}>
              {/* Header */}
              <div className="border-b border-[var(--cp-border)] pb-3 flex justify-between items-start">
                <div>
                  <h3 className="text-md font-bold text-foreground flex items-center gap-2">
                    {selectedRepo.name}
                    <span className={`px-2 py-0.5 text-[9px] uppercase font-mono border rounded ${
                      liveStatus === "indexing" || liveStatus === "running" ? "border-amber-500 text-amber-500 bg-amber-950/20" :
                      liveStatus === "queued" ? "border-blue-500 text-blue-500 bg-blue-950/20" :
                      liveStatus === "error" || liveStatus === "failed" ? "border-red-500 text-red-500 bg-red-950/20" :
                      "border-green-500 text-green-500 bg-green-950/20"
                    }`}>
                      {liveStatus}
                    </span>
                  </h3>
                  <p className="text-[10px] text-muted-foreground font-mono mt-1">{selectedRepo.path}</p>
                </div>
              </div>

              {/* Details Tab Toggle */}
              <div className="flex gap-2 border-b border-[var(--cp-border)] pb-2 font-mono shrink-0">
                <button
                  onClick={() => setDetailsTab("overview")}
                  className={`px-3 py-1 text-xs uppercase border ${
                    detailsTab === "overview"
                      ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground"
                  } cursor-pointer`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setDetailsTab("visuals")}
                  className={`px-3 py-1 text-xs uppercase border ${
                    detailsTab === "visuals"
                      ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground"
                  } cursor-pointer`}
                >
                  Visualizations & Heuristics
                </button>
                {((graphifyStats && graphifyStats.total > 0) || structuralProvider === "codegraph") && (
                  <button
                    onClick={() => setDetailsTab("graphify")}
                    className={`px-3 py-1 text-xs uppercase border ${
                      detailsTab === "graphify"
                        ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                        : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground"
                    } cursor-pointer`}
                  >
                    Project Graph
                  </button>
                )}
              </div>

              {detailsTab === "overview" ? (
                <>
                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {isAdmin ? <>
                    {isCurrentlyIndexing ? (
                      <button
                        onClick={() => handleStopIndexing(selectedRepo.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-950 text-red-400 border border-red-900 hover:bg-red-900 hover:text-red-200 cursor-pointer font-mono font-bold"
                      >
                        <Square size={12} /> STOP JOB
                      </button>
                    ) : null}
                    {(selectedRepo.source === "github" || selectedRepo.source === "gitlab") && (
                      <button
                        onClick={() => handleRefreshRepo(selectedRepo.name)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] bg-cyan-950 text-[var(--cp-cyan)] border border-cyan-900 hover:bg-cyan-900 cursor-pointer font-mono font-bold"
                        disabled={refreshingRepo === selectedRepo.name || isCurrentlyIndexing}
                        title={`Refetch latest code from ${selectedRepo.source_label || selectedRepo.source}`}
                        aria-label={`Refetch code for ${selectedRepo.name}`}
                      >
                        <Download size={11} className={refreshingRepo === selectedRepo.name ? "animate-bounce" : ""} />
                        {refreshingRepo === selectedRepo.name ? "FETCHING..." : "REFETCH"}
                      </button>
                    )}
                    <button
                      onClick={() => handleStartIndexing(selectedRepo.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-950 text-[var(--cp-cyan)] border border-teal-900 hover:bg-teal-900 cursor-pointer font-mono font-bold"
                      disabled={isCurrentlyIndexing}
                    >
                      <Zap size={12} /> INDEX REPO
                    </button>
                    <button
                      onClick={() => handleSyncCodeGraph(selectedRepo)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-950 text-indigo-400 border border-indigo-900 hover:bg-indigo-900 hover:text-indigo-200 cursor-pointer font-mono font-bold"
                      disabled={isCurrentlyIndexing || isStructuralJobActive}
                    >
                      <FileCode size={12} /> {isStructuralJobActive ? "SYNCING CODE GRAPH..." : "SYNC CODE GRAPH"}
                    </button>
                    <button
                      onClick={() => handleDeleteRepo(selectedRepo.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-950 text-red-500 border border-red-950 hover:bg-red-900 hover:text-red-400 cursor-pointer font-mono font-bold"
                    >
                      <Trash2 size={12} /> DELETE PROJECT
                    </button>
                    </> : <span className="text-[10px] text-muted-foreground font-mono border border-[var(--cp-border)] px-2 py-1">READ-ONLY MEMBER ACCESS</span>}
                  </div>


                  <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded font-mono text-xs" data-testid="structural-health">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[var(--section-label)] uppercase tracking-wider">Structural Intelligence</span>
                      <div className="flex items-center gap-2 uppercase text-[10px]">
                        <span>Provider: <strong className="text-foreground">{structuralProvider}</strong></span>
                        <span>Freshness: <strong className={structuralFreshness === "fresh" ? "text-green-400" : structuralFreshness === "pending_sync" ? "text-amber-400" : "text-red-400"}>{isLoadingStructuralHealth ? "loading" : structuralFreshness}</strong></span>
                      </div>
                    </div>
                    {structuralHealth?.graph_version && <p className="mt-1 text-[10px] text-muted-foreground">Graph version: {structuralHealth.graph_version}</p>}
                    {structuralFreshness === "pending_sync" && <p className="mt-2 text-amber-400">A structural sync is pending. Existing results may be incomplete.</p>}
                    {structuralFreshness === "stale" && <p className="mt-2 text-amber-400">The code graph is stale. Sync Code Graph to refresh it.</p>}
                    {structuralFreshness === "degraded" && <p className="mt-2 text-red-400">Structural intelligence is degraded. Results may be incomplete; review provider warnings.</p>}
                    {structuralFreshness === "unavailable" && <p className="mt-2 text-red-400">Structural intelligence is unavailable. Check provider health, then retry Sync Code Graph.</p>}
                    {structuralHealth?.warnings?.map((warning) => <p key={warning} className="mt-1 text-[10px] text-amber-400">{warning}</p>)}
                  </div>

                  {/* Progress Section */}
                  {isCurrentlyIndexing && (
                    <div className="bg-[var(--cp-bg-2)] border border-amber-900/50 p-3 space-y-2 rounded">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-amber-500 font-bold uppercase">
                          {statusInfo.job_type === "ast" ? "AST Generation In Progress" : "Indexing In Progress"}
                        </span>
                        <span className="text-amber-400">{Math.round(statusInfo.progress || 0)}%</span>
                      </div>
                      <div className="w-full bg-[var(--cp-bg-3)] h-1.5 rounded overflow-hidden">
                        <div
                          className="bg-amber-500 h-full transition-all duration-300"
                          style={{ width: `${statusInfo.progress || 0}%` }}
                        />
                      </div>
                      {statusInfo.phase && (
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          PHASE: {statusInfo.phase}
                        </p>
                      )}
                      {statusInfo.current_file && (
                        <p className="text-[9px] text-muted-foreground font-mono truncate" title={statusInfo.current_file}>
                          FILE: {statusInfo.current_file}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] uppercase font-mono text-[var(--section-label)] tracking-wider">Overview Metrics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                        <span className="block text-[10px] font-mono text-muted-foreground uppercase">Total Files</span>
                        <span className="text-lg font-bold text-foreground">{selectedRepo.file_count ?? 0}</span>
                      </div>
                      <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                        <span className="block text-[10px] font-mono text-muted-foreground uppercase">Memory Bank</span>
                        <span className="text-lg font-bold text-foreground">{selectedRepo.memory_count ?? 0}</span>
                      </div>
                      <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                        <span className="block text-[10px] font-mono text-muted-foreground uppercase">Index Chunks</span>
                        <span className="text-lg font-bold text-foreground">{selectedRepo.chunk_count ?? 0}</span>
                      </div>
                      <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                        <span className="block text-[10px] font-mono text-muted-foreground uppercase">AST Nodes</span>
                        <span className="text-lg font-bold text-foreground">{selectedRepo.ast_node_count ?? 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Code graph statistics */}
                  {graphifyStats && graphifyStats.total > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] uppercase font-mono text-[var(--section-label)] tracking-wider">Code Graph Stats</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(graphifyStats.stats || {}).map(([type, count]) => (
                          <div key={type} className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                            <span className="block text-[10px] font-mono text-muted-foreground uppercase">{type} Nodes</span>
                            <span className="text-lg font-bold text-foreground">{count as number}</span>
                          </div>
                        ))}
                        <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                          <span className="block text-[10px] font-mono text-muted-foreground uppercase">Total Code Graph Nodes</span>
                          <span className="text-lg font-bold text-foreground">{graphifyStats.total}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Languages Distribution */}
                  {selectedRepo.languages && Object.keys(selectedRepo.languages).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] uppercase font-mono text-[var(--section-label)] tracking-wider">Languages</h4>
                      <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded space-y-2 font-mono text-xs">
                        {Object.entries(selectedRepo.languages)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 5)
                          .map(([lang, count]) => {
                            const total = Object.values(selectedRepo.languages!).reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? (count / total) * 100 : 0;
                            return (
                              <div key={lang} className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-foreground">{lang}</span>
                                  <span className="text-muted-foreground">{count} files ({pct.toFixed(1)}%)</span>
                                </div>
                                <div className="w-full bg-[var(--cp-bg-3)] h-1 rounded overflow-hidden">
                                  <div className="bg-[var(--cp-cyan)] h-full opacity-80" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] uppercase font-mono text-[var(--section-label)] tracking-wider">Timeline</h4>
                    <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded text-xs font-mono text-muted-foreground space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-muted-foreground/60" />
                        <span>Last Indexed: <strong className="text-foreground">{selectedRepo.indexed_at ? new Date(selectedRepo.indexed_at).toLocaleString() : "Never"}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-muted-foreground/60" />
                        <span>Registered: <strong className="text-foreground">{selectedRepo.created_at ? new Date(selectedRepo.created_at).toLocaleString() : "Unknown"}</strong></span>
                      </div>
                    </div>
                  </div>
                </>
              ) : detailsTab === "visuals" ? (
                <ContextVisualizations nodes={astNodes} repoName={selectedRepo.name} analysis={analysisResults} activeModel={activeModel} serverUrl={serverUrl} apiKey={apiKey} />
              ) : (
                <div className="flex flex-col h-full gap-3">
                  <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded flex items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">
                        CODE GRAPH: <strong className="text-foreground">{graphifyStats?.total || 0} nodes</strong>
                      </span>
                    </div>
                  </div>

                  {((graphifyStats && graphifyStats.total > 0) || structuralProvider === "codegraph") ? (
                    <GraphifyVisualizer
                      key={`${selectedRepo.name}-${graphVersion}`}
                      repoId={repoIdentity(selectedRepo)}
                      repoName={selectedRepo.name}
                      baseUrl={serverUrl}
                      apiKey={apiKey}
                      activeModel={activeModel}
                    />
                  ) : (
                    <div className="flex-1 min-h-[350px] bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded flex flex-col items-center justify-center text-center p-6">
                      <p className="text-xs font-mono text-muted-foreground max-w-md mb-4 leading-relaxed uppercase">
                        No project graph is available. Use Sync Code Graph to build structural data for this repository.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
              <Folder size={48} className="text-muted-foreground mb-2" />
              <span className="text-xs tracking-widest font-mono text-[var(--section-label)] uppercase">
                select_project_to_explore_context
              </span>
            </div>
          )}
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-5 flex flex-col space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-2.5">
              <span className="text-xs font-bold font-mono text-[var(--section-label)] tracking-wider">
                REGISTER NEW REPOSITORY
              </span>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer font-mono text-xs"
              >
                [CLOSE]
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-red-950/20 border border-red-900/50 text-red-400 text-xs font-mono rounded flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmAdd} className="space-y-4">
              <div>
                <label htmlFor="source-select" className="block text-[10px] uppercase font-mono text-muted-foreground mb-1.5">Select Source</label>
                <select
                  id="source-select"
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none"
                  disabled={!sources}
                >
                  {sources ? (
                    Object.entries(sources)
                      .filter(([_, cfg]: any) => cfg && cfg.enabled)
                      .map(([key]) => (
                        <option key={key} value={key}>
                          {key === "github" ? "GitHub Repository" : key === "gitlab" ? "GitLab Repository" : "Local Directory"}
                        </option>
                      ))
                  ) : (
                    <option>Loading sources...</option>
                  )}
                </select>
              </div>

              {sources && Object.values(sources).every((cfg: any) => !cfg?.enabled) ? (
                <div className="p-3 bg-amber-950/20 border border-amber-900/50 text-amber-400 text-xs font-mono rounded">
                  No project sources are configured on the Savant server. Configure BASE_CODE_DIR, GITHUB_TOKEN, or GITLAB_TOKEN and try again.
                </div>
              ) : selectedSource === "directory" ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="dir-path-input" className="block text-[10px] uppercase font-mono text-muted-foreground mb-1.5">
                      Directory (Relative to BASE_CODE_DIR)
                    </label>
                    <div className="space-y-2">
                      <input
                        id="dir-path-input"
                        type="text"
                        placeholder="team/project"
                        value={dirPath}
                        onChange={(e) => setDirPath(e.target.value)}
                        className="w-full bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none"
                        required
                      />
                      {sources?.directory && (
                        <button
                          type="button"
                          onClick={handleBrowseDirectory}
                          className="w-full py-1.5 text-[10px] bg-[var(--cp-bg-2)] hover:bg-[var(--cp-bg-3)] text-[var(--cp-cyan)] border border-[var(--cp-border)] font-mono hover:opacity-90 cursor-pointer uppercase tracking-tighter"
                        >
                          [ BROWSE SERVER FILESYSTEM ]
                        </button>
                      )}
                    </div>
                    {sources?.directory?.base_host_dir && (
                      <p className="text-[9px] text-muted-foreground font-mono mt-1 opacity-70">
                        Docker host folder path: {sources.directory.base_host_dir}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1.5">Repository URL (SSH or HTTPS)</label>
                    <input
                      type="text"
                      placeholder={selectedSource === "github" ? "git@github.com:owner/repo.git" : "git@gitlab.com:group/repo.git"}
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="w-full bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none"
                      required
                    />
                    <p className="text-[9px] text-muted-foreground font-mono mt-1 opacity-70">
                      Savant downloads and authenticates the repository on the server.
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2 text-xs bg-[var(--cp-bg-2)] hover:bg-[var(--cp-bg-3)] text-foreground font-bold border border-[var(--cp-border)] cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold hover:opacity-90 cursor-pointer"
                  disabled={isSubmittingAdd || !sources || !Object.values(sources).some((cfg: any) => cfg?.enabled)}
                >
                  {isSubmittingAdd ? "PREPARING..." : "REGISTER PROJECT"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FileBrowserModal
        isOpen={isFileBrowserOpen}
        onClose={() => setIsFileBrowserOpen(false)}
        onSelect={(path) => setDirPath(path)}
        initialPath={dirPath}
        basePath=""
        serverUrl={serverUrl}
        apiKey={apiKey}
      />
    </div>
  );
}
