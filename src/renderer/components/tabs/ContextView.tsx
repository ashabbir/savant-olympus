import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Folder, RefreshCw, Download, Trash2, Cpu, FileCode, CheckCircle, Database, AlertTriangle, Layers, Play, Square, Trash, Zap, Clock, Upload, ChevronDown, ChevronLeft, ChevronRight, GitBranch } from "lucide-react";
import { ContextVisualizations, analyzeProjectSource } from "./ContextVisualizations";
import { GraphifyVisualizer } from "./GraphifyVisualizer";
import { FileBrowserModal } from "../FileBrowserModal";
import { toast } from "sonner";
import { createContextService } from "@/services/contextService";

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
  memory_bank_count?: number;
  chunk_count?: number;
  ast_node_count?: number;
  indexed_at?: string;
  last_fetched_at?: string;
  created_at?: string;
  languages?: Record<string, number>;
  provider?: string;
  freshness?: string;
  graph_version?: string;
  code_intelligence?: StructuralHealth;
  branch?: string;
  last_job?: any;
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

export const sortSyncLogsNewestFirst = (logs: any[]) =>
  [...logs].sort((a, b) => {
    const timeDifference = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return timeDifference || Number(b.id || 0) - Number(a.id || 0);
  });

export const parseFileStats = (details: string) => {
  if (!details) return null;
  const match = details.match(/indexed=(\d+),\s*skipped=(\d+),\s*removed=(\d+)/);
  if (!match) return null;
  const indexed = parseInt(match[1], 10);
  const skipped = parseInt(match[2], 10);
  const removed = parseInt(match[3], 10);
  return {
    indexed,
    skipped,
    removed,
    total: indexed + skipped,
  };
};

export const formatSyncLogDateTime = (timestamp: string) =>
  new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [lastFetchDetails, setLastFetchDetails] = useState<Record<string, any>>({});

  const toggleFilter = useCallback((filter: string) => {
    setActiveFilters((prev) => {
      let next = [...prev];
      if (next.includes(filter)) {
        next = next.filter((f) => f !== filter);
      } else {
        if (filter === "indexed") {
          next = next.filter((f) => f !== "not_indexed");
        } else if (filter === "not_indexed") {
          next = next.filter((f) => f !== "indexed");
        }
        next.push(filter);
      }
      return next;
    });
  }, []);

  const matchesFilter = useCallback((repo: Repo, filter: string) => {
    const status = indexingStatus[repo.name] || {};
    const activeStatus = (status.status || repo.status || "ready").toLowerCase();
    const isIndexed = !!repo.indexed_at || ["indexed", "done"].includes(activeStatus);
    const isAnalyzed = !!(
      repo.code_intelligence?.indexed ||
      repo.graph_version ||
      (repo.freshness && repo.freshness !== "unavailable") ||
      (repo.code_intelligence?.freshness && repo.code_intelligence?.freshness !== "unavailable")
    );

    switch (filter) {
      case "indexed":
        return isIndexed;
      case "not_indexed":
        return !isIndexed;
      case "analyzed":
        return isAnalyzed;
      case "added":
        return (!isIndexed && !isAnalyzed) || activeStatus === "added";
      default:
        return true;
    }
  }, [indexingStatus]);
  const [structuralHealth, setStructuralHealth] = useState<StructuralHealth | null>(null);
  const [isLoadingStructuralHealth, setIsLoadingStructuralHealth] = useState(false);
  const [periodicStatus, setPeriodicStatus] = useState<any>(null);
  const [periodicLogs, setPeriodicLogs] = useState<any[]>([]);
  const [isLoadingSyncLogs, setIsLoadingSyncLogs] = useState(false);
  const [syncingProjects, setSyncingProjects] = useState<Record<string, boolean>>({});
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);
  const [isSyncHistoryCollapsed, setIsSyncHistoryCollapsed] = useState(false);

  const contextService = React.useMemo(() => createContextService(serverUrl, apiKey), [serverUrl, apiKey]);

  const [jobsSummary, setJobsSummary] = useState<any>(null);

  const fetchJobsSummary = useCallback(async () => {
    try {
      const data = await contextService.listJobs();
      if (data && data.summary) {
        setJobsSummary(data.summary);
      }
    } catch (e) {
      console.error("Failed to fetch jobs summary:", e);
    }
  }, [contextService]);

  const fetchPeriodicSyncData = useCallback(async () => {
    setIsLoadingSyncLogs(true);
    try {
      const [statusRes, logsRes] = await Promise.all([
        contextService.getPeriodicSyncStatus().catch(() => null),
        contextService.getPeriodicSyncLogs(selectedProject || undefined, 10).catch(() => ({ logs: [] })),
      ]);
      if (statusRes) setPeriodicStatus(statusRes);
      if (logsRes?.logs) setPeriodicLogs(sortSyncLogsNewestFirst(logsRes.logs));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingSyncLogs(false);
    }
  }, [contextService, selectedProject]);

  useEffect(() => {
    fetchPeriodicSyncData();
    const interval = setInterval(fetchPeriodicSyncData, 15000);
    return () => clearInterval(interval);
  }, [fetchPeriodicSyncData]);

  const handleManualPeriodicSyncRun = async () => {
    if (!selectedRepo) return;
    const repoName = selectedRepo.name;
    setSyncingProjects((prev) => ({ ...prev, [repoName]: true }));
    toast.info(`Triggering background sync pass for "${repoName}"...`);
    try {
      const res = await contextService.triggerPeriodicSyncProject(repoName);
      toast.success(`Periodic sync completed for "${repoName}"!`);
      await fetchPeriodicSyncData();
      await fetchRepos();
    } catch (e: any) {
      toast.error(`Periodic sync failed: ${e.message}`);
    } finally {
      setSyncingProjects((prev) => ({ ...prev, [repoName]: false }));
    }
  };

  const fetchRepos = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      setRepos(await contextService.listRepositories());
    } catch (e: any) {
      console.error(e);
      setRepos([]);
      setLoadError(e.message || "Unable to reach Savant server for projects.");
    } finally {
      setIsLoading(false);
    }
  }, [contextService]);

  const fetchIndexingStatus = useCallback(async () => {
    try {
        const nextStatus = await contextService.getIndexingStatus();
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
    } catch (e) {
      console.error(e);
    }
  }, [contextService, fetchRepos]);

  useEffect(() => {
    fetchRepos();
    fetchIndexingStatus();
    fetchJobsSummary();
    const interval = setInterval(() => {
      fetchIndexingStatus();
      fetchJobsSummary();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRepos, fetchIndexingStatus, fetchJobsSummary]);

  const [astNodes, setAstNodes] = useState<any[]>([]);
  const [analysisResults, setAnalysisResults] = useState<any | null>(null);
  const [detailsTab, setDetailsTab] = useState<"overview" | "visuals" | "graphify" | "activity">("overview");

  const [graphifyJson, setGraphifyJson] = useState<any | null>(null);
  const [graphifyStats, setGraphifyStats] = useState<any | null>(null);
  const [isUploadingGraphify, setIsUploadingGraphify] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [graphVersion, setGraphVersion] = useState(0);

  const repoIdentity = (repo: Repo) => String(repo.repo_id ?? repo.id ?? repo.name);

  const fetchGraphifyStats = async (repo: Repo) => {
    try {
        const data = await contextService.getGraphifyStats(repoIdentity(repo), repo.name);
        setGraphifyStats(data);
        if ((!data || data.total === 0) && detailsTab === "graphify") {
          setDetailsTab("overview");
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
      setStructuralHealth(await contextService.getStructuralHealth(repoIdentity(repo)));
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
  }, [contextService]);

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

      const data = await contextService.importGraphify(repoIdentity(selectedRepo), selectedRepo.name, graphData);
      setUploadSuccess(`Successfully uploaded Graphify KG! Imported ${data.nodes_imported} nodes and ${data.edges_imported} edges.`);
      fetchGraphifyStats(selectedRepo);
      setGraphVersion((prev) => prev + 1);
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

        const data = await contextService.importGraphify(repoIdentity(selectedRepo), selectedRepo.name, graphJson, metaJson);
        setUploadSuccess(`Successfully uploaded Graphify KG! Imported ${data.nodes_imported} nodes and ${data.edges_imported} edges.`);
        fetchGraphifyStats(selectedRepo);
        setGraphVersion((prev) => prev + 1);
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
  }, [selectedRepo?.path, selectedRepo?.name, selectedRepo?.id, selectedRepo?.repo_id, contextService, fetchStructuralHealth]);

  const fetchAstAndAnalyze = useCallback(async (projectName: string, repoOverride?: Repo) => {
    try {
      const repo = repoOverride || repos.find((item) => item.name === projectName);
      const identity = repo ? repoIdentity(repo) : projectName;
      const nodes = await contextService.listAst(identity, projectName);
      setAstNodes(nodes);

      const targetPaths = Array.from(new Set(nodes.map((n: any) => n.path).filter(Boolean))).slice(0, 100);
      const docs: any[] = [];
      await Promise.all(
        targetPaths.map(async (relPath: any) => {
          try {
            const uri = `${projectName}:${relPath}`;
            const doc = await contextService.readCode(uri);
            docs.push({ path: relPath, language: doc.language || "", content: doc.content || "" });
          } catch (err) {}
        })
      );

      const analysis = analyzeProjectSource(nodes, docs);
      setAnalysisResults(analysis);
    } catch (e) {
      console.error("Heuristics failed:", e);
      setAnalysisResults(null);
    }
  }, [contextService, repos]);

  const lastSelectedRepoNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedRepo) {
      if (lastSelectedRepoNameRef.current !== selectedRepo.name) {
        setAstNodes([]);
        setAnalysisResults(null);
        setDetailsTab("overview");
        lastSelectedRepoNameRef.current = selectedRepo.name;
        fetchAstAndAnalyze(selectedRepo.name, selectedRepo);
      }
    } else {
      lastSelectedRepoNameRef.current = null;
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
  const [addProgressStage, setAddProgressStage] = useState("PREPARING...");

  useEffect(() => {
    if (!isSubmittingAdd) return;

    const stages = selectedSource === "directory"
      ? ["VALIDATING DIRECTORY...", "REGISTERING PROJECT..."]
      : ["CHECKING ACCESS...", "DOWNLOADING REPOSITORY...", "REGISTERING PROJECT..."];
    setAddProgressStage(stages[0]);
    const timers = stages.slice(1).map((stage, index) =>
      window.setTimeout(() => setAddProgressStage(stage), (index + 1) * 1200),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [isSubmittingAdd, selectedSource]);

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
      const data: any = await contextService.getRepositorySources();
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
      const registered = await contextService.addRepository(payload);
      setIsAddModalOpen(false);
      if (registered?.name) {
        setRepos((current) => current.some((repo) => repo.name === registered.name)
          ? current
          : [...current, registered]);
        setIndexingStatus((current) => ({
          ...current,
          [registered.name]: {
            status: "queued", job_id: registered.job_id,
            job_type: registered.job_type, phase: "Downloading repository",
            progress: 0, current_file: "Waiting for background worker",
          },
        }));
      }
      fetchRepos();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Poll for job completion and fire toast
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollForJobCompletion = useCallback((repoName: string, jobLabel: string, jobType: "index" | "graph" = "index") => {
    // Clear any existing poll
    if (jobPollRef.current) clearInterval(jobPollRef.current);

    let missingGraphPolls = 0;
    jobPollRef.current = setInterval(async () => {
      try {
        const nextStatus = await contextService.getIndexingStatus();
        const status = nextStatus[repoName] || {};
        const trackedJob = jobType === "graph" ? status.structural_job : status;
        if (jobType === "graph" && !trackedJob) {
          missingGraphPolls += 1;
          if (missingGraphPolls < 2) return;
        } else {
          missingGraphPolls = 0;
        }
        const activeStatus = trackedJob?.status || "idle";
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
            const repo = repos.find((item) => item.name === repoName);
            if (repo) {
              fetchStructuralHealth(repo);
              fetchGraphifyStats(repo);
            }
          }
        }
      } catch (e) {
        // Silently continue polling
      }
    }, 3000);
  }, [contextService, selectedProject, fetchAstAndAnalyze, fetchRepos, fetchStructuralHealth, repos]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (jobPollRef.current) clearInterval(jobPollRef.current);
    };
  }, []);

  const handleRefreshRepo = async (repoName: string) => {
    setRefreshingRepo(repoName);
    try {
      const res = await contextService.refreshRepository(repoName);
      
      const branchName = res?.branch || res?.current_branch || res?.ref;
      const prevCommit = res?.previous_commit || res?.prev_commit || res?.before || res?.old_commit;
      const newCommit = res?.new_commit || res?.current_commit || res?.after || res?.commit;
      const filesChanged = res?.files_changed !== undefined ? res?.files_changed : (res?.changed_files !== undefined ? res?.changed_files : (res?.stats?.files_changed || res?.stats?.changed_files));

      const hasGitInfo = branchName || prevCommit || newCommit || filesChanged !== undefined;

      const prevCommitShort = typeof prevCommit === "string" ? prevCommit.slice(0, 7) : prevCommit || "N/A";
      const newCommitShort = typeof newCommit === "string" ? newCommit.slice(0, 7) : newCommit || "N/A";

      // Save fetch details to state for visualization
      setLastFetchDetails((prev) => ({
        ...prev,
        [repoName]: {
          branch: branchName,
          previous_commit: prevCommit,
          new_commit: newCommit,
          files_changed: filesChanged
        }
      }));

      toast.success(`Latest code pulled for "${repoName}"`, {
        description: hasGitInfo ? (
          <div className="mt-1 font-mono text-[10px] space-y-0.5 text-muted-foreground border-t border-[rgba(255,255,255,0.05)] pt-1.5">
            <div>BRANCH: <span className="text-[var(--cp-cyan)] font-bold">{branchName || "unknown"}</span></div>
            <div>COMMITS: <span className="text-foreground">{prevCommitShort}</span> → <span className="text-[var(--cp-green)] font-bold">{newCommitShort}</span></div>
            <div>CHANGED FILES: <span className="text-[var(--cp-yellow)] font-bold">{filesChanged !== undefined ? filesChanged : 0}</span></div>
          </div>
        ) : (
          "The checkout is now up to date. Queue indexing when you want to refresh Context data."
        ),
        duration: 8000,
      });
      fetchRepos();
      fetchPeriodicSyncData();
    } catch (e: any) {
      toast.error(`Failed to refresh "${repoName}"`, { description: e.message });
    } finally {
      setRefreshingRepo(null);
    }
  };

  const handleStartIndexing = async (repoName: string) => {
    try {
      await contextService.startIndexing(repoName);
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
      const queued = await contextService.syncCodeGraph(repoIdentity(repo));
      setStructuralHealth((current) => ({
        ...(current || {}),
        freshness: "pending_sync",
        current_job: {
          id: queued?.job_id,
          job_type: "codegraph_sync",
          status: "queued",
          progress: 0,
          phase: "Queued",
          message: "Waiting for the graph worker",
        },
      }));
      toast.info(`Code graph sync queued for "${repo.name}"`, {
        description: "You will be notified when the job completes.",
        duration: 4000,
      });
      fetchIndexingStatus();
      pollForJobCompletion(repo.name, "Graph generation", "graph");
    } catch (e: any) {
      toast.error("Failed to queue code graph sync", { description: e.message });
    }
  };

  const handleStopIndexing = async (repoName: string) => {
    try {
      await contextService.stopIndexing(repoName);
      fetchIndexingStatus();
      setTimeout(fetchRepos, 1000);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCancelJob = async (jobId: string, label: "Index" | "Graph") => {
    try {
      const result = await contextService.cancelJob(jobId);
      if (!result.cancelled) {
        throw new Error("The job has already finished or no longer exists.");
      }
      toast.info(`${label} job stop requested`);
      await fetchIndexingStatus();
      if (label === "Graph" && selectedRepo) {
        await fetchStructuralHealth(selectedRepo);
      }
    } catch (e: any) {
      toast.error(`Failed to stop ${label.toLowerCase()} job`, { description: e.message });
    }
  };

  const handlePurgeRepo = async (repoName: string) => {
    if (!confirm(`Purge all indexed data for "${repoName}"? The project will be kept but all vectors and chunks will be removed.`)) return;
    try {
      await contextService.purgeRepository(repoName);
      fetchRepos();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteRepo = async (repoName: string) => {
    if (!confirm(`Delete project "${repoName}" and all its indexed data?`)) return;
    try {
      await contextService.deleteRepository(repoName);
      if (selectedProject === repoName) onSelectProject(null);
      fetchRepos();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const statusInfo = selectedProject ? indexingStatus[selectedProject] || {} : {};
  const liveStatus = (statusInfo.status || selectedRepo?.status || "ready").toLowerCase();
  const isCurrentlyIndexing = ["indexing", "running", "queued", "processing", "cancelling"].includes(liveStatus);
  const structuralJob = statusInfo.structural_job || structuralHealth?.current_job;
  const structuralJobStatus = String(structuralJob?.status || "").toLowerCase();
  const isStructuralJobActive = ["indexing", "running", "queued", "processing", "cancelling"].includes(structuralJobStatus);
  const hasStructuralJobResult = ["done", "failed", "cancelled"].includes(structuralJobStatus);
  const structuralProvider = structuralHealth?.provider || selectedRepo?.provider || selectedRepo?.code_intelligence?.provider || "legacy";
  const structuralFreshness = structuralHealth?.freshness || selectedRepo?.freshness || selectedRepo?.code_intelligence?.freshness || "unavailable";
  const semanticDisplayStatus = ["indexed", "done", "ready"].includes(liveStatus) ? "done" : liveStatus;
  const structuralDisplayStatus = isStructuralJobActive
    ? structuralJobStatus
    : structuralFreshness === "fresh" || structuralJobStatus === "done"
      ? "done"
      : structuralFreshness;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredRepos = repos.filter((repo) => {
    if (normalizedSearchQuery) {
      const matchText = JSON.stringify({ ...repo, live_status: indexingStatus[repo.name] || {} }).toLowerCase().includes(normalizedSearchQuery);
      if (!matchText) return false;
    }
    for (const filter of activeFilters) {
      if (!matchesFilter(repo, filter)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <div className="flex items-center justify-between border-b border-[var(--cp-border)] pb-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--section-label)] tracking-wider" style={{ fontFamily: "'Orbitron', sans-serif" }}>
            CONTEXT ENGINE
          </h2>
          <p className="text-xs text-muted-foreground opacity-60">Manage indexed code repositories & projects</p>
        </div>

        {jobsSummary && (jobsSummary.queued_total > 0 || jobsSummary.indexing_total > 0 || jobsSummary.analysis_total > 0) && (
          <div className="flex items-center gap-3 bg-[var(--cp-bg-1)] border border-[var(--cp-border)] px-3 py-1.5 rounded font-mono text-[11px]">
            <div className="text-[var(--section-label)] uppercase text-[9px] tracking-wider border-r border-[var(--cp-border)] pr-2.5 mr-0.5" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              Job Queue
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cp-cyan)] font-bold">{jobsSummary.queued_total}</span>
              <span className="text-muted-foreground text-[10px]">queued</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-500 font-bold">{jobsSummary.indexing_running}</span>
              <span className="text-muted-foreground text-[10px]">indexing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-purple-400 font-bold">{jobsSummary.analysis_running}</span>
              <span className="text-muted-foreground text-[10px]">analyzing</span>
            </div>
            {jobsSummary.active_jobs && jobsSummary.active_jobs.length > 0 && (
              <div className="flex items-center gap-1.5 border-l border-[var(--cp-border)] pl-2.5 ml-0.5 text-muted-foreground">
                <span className="animate-pulse inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                <span className="text-[10px] truncate max-w-[150px]" title={jobsSummary.active_jobs[0].message || jobsSummary.active_jobs[0].phase}>
                  Processing: {jobsSummary.active_jobs[0].target} ({jobsSummary.active_jobs[0].progress}%)
                </span>
              </div>
            )}
          </div>
        )}
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

              <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider pt-2 pb-1" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                Registered Projects
              </h3>
              <div className="flex flex-wrap gap-1 font-mono text-[9px] pb-2 border-b border-[rgba(255,255,255,0.03)] mb-1">
                <button
                  type="button"
                  onClick={() => setActiveFilters([])}
                  className={`px-2 py-0.5 border transition-all cursor-pointer ${
                    activeFilters.length === 0
                      ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)] font-bold"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground bg-[var(--cp-bg-2)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  ALL
                </button>
                <button
                  type="button"
                  onClick={() => toggleFilter("indexed")}
                  className={`px-2 py-0.5 border transition-all cursor-pointer ${
                    activeFilters.includes("indexed")
                      ? "border-[var(--cp-green)] text-[var(--cp-green)] bg-[rgba(0,255,136,0.06)] font-bold"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground bg-[var(--cp-bg-2)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  INDEXED
                </button>
                <button
                  type="button"
                  onClick={() => toggleFilter("not_indexed")}
                  className={`px-2 py-0.5 border transition-all cursor-pointer ${
                    activeFilters.includes("not_indexed")
                      ? "border-[var(--cp-magenta)] text-[var(--cp-magenta)] bg-[rgba(255,0,229,0.06)] font-bold"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground bg-[var(--cp-bg-2)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  NOT INDEXED
                </button>
                <button
                  type="button"
                  onClick={() => toggleFilter("analyzed")}
                  className={`px-2 py-0.5 border transition-all cursor-pointer ${
                    activeFilters.includes("analyzed")
                      ? "border-[var(--cp-green)] text-[var(--cp-green)] bg-[rgba(0,255,136,0.06)] font-bold"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground bg-[var(--cp-bg-2)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  ANALYZED
                </button>
                <button
                  type="button"
                  onClick={() => toggleFilter("added")}
                  className={`px-2 py-0.5 border transition-all cursor-pointer ${
                    activeFilters.includes("added")
                      ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)] font-bold"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground bg-[var(--cp-bg-2)] hover:border-[rgba(255,255,255,0.15)]"
                  }`}
                >
                  ADDED
                </button>
              </div>
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
                const graphJobStatus = String(status.structural_job?.status || "").toLowerCase();
                const graphIsBusy = ["indexing", "running", "queued", "processing"].includes(graphJobStatus);
                const activeStatus = graphIsBusy ? `graph ${graphJobStatus}` : (status.status || repo.status || "ready").toLowerCase();
                const isFailed = activeStatus === "error" || activeStatus === "failed" || activeStatus === "stalled";
                const isBusy = graphIsBusy || activeStatus === "indexing" || activeStatus === "running" || activeStatus === "queued" || activeStatus === "processing";

                const isGit = repo.source === "github" || repo.source === "gitlab" || repo.source === "git";
                const isIndexed = !!repo.indexed_at || ["indexed", "done"].includes(activeStatus);
                const isAnalyzed = !!(
                  repo.code_intelligence?.indexed ||
                  repo.graph_version ||
                  (repo.freshness && repo.freshness !== "unavailable") ||
                  (repo.code_intelligence?.freshness && repo.code_intelligence?.freshness !== "unavailable")
                );

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
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono mt-2 pt-1.5 border-t border-[rgba(255,255,255,0.03)]">
                      <div className="flex items-center gap-2">
                        {/* Git or Local */}
                        <span className="flex items-center gap-0.5" title={isGit ? "Git Repository" : "Local Directory"}>
                          {isGit ? (
                            <GitBranch size={10} className="text-[var(--cp-cyan)]" />
                          ) : (
                            <Folder size={10} className="text-[var(--cp-yellow)]" />
                          )}
                          {isGit && lastFetchDetails[repo.name] && (
                            <span className="text-[8px] text-[var(--cp-cyan)] font-bold ml-0.5">({lastFetchDetails[repo.name].branch})</span>
                          )}
                        </span>

                        {/* Indexed Status */}
                        <span className="flex items-center gap-0.5" title={isIndexed ? "Indexed" : "Not Indexed"}>
                          <Database size={10} className={isIndexed ? "text-[var(--cp-green)]" : "text-[var(--cp-magenta)]"} />
                          <span className={`text-[8px] font-bold ${isIndexed ? "text-[var(--cp-green)]" : "text-[var(--cp-magenta)]"}`}>IDX</span>
                        </span>

                        {/* Analyzed Status */}
                        <span className="flex items-center gap-0.5" title={isAnalyzed ? "Analyzed" : "Not Analyzed"}>
                          <Cpu size={10} className={isAnalyzed ? "text-[var(--cp-green)]" : "text-[var(--cp-magenta)]"} />
                          <span className={`text-[8px] font-bold ${isAnalyzed ? "text-[var(--cp-green)]" : "text-[var(--cp-magenta)]"}`}>ANA</span>
                        </span>
                      </div>

                      <div className="text-[9px] text-muted-foreground font-mono">
                        {isBusy ? (
                          <span className="text-amber-500 animate-pulse flex items-center gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-amber-500 animate-ping" />
                            {activeStatus.toUpperCase().replace("INDEXING", "IDX").replace("PROCESSING", "PROC")}
                            {(graphIsBusy ? status.structural_job?.progress : status.progress) != null && (
                              <span>({Math.round(graphIsBusy ? status.structural_job.progress : status.progress)}%)</span>
                            )}
                          </span>
                        ) : isFailed ? (
                          <span className="text-red-500 font-bold">FAIL</span>
                        ) : (
                          <span className="opacity-40">READY</span>
                        )}
                      </div>
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
            <div className={`flex flex-col h-full space-y-4 pr-1 ${detailsTab === "overview" || detailsTab === "activity" ? "overflow-y-auto" : "overflow-hidden"}`}>
              {/* Header */}
              <div className="border-b border-[var(--cp-border)] pb-3 flex justify-between items-start">
                <div>
                  <h3 className="text-md font-bold text-foreground flex flex-wrap items-center gap-2">
                    {selectedRepo.name}
                    <span className={`px-2 py-0.5 text-[9px] uppercase font-mono border rounded ${
                      semanticDisplayStatus.includes("running") || semanticDisplayStatus.includes("processing") || semanticDisplayStatus === "indexing" ? "border-amber-500 text-amber-500 bg-amber-950/20" :
                      semanticDisplayStatus.includes("queued") ? "border-blue-500 text-blue-500 bg-blue-950/20" :
                      semanticDisplayStatus.includes("failed") || semanticDisplayStatus.includes("cancelled") || semanticDisplayStatus === "error" ? "border-red-500 text-red-500 bg-red-950/20" :
                      "border-green-500 text-green-500 bg-green-950/20"
                    }`}>
                      SEMANTIC: {semanticDisplayStatus.toUpperCase()}
                    </span>
                    <span className={`px-2 py-0.5 text-[9px] uppercase font-mono border rounded ${
                      ["running", "processing", "pending_sync"].includes(structuralDisplayStatus) ? "border-amber-500 text-amber-500 bg-amber-950/20" :
                      structuralDisplayStatus === "queued" ? "border-blue-500 text-blue-500 bg-blue-950/20" :
                      ["failed", "cancelled", "degraded", "unavailable", "stale"].includes(structuralDisplayStatus) ? "border-red-500 text-red-500 bg-red-950/20" :
                      "border-green-500 text-green-500 bg-green-950/20"
                    }`}>
                      STRUCTURAL: {structuralDisplayStatus.toUpperCase()}
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
                <button
                  onClick={() => setDetailsTab("activity")}
                  className={`px-3 py-1 text-xs uppercase border ${
                    detailsTab === "activity"
                      ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                      : "border-[var(--cp-border)] text-muted-foreground hover:text-foreground"
                  } cursor-pointer`}
                  data-testid="activity-tab-button"
                >
                  Activity & History
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
                      <FileCode size={12} /> {isStructuralJobActive ? "GENERATING GRAPH..." : "GENERATE GRAPH"}
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
                          {statusInfo.job_type === "initial_repo_sync"
                            ? "Repository Setup In Progress"
                            : statusInfo.job_type === "ast" ? "AST Generation In Progress" : "Indexing In Progress"}
                        </span>
                        <span className="text-amber-400">{Math.round(statusInfo.progress || 0)}%</span>
                      </div>
                      {statusInfo.job_id && (
                        <button
                          type="button"
                          onClick={() => handleCancelJob(statusInfo.job_id, "Index")}
                          disabled={liveStatus === "cancelling"}
                          className="inline-flex items-center gap-1 rounded border border-red-700/70 px-2 py-1 text-[10px] font-bold uppercase text-red-300 hover:bg-red-950/40 disabled:cursor-wait disabled:opacity-60"
                          aria-label={`Stop index job for ${selectedProject}`}
                        >
                          <Square className="h-3 w-3 fill-current" />
                          {liveStatus === "cancelling" ? "Stopping Index" : "Stop Index"}
                        </button>
                      )}
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

                  {(isStructuralJobActive || hasStructuralJobResult) && (
                    <div className={`bg-[var(--cp-bg-2)] border p-3 space-y-2 rounded ${structuralJobStatus === "done" ? "border-green-700/60" : structuralJobStatus === "failed" || structuralJobStatus === "cancelled" ? "border-red-700/60" : "border-indigo-700/60"}`} data-testid="graph-generation-progress">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className={`font-bold uppercase ${structuralJobStatus === "done" ? "text-green-400" : structuralJobStatus === "failed" || structuralJobStatus === "cancelled" ? "text-red-400" : "text-indigo-300"}`}>
                          Graph Generation {structuralJobStatus === "queued" ? "Queued" : structuralJobStatus === "done" ? "Completed" : structuralJobStatus === "failed" ? "Failed" : structuralJobStatus === "cancelled" ? "Cancelled" : "In Progress"}
                        </span>
                        <span className="text-indigo-300">{Math.round(structuralJob?.progress || 0)}%</span>
                      </div>
                      {isStructuralJobActive && structuralJob?.id && (
                        <button
                          type="button"
                          onClick={() => handleCancelJob(structuralJob.id, "Graph")}
                          disabled={structuralJobStatus === "cancelling"}
                          className="inline-flex items-center gap-1 rounded border border-red-700/70 px-2 py-1 text-[10px] font-bold uppercase text-red-300 hover:bg-red-950/40 disabled:cursor-wait disabled:opacity-60"
                          aria-label={`Stop graph job for ${selectedProject}`}
                        >
                          <Square className="h-3 w-3 fill-current" />
                          {structuralJobStatus === "cancelling" ? "Stopping Graph" : "Stop Graph"}
                        </button>
                      )}
                      <div className="w-full bg-[var(--cp-bg-3)] h-1.5 rounded overflow-hidden">
                        <div className="bg-indigo-400 h-full transition-all duration-300" style={{ width: `${structuralJob?.progress || 0}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        PHASE: {structuralJob?.phase || (structuralJobStatus === "queued" ? "Waiting for worker" : structuralJobStatus === "done" ? "Complete" : "Generating structural graph")}
                      </p>
                      {(structuralJob?.message || structuralJob?.error) && <p className={`text-[9px] font-mono truncate ${structuralJobStatus === "failed" ? "text-red-400" : "text-muted-foreground"}`}>{structuralJob?.error || structuralJob?.message}</p>}
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
                        <span className="text-lg font-bold text-foreground">{selectedRepo.memory_bank_count ?? selectedRepo.memory_count ?? 0}</span>
                      </div>
                      <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                        <span className="block text-[10px] font-mono text-muted-foreground uppercase">Index Chunks</span>
                        <span className="text-lg font-bold text-foreground">{selectedRepo.chunk_count ?? 0}</span>
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
                        <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded">
                          <span className="block text-[10px] font-mono text-muted-foreground uppercase">Code Graph Edges</span>
                          <span className="text-lg font-bold text-foreground">{graphifyStats.total_edges ?? 0}</span>
                        </div>
                        <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded" title="Symbols extracted by the semantic indexer; this is separate from the generated CodeGraph node total.">
                          <span className="block text-[10px] font-mono text-muted-foreground uppercase">Indexed Symbols (AST)</span>
                          <span className="text-lg font-bold text-foreground">{selectedRepo.ast_node_count ?? 0}</span>
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
                </>
              ) : detailsTab === "activity" ? (
                <div className="space-y-4 font-mono text-xs" data-testid="periodic-sync-history-panel">
                  {/* Git / Sync Checkout details */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded flex flex-col justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase">Git Branch</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <GitBranch size={14} className="text-[var(--cp-cyan)]" />
                        <span className="text-xs font-bold text-foreground truncate">
                          {lastFetchDetails[selectedRepo.name]?.branch || selectedRepo.branch || "main"}
                        </span>
                      </div>
                    </div>
                    <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded flex flex-col justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase">Last Sync Commit</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Clock size={14} className="text-[var(--cp-green)]" />
                        <span className="text-xs font-bold text-foreground">
                          {(lastFetchDetails[selectedRepo.name]?.new_commit || selectedRepo.last_job?.after_commit || (periodicLogs.length > 0 ? periodicLogs[0].after_commit : null))?.slice(0, 7) || "N/A"}
                        </span>
                      </div>
                    </div>
                    <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded flex flex-col justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase">Remote Origin / Host</span>
                      <div className="flex items-center gap-1 mt-1">
                        <Database size={14} className="text-[var(--cp-yellow)]" />
                        <span className="text-xs font-bold text-foreground truncate" title={selectedRepo.path}>
                          {selectedRepo.source === "directory" ? "Local Directory" : selectedRepo.source === "github" ? "GitHub" : selectedRepo.source === "gitlab" ? "GitLab" : "Unknown"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status info bar */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] bg-[var(--cp-bg-2)] p-3 border border-[var(--cp-border)] rounded">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">Last Sync Run</span>
                      <span className="text-foreground font-medium">
                        {periodicStatus?.last_run_at ? new Date(periodicStatus.last_run_at).toLocaleString() : "Recently on startup"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">Next Scheduled Sync</span>
                      <span className="text-[var(--cp-cyan)] font-medium">
                        {periodicStatus?.next_run_at ? new Date(periodicStatus.next_run_at).toLocaleString() : "Every 6 Hours"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">Last Fetched</span>
                      <span className="text-foreground font-medium">
                        {selectedRepo.last_fetched_at ? new Date(selectedRepo.last_fetched_at).toLocaleString() : "Never"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase">Last Graph Generated</span>
                      <span className="text-foreground font-medium">
                        {graphifyStats?.generated_at ? new Date(graphifyStats.generated_at).toLocaleString() : "Never"}
                      </span>
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cp-border)]/40 pb-3">
                    <span className="font-bold text-[var(--section-label)] uppercase tracking-wider text-[11px]">Sync Controls & Execution Logs</span>
                    <div className="flex items-center gap-2">

                      <button
                        onClick={handleManualPeriodicSyncRun}
                        disabled={!!syncingProjects[selectedRepo.name]}
                        className="flex items-center gap-1.5 px-3 py-1 bg-[var(--cp-cyan)]/10 text-[var(--cp-cyan)] hover:bg-[var(--cp-cyan)]/20 border border-[var(--cp-cyan)]/30 rounded text-[11px] font-bold transition disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingProjects[selectedRepo.name] ? "animate-spin" : ""}`} />
                        {syncingProjects[selectedRepo.name] ? "SYNCING..." : "RUN SYNC PASS"}
                      </button>
                      <button
                        onClick={fetchPeriodicSyncData}
                        disabled={isLoadingSyncLogs}
                        className="p-1 hover:bg-[var(--cp-bg-3)] rounded text-muted-foreground transition border border-[var(--cp-border)]"
                        title="Refresh Logs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSyncLogs ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {/* Interactive Timeline */}
                  <div className="space-y-3">
                    {(() => {
                      const filteredLogs = selectedRepo
                        ? periodicLogs.filter((log: any) => log.repo_name === selectedRepo.name)
                        : periodicLogs;
                      
                      if (filteredLogs.length === 0) {
                        return (
                          <div className="p-8 text-center text-muted-foreground border border-[var(--cp-border)] rounded bg-[var(--cp-bg-2)]">
                            No activity logs recorded yet for this project.
                          </div>
                        );
                      }

                      return (
                        <div className="relative pl-6 border-l border-[var(--cp-border)] ml-3 space-y-4 pt-1">
                          {filteredLogs.map((log: any) => {
                            const stats = parseFileStats(log.details);
                          const isSuccess = log.status === "success";
                          const isSkipped = log.status === "skipped";
                          const statusColor = isSuccess ? "bg-emerald-500" : isSkipped ? "bg-zinc-500" : "bg-red-500";
                          const timeStr = formatSyncLogDateTime(log.created_at);

                          return (
                            <div key={log.id} className="relative group">
                              {/* Circle node on timeline */}
                              <div className={`absolute -left-[31px] top-1.5 w-2 h-2 rounded-full border border-[var(--cp-bg-1)] ${statusColor} group-hover:scale-125 transition-transform`} />

                              <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-3 rounded hover:border-[var(--cp-cyan)]/40 transition">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cp-border)]/30 pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                      isSuccess ? "bg-green-950 text-green-400" : isSkipped ? "bg-zinc-800 text-zinc-400" : "bg-red-950 text-red-400"
                                    }`}>
                                      {log.status.toUpperCase()}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-300 font-mono text-[9px] font-bold border border-indigo-900/40">
                                      {log.repo_name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">{timeStr}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {log.fetched && <span className="text-[8px] px-1 rounded text-blue-400 bg-blue-950/60 border border-blue-900/40">FETCH</span>}
                                    {log.code_changed && <span className="text-[8px] px-1 rounded text-amber-400 bg-amber-950/60 border border-amber-900/40">CHANGED</span>}
                                    {log.indexed && <span className="text-[8px] px-1 rounded text-green-400 bg-green-950/60 border border-green-900/40">INDEX</span>}
                                    {log.graphed && <span className="text-[8px] px-1 rounded text-purple-400 bg-purple-950/60 border border-purple-900/40">GRAPH</span>}
                                  </div>
                                </div>

                                <div className="mt-2 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
                                  <div className="text-foreground text-[11px] leading-relaxed">
                                    {log.details || "No details provided"}
                                    {log.error && <p className="text-red-400 text-[10px] mt-1 bg-red-950/20 border border-red-900/40 p-1.5 rounded">{log.error}</p>}
                                  </div>

                                  {/* Render file stats if available */}
                                  {stats && (
                                    <div className="flex items-center gap-2 text-[10px] font-mono shrink-0" title={`${stats.indexed} files indexed, ${stats.skipped} skipped, ${stats.removed} removed`}>
                                      <span className="text-muted-foreground">Files:</span>
                                      <span className="px-1.5 py-0.5 rounded bg-[var(--cp-bg-3)] border border-[var(--cp-border)] font-bold text-foreground">
                                        {stats.indexed} idx / {stats.total} total
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="mt-2 text-[9px] text-muted-foreground/60 flex items-center justify-between pt-1 border-t border-[var(--cp-border)]/20">
                                  <span>ID: #{log.id} • Trigger: {log.trigger || "system"}</span>
                                  {log.duration_ms && <span>Duration: {log.duration_ms}ms</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  </div>
                </div>
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
                        No project graph is available. Use Generate Graph to build structural data for this repository.
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
                      Savant downloads the repository on the server using configured credentials, with anonymous fallback for public repositories.
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
                  {isSubmittingAdd ? addProgressStage : "REGISTER PROJECT"}
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
