import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { GitFork, Network, Layers, RefreshCw, ZoomIn, ZoomOut, Maximize, Plus, Trash2, Search, ArrowRight, ArrowLeft, Download, Upload, Info, Check, Copy, Box, ChevronDown, ChevronLeft, ChevronRight, History, FileCode2, FileText } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildAthenaPromptSections, fetchAthenaCodeContext, fetchAthenaKnowledgeContext, fetchAthenaMcpTools, formatAthenaContextHits } from "@/lib/athenaContext";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  node_id: string;
  title?: string;
  node_type: string;
  content?: string;
  status?: string;
  created_at?: string;
  metadata?: {
    repo?: string;
    files?: string[] | string;
    workspaces?: string[];
    workspace_id?: string;
    source?: string;
  };
  z?: number;
  vz?: number;
  px?: number;
  py?: number;
  pScale?: number;
  depth?: number;
  connections?: number;
}

interface Edge extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  edge_type?: string;
  edge_id?: string;
  weight?: number;
}

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

const KNOWLEDGE_CHAT_HISTORY_PREFIX = "savant_knowledge_chat_history_";
const KNOWLEDGE_CHAT_THREAD_PREFIX = "savant_knowledge_chat_thread_";

interface AthenaExportEntry {
  sender: ChatMessage["sender"];
  timestamp: string;
  html: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildAthenaExportDocument(title: string, entries: AthenaExportEntry[]) {
  const safeTitle = escapeHtml(title);
  const messages = entries.map((entry) => `
    <article class="message ${entry.sender}">
      <header>
        <strong>${entry.sender === "user" ? "USER" : "ATHENA"}</strong>
        <time>${escapeHtml(new Date(entry.timestamp).toLocaleString())}</time>
      </header>
      <div class="content">${entry.html}</div>
    </article>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #172033; background: #f7f9fc; }
    body { max-width: 900px; margin: 0 auto; padding: 40px; }
    h1 { margin: 0 0 28px; font-size: 24px; }
    .message { margin: 0 0 20px; padding: 18px; border: 1px solid #d8e0ec; border-radius: 10px; background: #fff; break-inside: avoid; }
    .message.user { border-left: 4px solid #00a7b5; }
    .message.assistant { border-left: 4px solid #6957d9; }
    header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; color: #556176; font-size: 11px; letter-spacing: .08em; }
    .content { font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
    .content > :first-child { margin-top: 0; }
    .content > :last-child { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eef3f8; }
    pre { overflow-x: auto; padding: 12px; background: #101827; color: #e5edf7; border-radius: 6px; white-space: pre-wrap; }
    code { font-family: "SFMono-Regular", Consolas, monospace; }
    blockquote { margin-left: 0; padding-left: 14px; border-left: 3px solid #94a3b8; color: #475569; }
    @page { size: A4; margin: 14mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${messages}
</body>
</html>`;
}

function downloadHtmlDocument(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);
  const frameDocument = frame.contentDocument;
  if (!frameDocument || !frame.contentWindow) {
    frame.remove();
    throw new Error("Unable to open the PDF print view.");
  }
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
}

interface KnowledgeChatContextSnapshot {
  version: 1;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  focalsByType: Record<string, string[]>;
  exploreDepth: number;
  isExploreActive: boolean;
  searchQuery: string;
  searchTags: string[];
  filterSearch: string;
  typeFilter: string | null;
  openType: string | null;
  is3DMode: boolean;
}

interface AthenaThread {
  target_id: string;
  title?: string | null;
  context?: KnowledgeChatContextSnapshot | null;
  kind?: string;
  messages: ChatMessage[];
  updated_at: string;
}

export function buildKnowledgeChatContextSnapshot(input: Omit<KnowledgeChatContextSnapshot, "version" | "focalsByType"> & {
  focalsByType: Record<string, Iterable<string>>;
}): KnowledgeChatContextSnapshot {
  return {
    ...input,
    version: 1,
    focalsByType: Object.fromEntries(
      Object.entries(input.focalsByType)
        .map(([nodeType, nodeIds]) => [nodeType, Array.from(nodeIds)] as [string, string[]])
        .filter(([, nodeIds]) => nodeIds.length > 0),
    ),
  };
}

export function restoreKnowledgeFocals(
  snapshot: KnowledgeChatContextSnapshot,
  validNodeIds: Set<string>,
): Record<string, Set<string>> {
  return Object.fromEntries(
    Object.entries(snapshot.focalsByType || {})
      .map(([nodeType, nodeIds]) => [
        nodeType,
        new Set(nodeIds.filter((nodeId) => validNodeIds.has(nodeId))),
      ] as [string, Set<string>])
      .filter(([, nodeIds]) => nodeIds.size > 0),
  );
}

const ATHENA_CHAT_HISTORY_KEY = "savant_athena_chat_history";
const ATHENA_KNOWLEDGE_SCOPE = "knowledge";
const KNOWLEDGE_NODE_TYPES = [
  "domain",
  "concept",
  "service",
  "technology",
  "library",
  "project",
  "repo",
  "client",
  "person",
  "session",
  "issue",
  "insight",
];


interface KnowledgeViewProps {
  serverUrl: string;
  apiKey: string;
  isAdmin?: boolean;
}

export function getKnowledgeNodeRadius(connectionCount: number) {
  const safeConnectionCount = Number.isFinite(connectionCount)
    ? Math.max(0, connectionCount)
    : 0;
  return 7 + Math.log2(safeConnectionCount + 1) * 6;
}

function stripWorkspaceAssociations(value: any): any {
  if (Array.isArray(value)) return value.map(stripWorkspaceAssociations);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "workspace_id" && key !== "workspaces")
      .map(([key, entry]) => [key, stripWorkspaceAssociations(entry)])
  );
}

export function buildKnowledgeExportPayload(
  exportData: Record<string, any>,
  selectedNodeIds: Iterable<string>,
) {
  const nodes = Array.isArray(exportData.nodes) ? exportData.nodes : [];
  const edges = Array.isArray(exportData.edges) ? exportData.edges : [];
  const selectedIds = new Set(selectedNodeIds);
  const exportedNodes = selectedIds.size === 0
    ? nodes
    : nodes.filter((node) => selectedIds.has(node.node_id || node.id));
  const exportedNodeIds = new Set(exportedNodes.map((node) => node.node_id || node.id));
  const exportedEdges = selectedIds.size === 0
    ? edges
    : edges.filter((edge) => exportedNodeIds.has(edge.source_id) && exportedNodeIds.has(edge.target_id));

  return stripWorkspaceAssociations({ nodes: exportedNodes, edges: exportedEdges });
}

export function validateKnowledgeImportPayload(payload: any) {
  if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) {
    throw new Error("Knowledge export must contain nodes and edges arrays.");
  }
  payload.nodes.forEach((node: any, index: number) => {
    const missing = ["node_id", "title", "node_type"].filter(
      (field) => typeof node?.[field] !== "string" || node[field].trim() === ""
    );
    if (missing.length > 0) {
      throw new Error(`Node ${index + 1} is missing required fields: ${missing.join(", ")}.`);
    }
  });
  payload.edges.forEach((edge: any, index: number) => {
    const missing = ["source_id", "target_id", "edge_type"].filter(
      (field) => typeof edge?.[field] !== "string" || edge[field].trim() === ""
    );
    if (missing.length > 0) {
      throw new Error(`Edge ${index + 1} is missing required fields: ${missing.join(", ")}.`);
    }
  });
  return payload;
}

function buildAuthHeaders(apiKey: string, contentType = "application/json") {
  const h: Record<string, string> = { "X-App-Name": "savant-olympus" };
  if (apiKey) h["X-API-Key"] = apiKey;
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

export async function importKnowledgePayload(baseUrl: string, apiKey: string, payload: any) {
  const validatedPayload = validateKnowledgeImportPayload(payload);
  const response = await fetch(`${baseUrl}/api/knowledge/import`, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: JSON.stringify(validatedPayload),
  });
  if (!response.ok) throw new Error("Failed to import knowledge graph.");
  return response;
}

export async function fetchKnowledgeExportData(baseUrl: string, apiKey: string) {
  const headers = buildAuthHeaders(apiKey, "");
  const exportResponse = await fetch(`${baseUrl}/api/knowledge/export`, { headers });
  if (exportResponse.ok) return exportResponse.json();

  const graphResponse = await fetch(
    `${baseUrl}/api/knowledge/graph?slim=false&include_staged=true`,
    { headers },
  );
  if (!graphResponse.ok) {
    throw new Error(`Failed to export knowledge graph (${graphResponse.status}).`);
  }
  return graphResponse.json();
}

export function buildKnowledgeImportDiff(currentNodes: any[], currentEdges: any[], payload: any) {
  const validated = validateKnowledgeImportPayload(payload);
  const currentNodeIds = new Set(currentNodes.map((node) => node.node_id || node.id));
  const currentEdgeIds = new Set(currentEdges.map((edge) => edge.edge_id).filter(Boolean));
  const currentEdgeKeys = new Set(
    currentEdges.map((edge) => `${edge.source_id}:${edge.target_id}:${edge.edge_type || "relates_to"}`)
  );
  const newNodes = validated.nodes.filter((node: any) => !currentNodeIds.has(node.node_id || node.id));
  const newEdges = validated.edges.filter((edge: any) => {
    const edgeKey = `${edge.source_id}:${edge.target_id}:${edge.edge_type || "relates_to"}`;
    return !(edge.edge_id && currentEdgeIds.has(edge.edge_id)) && !currentEdgeKeys.has(edgeKey);
  });

  return {
    newNodes,
    newEdges,
    existingNodeCount: validated.nodes.length - newNodes.length,
    existingEdgeCount: validated.edges.length - newEdges.length,
  };
}

interface KnowledgeGraphIndex {
  nodesById: Map<string, any>;
  adjacency: Record<string, string[]>;
  edgesByNode: Map<string, any[]>;
  nodesByType: Map<string, any[]>;
}

export function buildKnowledgeGraphIndex(nodes: any[], edges: any[]): KnowledgeGraphIndex {
  const nodesById = new Map<string, any>();
  const adjacency: Record<string, string[]> = {};
  const edgesByNode = new Map<string, any[]>();
  const nodesByType = new Map<string, any[]>();

  for (const node of nodes) {
    const nodeId = node.node_id || node.id;
    if (!nodeId) continue;
    nodesById.set(nodeId, node);
    adjacency[nodeId] = [];
    const typeNodes = nodesByType.get(node.node_type) || [];
    typeNodes.push(node);
    nodesByType.set(node.node_type, typeNodes);
  }
  for (const edge of edges) {
    const sourceId = edge.source_id;
    const targetId = edge.target_id;
    if (adjacency[sourceId]) adjacency[sourceId].push(targetId);
    if (adjacency[targetId]) adjacency[targetId].push(sourceId);
    if (nodesById.has(sourceId)) {
      const sourceEdges = edgesByNode.get(sourceId) || [];
      sourceEdges.push(edge);
      edgesByNode.set(sourceId, sourceEdges);
    }
    if (nodesById.has(targetId)) {
      const targetEdges = edgesByNode.get(targetId) || [];
      targetEdges.push(edge);
      edgesByNode.set(targetId, targetEdges);
    }
  }
  return { nodesById, adjacency, edgesByNode, nodesByType };
}

function inferNodeDomainsFromIndex(nodeId: string, index: KnowledgeGraphIndex, maxDepth = 2) {
  const queue: Array<{ id: string; depth: number }> = [{ id: nodeId, depth: 0 }];
  const visited = new Set([nodeId]);
  const domains: Array<{ node: any; distance: number }> = [];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const current = queue[queueIndex];
    const node = index.nodesById.get(current.id);
    if (node?.node_type === "domain") domains.push({ node, distance: current.depth });
    if (current.depth >= maxDepth) continue;
    for (const neighborId of index.adjacency[current.id] || []) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, depth: current.depth + 1 });
    }
  }

  return domains.sort(
    (left, right) =>
      left.distance - right.distance ||
      (left.node.title || left.node.node_id).localeCompare(right.node.title || right.node.node_id)
  );
}

export function inferNodeDomains(nodeId: string, nodes: any[], edges: any[], maxDepth = 2) {
  return inferNodeDomainsFromIndex(nodeId, buildKnowledgeGraphIndex(nodes, edges), maxDepth);
}

function buildFilteredKnowledgeContextFromIndex(
  focalsByType: Record<string, Set<string>>,
  nodes: any[],
  edges: any[],
  depth: number,
  index: KnowledgeGraphIndex,
) {
  const activeBuckets = Object.values(focalsByType).filter((bucket) => bucket.size > 0);
  const selectedCount = activeBuckets.reduce((total, bucket) => total + bucket.size, 0);
  if (selectedCount < 1) return null;

  const reachableFrom = (seeds: Set<string>) => {
    const distances = new Map<string, number>();
    const queue = [...seeds];
    seeds.forEach((nodeId) => distances.set(nodeId, 0));
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const current = queue[queueIndex];
      const currentDepth = distances.get(current)!;
      if (currentDepth >= depth) continue;
      for (const neighborId of index.adjacency[current] || []) {
        if (distances.has(neighborId)) continue;
        distances.set(neighborId, currentDepth + 1);
        queue.push(neighborId);
      }
    }
    return new Set(distances.keys());
  };

  const reachSets = activeBuckets.map(reachableFrom);
  const visibleIds = reachSets.reduce(
    (current, reachable, reachIndex) =>
      reachIndex === 0
        ? new Set(reachable)
        : new Set([...current].filter((nodeId) => reachable.has(nodeId))),
    new Set<string>(),
  );
  const visibleNodes = nodes.filter((node) => visibleIds.has(node.node_id || node.id));
  const visibleEdges = edges.filter(
    (edge) => visibleIds.has(edge.source_id) && visibleIds.has(edge.target_id)
  );
  let hash = 0;
  for (const character of [...visibleIds].sort().join("|")) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return { nodes: visibleNodes, edges: visibleEdges, scopeId: `filtered-context-${Math.abs(hash)}` };
}

export function buildFilteredKnowledgeContext(
  focalsByType: Record<string, Set<string>>,
  nodes: any[],
  edges: any[],
  depth: number,
) {
  return buildFilteredKnowledgeContextFromIndex(
    focalsByType,
    nodes,
    edges,
    depth,
    buildKnowledgeGraphIndex(nodes, edges),
  );
}

export function KnowledgeView({ serverUrl, apiKey, isAdmin = false }: KnowledgeViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zoomInRef = useRef<() => void>(() => {});
  const zoomOutRef = useRef<() => void>(() => {});
  const fitToGraphRef = useRef<(animate?: boolean) => void>(() => {});
  const updatePositionsRef = useRef<(forceHull?: boolean, hullTick?: number, geometryOnly?: boolean) => void>(() => {});
  const graphViewportRef = useRef({
    mode: "2d" as "2d" | "3d",
    scale: 1,
    x: 0,
    y: 0,
    cameraDistance: 400,
    panX: 0,
    panY: 0,
    yaw: 0,
    pitch: 0,
  });
  const hasFittedGraphRef = useRef(false);
  const exploreDepthRef = useRef(2);
  const isExploreActiveRef = useRef(false);
  const focalNodesRef = useRef<Set<string>>(new Set());
  const selectedNodesRef = useRef<Map<string, Node>>(new Map());
  const selectedNodeRef = useRef<Node | null>(null);
  const restoringChatThreadRef = useRef(false);
  const searchQueryRef = useRef("");
  const searchTagsRef = useRef<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const selectedNodeId = selectedNode?.node_id || selectedNode?.id;
  const [is3DMode, setIs3DMode] = useState(false);
  const intelligentFiltering = true;
  const [isLoading, setIsLoading] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [openType, setOpenType] = useState<string | null>(null);
  const [isFilterPaneOpen, setIsFilterPaneOpen] = useState(true);
  // Focal selection per type. Source of truth. `focalNodes` below is the union view.
  const [focalsByType, setFocalsByType] = useState<Record<string, Set<string>>>({});
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const typeFilterRef = useRef<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof buildKnowledgeImportDiff> | null>(null);
  const [importNodes, setImportNodes] = useState(true);
  const [importEdges, setImportEdges] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [editedNodeTitle, setEditedNodeTitle] = useState("");
  const [editedNodeType, setEditedNodeType] = useState("");
  const [editedNodeWorkspace, setEditedNodeWorkspace] = useState("");
  const [bulkWorkspace, setBulkWorkspace] = useState("");
  const [isSavingNodeType, setIsSavingNodeType] = useState(false);
  const [isSavingNodeTitle, setIsSavingNodeTitle] = useState(false);
  const [isSavingNodeWorkspaces, setIsSavingNodeWorkspaces] = useState(false);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<any[]>([]);

  const toggleFilterPane = () => {
    if (!isFilterPaneOpen) setIsInspectorOpen(false);
    setIsFilterPaneOpen(!isFilterPaneOpen);
  };

  const toggleInspector = () => {
    if (!isInspectorOpen) setIsFilterPaneOpen(false);
    setIsInspectorOpen(!isInspectorOpen);
  };

  // Add node form state
  const [newNodeTitle, setNewNodeTitle] = useState("");
  const [newNodeType, setNewNodeType] = useState("concept");
  const [newNodeContent, setNewNodeContent] = useState("");
  const [isSubmittingNode, setIsSubmittingNode] = useState(false);

  // Search, highlight, and explore states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [drawerTab, setDrawerTab] = useState<"info" | "ai">("info");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isThreadBrowserOpen, setIsThreadBrowserOpen] = useState(false);
  const [chatThreads, setChatThreads] = useState<AthenaThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const focalNodes = React.useMemo(() => {
    const s = new Set<string>();
    for (const bucket of Object.values(focalsByType)) for (const id of bucket) s.add(id);
    return s;
  }, [focalsByType]);
  const [exploreDepth, setExploreDepth] = useState(2);
  const [isExploreActive, setIsExploreActive] = useState(false);
  const [rawNodes, setRawNodes] = useState<any[]>([]);
  const [rawEdges, setRawEdges] = useState<any[]>([]);

  // Shared indexes keep render, filtering, selection, and D3 updates linear in graph size.
  const graphIndex = useMemo(() => buildKnowledgeGraphIndex(rawNodes, rawEdges), [rawNodes, rawEdges]);
  const graphIndexRef = useRef(graphIndex);
  graphIndexRef.current = graphIndex;
  const graphLoadIdRef = useRef(0);
  const simulationRef = useRef<d3.Simulation<Node, Edge> | null>(null);
  const sortedNodesByType = useMemo(() => {
    const sorted = new Map<string, any[]>();
    graphIndex.nodesByType.forEach((nodes, nodeType) => {
      sorted.set(nodeType, [...nodes].sort((left, right) =>
        (left.title || left.node_id).localeCompare(right.title || right.node_id)
      ));
    });
    return sorted;
  }, [graphIndex]);
  const nodePositionByType = useMemo(() => {
    const positions = new Map<string, Map<string, number>>();
    sortedNodesByType.forEach((nodes, nodeType) => {
      positions.set(nodeType, new Map(nodes.map((node, index) => [node.node_id || node.id, index])));
    });
    return positions;
  }, [sortedNodesByType]);
  const adjRef = useRef<Record<string, string[]>>({});
  const searchMatchesRef = useRef<Set<string>>(new Set());
  const intelligentFilteringRef = useRef(true);
  const distMapCacheRef = useRef<{ config: string; distMap: Map<string, number> | null }>({ config: "", distMap: null });
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(
    () => normalizedSearchQuery.length >= 4
      ? rawNodes.filter((node) => (node.title || "").toLowerCase().includes(normalizedSearchQuery))
      : [],
    [normalizedSearchQuery, rawNodes],
  );

  useEffect(() => {
    adjRef.current = graphIndex.adjacency;
    distMapCacheRef.current = { config: "", distMap: null };
  }, [graphIndex]);

  useEffect(() => {
    const matches = new Set<string>();
    if (normalizedSearchQuery) {
      for (const node of rawNodes) {
        if ((node.title || "").toLowerCase().includes(normalizedSearchQuery) ||
            (node.node_id || "").toLowerCase().includes(normalizedSearchQuery)) {
          matches.add(node.node_id);
        }
      }
    }
    searchMatchesRef.current = matches;
  }, [normalizedSearchQuery, rawNodes]);

  const readSharedAthenaHistory = () => {
    try {
      const stored = localStorage.getItem(ATHENA_CHAT_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };
  const writeSharedAthenaHistory = (messages: any[]) => {
    localStorage.setItem(ATHENA_CHAT_HISTORY_KEY, JSON.stringify(messages));
  };
  const formatAthenaHistory = (messages: any[]) =>
    messages.length > 0
      ? messages.map(msg => `[${msg.scope || "general"}] ${msg.sender.toUpperCase()}: ${msg.text}`).join("\n")
      : "No previous messages in this conversation.";
  const handleCopyMessage = (text: string) => navigator.clipboard.writeText(text);
  const exportAthenaMessages = async (
    format: "html" | "pdf",
    messages: ChatMessage[],
    messageIndexes: number[],
    exportTitle: string,
  ) => {
    const entries = messages.map((message, position) => {
      const messageIndex = messageIndexes[position];
      const content = document.querySelector<HTMLElement>(
        `[data-athena-message-index="${messageIndex}"] [data-athena-export-content]`,
      );
      if (!content) throw new Error("ATHENA message content is not available for export.");
      return {
        sender: message.sender,
        timestamp: message.timestamp,
        html: content.innerHTML,
      };
    });
    const safeFilename = exportTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "athena-chat";
    const exportHtml = buildAthenaExportDocument(exportTitle, entries);
    const exportRequest = {
      format,
      html: exportHtml,
      defaultFilename: `${safeFilename}.${format}`,
    };
    try {
      if (typeof window.system.exportDocument === "function") {
        await window.system.exportDocument(exportRequest);
      } else {
        await window.ipcRenderer.invoke("export-document", exportRequest);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("No handler registered for 'export-document'")) throw error;
      if (format === "html") {
        downloadHtmlDocument(exportHtml, exportRequest.defaultFilename);
      } else {
        printHtmlDocument(exportHtml);
      }
    }
  };
  const handleExportMessage = async (format: "html" | "pdf", message: ChatMessage, index: number) => {
    try {
      await exportAthenaMessages(format, [message], [index], `${currentChatTitle} - ${message.sender === "user" ? "User" : "ATHENA"} message`);
    } catch (error) {
      console.error("Failed to export ATHENA message:", error);
      alert(error instanceof Error ? error.message : "Failed to export ATHENA message.");
    }
  };
  const handleExportConversation = async (format: "html" | "pdf") => {
    try {
      await exportAthenaMessages(
        format,
        chatMessages,
        chatMessages.map((_, index) => index),
        `${currentChatTitle} - ATHENA conversation`,
      );
    } catch (error) {
      console.error("Failed to export ATHENA conversation:", error);
      alert(error instanceof Error ? error.message : "Failed to export ATHENA conversation.");
    }
  };
  const handleDeleteMessage = (id: string) => {
    const next = chatMessages.filter(msg => msg.id !== id);
    saveChatMessages(next);
    writeSharedAthenaHistory(readSharedAthenaHistory().filter((msg: any) => msg.id !== id));
  };
  const buildAthenaAugmentedPrompt = async (basePrompt: string, query: string) => {
    const baseUrl = serverUrl.replace(/\/+$/, "");
    const [codeHits, knowledgeHits, tools] = await Promise.all([
      fetchAthenaCodeContext(baseUrl, apiKey, query),
      fetchAthenaKnowledgeContext(baseUrl, apiKey, query),
      fetchAthenaMcpTools(baseUrl, apiKey),
    ]);

    return buildAthenaPromptSections([
      ["BASE PROMPT", basePrompt],
      ["RETRIEVED CODE CONTEXT", formatAthenaContextHits(codeHits)],
      ["RETRIEVED KNOWLEDGE CONTEXT", formatAthenaContextHits(knowledgeHits)],
      ["AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools available."],
    ]);
  };

  // Connect Node State
  const [connectType, setConnectType] = useState("relates_to");
  const [connectTargetIds, setConnectTargetIds] = useState<string[]>([]);
  const [connectTargetQuery, setConnectTargetQuery] = useState("");

  const [selectedNodes, setSelectedNodes] = useState<Map<string, any>>(new Map());
  const [mergeNodeType, setMergeNodeType] = useState<string>("insight");
  const [bulkEdgeType, setBulkEdgeType] = useState<string>("relates_to");

  const baseUrl = serverUrl.replace(/\/+$/, "");
  // Track which nodes have had their labels loaded
  const loadedLabelsRef = useRef<Set<string>>(new Set());
  const nodeLabelsRef = useRef<Map<string, string>>(new Map());

  const bfs = (focals: Set<string>, depth: number, adj: Record<string, string[]>) => {
    const distances = new Map<string, number>();
    const queue: string[] = [];
    focals.forEach((id) => {
      distances.set(id, 0);
      queue.push(id);
    });
    let i = 0;
    while (i < queue.length) {
      const cur = queue[i++];
      const d = distances.get(cur)!;
      if (d >= depth) continue;
      for (const nb of adj[cur] || []) {
        if (!distances.has(nb)) {
          distances.set(nb, d + 1);
          queue.push(nb);
        }
      }
    }
    return distances;
  };

  const filterReachability = useMemo(() => {
    const activeEntries = Object.entries(focalsByType).filter(([, bucket]) => bucket.size > 0);
    const reachByType = new Map<string, Set<string>>();
    for (const [nodeType, seeds] of activeEntries) {
      reachByType.set(nodeType, new Set(bfs(seeds, exploreDepth, graphIndex.adjacency).keys()));
    }
    const intersect = (sets: Set<string>[]) => {
      if (sets.length === 0) return null;
      const [first, ...rest] = [...sets].sort((left, right) => left.size - right.size);
      return new Set([...first].filter((nodeId) => rest.every((set) => set.has(nodeId))));
    };
    const visibleIds = intersect([...reachByType.values()]);
    const allowedByType = new Map<string, Set<string> | null>();
    for (const nodeType of KNOWLEDGE_NODE_TYPES) {
      allowedByType.set(
        nodeType,
        intersect(activeEntries
          .filter(([activeType]) => activeType !== nodeType)
          .map(([activeType]) => reachByType.get(activeType)!)),
      );
    }
    const visibleNodes = visibleIds
      ? rawNodes
          .filter((node) => visibleIds.has(node.node_id || node.id))
          .sort((left, right) => (left.title || left.node_id).localeCompare(right.title || right.node_id))
      : [];
    return { activeEntries, allowedByType, visibleIds, visibleNodes };
  }, [exploreDepth, focalsByType, graphIndex, rawNodes]);

  const sidebarNodesByType = useMemo(() => {
    const result = new Map<string, any[]>();
    const query = filterSearch.trim().toLowerCase();
    for (const nodeType of KNOWLEDGE_NODE_TYPES) {
      const allTypeNodes = sortedNodesByType.get(nodeType) || [];
      const allowed = filterReachability.allowedByType.get(nodeType) || null;
      const selectedInType = focalsByType[nodeType];
      let typeNodes = allowed
        ? allTypeNodes.filter((node) => allowed.has(node.node_id) || selectedInType?.has(node.node_id))
        : allTypeNodes;
      if (query) {
        typeNodes = typeNodes.filter((node) =>
          (node.title || node.node_id).toLowerCase().includes(query)
        );
      }
      result.set(nodeType, typeNodes);
    }
    return result;
  }, [filterReachability, filterSearch, focalsByType, sortedNodesByType]);

  const filteredContext = useMemo(() => {
    const visibleIds = filterReachability.visibleIds;
    if (!visibleIds) return null;
    const visibleEdges = rawEdges.filter(
      (edge) => visibleIds.has(edge.source_id) && visibleIds.has(edge.target_id)
    );
    let hash = 0;
    for (const character of [...visibleIds].sort().join("|")) {
      hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    }
    return {
      nodes: filterReachability.visibleNodes,
      edges: visibleEdges,
      scopeId: `filtered-context-${Math.abs(hash)}`,
    };
  }, [filterReachability, rawEdges]);

  const activeFilteredContext = selectedNode || selectedNodes.size > 0 ? null : filteredContext;
  const activeChatScopeId = activeFilteredContext?.scopeId || selectedNode?.node_id || selectedNode?.id || null;
  const currentChatContext = useMemo(
    () => buildKnowledgeChatContextSnapshot({
      selectedNodeId: selectedNodeId || null,
      selectedNodeIds: Array.from(selectedNodes.keys()),
      focalsByType,
      exploreDepth,
      isExploreActive,
      searchQuery,
      searchTags,
      filterSearch,
      typeFilter,
      openType,
      is3DMode,
    }),
    [
      exploreDepth,
      filterSearch,
      focalsByType,
      is3DMode,
      isExploreActive,
      openType,
      searchQuery,
      searchTags,
      selectedNodeId,
      selectedNodes,
      typeFilter,
    ],
  );
  const currentChatTitle = useMemo(() => {
    if (selectedNode) return selectedNode.title || selectedNodeId || "Knowledge node";
    if (activeFilteredContext) {
      const selectedTitles = Array.from(focalNodes)
        .map((nodeId) => graphIndex.nodesById.get(nodeId)?.title)
        .filter(Boolean) as string[];
      if (selectedTitles.length === 0) return `${activeFilteredContext.nodes.length} filtered nodes`;
      return selectedTitles.length === 1
        ? `Filtered: ${selectedTitles[0]}`
        : `Filtered: ${selectedTitles[0]} +${selectedTitles.length - 1}`;
    }
    return "Knowledge chat";
  }, [activeFilteredContext, focalNodes, graphIndex, selectedNode, selectedNodeId]);

  const loadGraph = async () => {
    if (!svgRef.current || !containerRef.current) return;
    const loadId = ++graphLoadIdRef.current;
    setIsLoading(true);

    try {
      let url = `${baseUrl}/api/knowledge/graph?slim=true&include_staged=true&_=${Date.now()}`;
      const res = await fetch(url, { headers: buildAuthHeaders(apiKey, "") });
      const raw = await res.json();
      if (loadId !== graphLoadIdRef.current) return;

      setRawNodes(raw.nodes || []);
      setRawEdges(raw.edges || []);

      const graphNodes = raw.nodes || [];
      const graphEdges = raw.edges || [];
      const loadedGraphIndex = buildKnowledgeGraphIndex(graphNodes, graphEdges);
      // Make the newly loaded adjacency available before React commits graph state.
      adjRef.current = loadedGraphIndex.adjacency;
      graphIndexRef.current = loadedGraphIndex;
      const domainNodes: any[] = loadedGraphIndex.nodesByType.get("domain") || [];

      const shouldApplyIntelligentFiltering = domainNodes.length > 0;

      let filteredNodes = graphNodes;
      let filteredEdges = graphEdges;

      if (shouldApplyIntelligentFiltering) {
        // Show only domains and their immediate neighbors
        const domainIds = new Set(domainNodes.map((n: any) => n.node_id));
        const neighborIds = new Set<string>();

        // Find all first-neighbor nodes connected to domains
        graphEdges.forEach((e: any) => {
          if (domainIds.has(e.source_id)) {
            neighborIds.add(e.target_id);
          }
          if (domainIds.has(e.target_id)) {
            neighborIds.add(e.source_id);
          }
        });

        // Smart mode: load domains + first neighbors in simulation (for hull drawing),
        // but nodes start hidden — clicking a domain bubble reveals its members
        const allowedIds = new Set([...domainIds, ...neighborIds]);
        filteredNodes = graphNodes.filter((n: any) => allowedIds.has(n.node_id));
        filteredEdges = graphEdges.filter((e: any) =>
          (domainIds.has(e.source_id) || domainIds.has(e.target_id)) &&
          allowedIds.has(e.source_id) && allowedIds.has(e.target_id)
        );

      }

      const keptIds = new Set(filteredNodes.map((n: any) => n.node_id));
      filteredEdges = filteredEdges.filter(
        (e: any) => keptIds.has(e.source_id) && keptIds.has(e.target_id)
      );

      const savedViewport = graphViewportRef.current;
      let yaw = savedViewport.mode === "3d" ? savedViewport.yaw : 0;
      let pitch = savedViewport.mode === "3d" ? savedViewport.pitch : 0;
      let cameraDistance = savedViewport.cameraDistance;
      let panX = savedViewport.panX;
      let panY = savedViewport.panY;
      let updatePositions = (_forceHull?: boolean, _hullTick?: number, _geometryOnly?: boolean) => {};

      simulationRef.current?.stop();
      const d3Svg = d3.select(svgRef.current);
      d3Svg.selectAll("*").remove();

      const width = containerRef.current.clientWidth || 500;
      const height = containerRef.current.clientHeight || 400;
      d3Svg.attr("width", width).attr("height", height);

      const g = d3Svg.append("g");

      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
          graphViewportRef.current = {
            ...graphViewportRef.current,
            mode: "2d",
            scale: event.transform.k,
            x: event.transform.x,
            y: event.transform.y,
          };
        });

      if (is3DMode) {
        if (savedViewport.mode === "2d") {
          cameraDistance = Math.max(150, Math.min(1000, 350 / Math.max(savedViewport.scale, 0.1)));
          panX = savedViewport.x + savedViewport.scale * width / 2 - width / 2;
          panY = savedViewport.y + savedViewport.scale * height / 2 - height / 2;
        }
        const save3DViewport = () => {
          graphViewportRef.current = {
            ...graphViewportRef.current,
            mode: "3d",
            cameraDistance,
            panX,
            panY,
            yaw,
            pitch,
          };
        };
        d3Svg.on(".zoom", null);
        let isDragging = false;
        let startX = 0, startY = 0;
        let startYaw = 0, startPitch = 0;

        d3Svg
          .on("mousedown", (event) => {
            if (event.target.tagName === "svg" || event.target.id === "kb-graph-svg") {
              isDragging = true;
              startX = event.clientX;
              startY = event.clientY;
              startYaw = yaw;
              startPitch = pitch;
            }
          })
          .on("mousemove", (event) => {
            if (!isDragging) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            yaw = startYaw + dx * 0.008;
            pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, startPitch - dy * 0.008));
            save3DViewport();
            updatePositions();
          })
          .on("mouseup", () => { isDragging = false; })
          .on("mouseleave", () => { isDragging = false; })
          .on("wheel", (event) => {
            event.preventDefault();
            if (event.ctrlKey) {
              cameraDistance = Math.max(150, Math.min(1000, cameraDistance + event.deltaY * 0.4));
            } else {
              panX -= event.deltaX * 0.8;
              panY -= event.deltaY * 0.8;
            }
            save3DViewport();
            updatePositions();
          });

        zoomInRef.current = () => {
          cameraDistance = Math.max(150, cameraDistance - 40);
          save3DViewport();
          updatePositions();
        };
        zoomOutRef.current = () => {
          cameraDistance = Math.min(1000, cameraDistance + 40);
          save3DViewport();
          updatePositions();
        };
        fitToGraphRef.current = () => {
          if (!nodes.length) return;
          const padding = 60;
          const availableWidth = Math.max(1, width - padding * 2);
          const availableHeight = Math.max(1, height - padding * 2);
          const projectedBounds = (distance: number) => {
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            nodes.forEach((node) => {
              const cx = (node.x || 0) - width / 2;
              const cy = (node.y || 0) - height / 2;
              const cz = node.z || 0;
              const rotatedX = cx * Math.cos(yaw) - cz * Math.sin(yaw);
              const rotatedZ = cx * Math.sin(yaw) + cz * Math.cos(yaw);
              const rotatedY = cy * Math.cos(pitch) - rotatedZ * Math.sin(pitch);
              const depth = cy * Math.sin(pitch) + rotatedZ * Math.cos(pitch);
              const scale = 350 / Math.max(20, distance + depth);
              const radius = getKnowledgeNodeRadius(node.connections || 0) * scale;
              const projectedX = width / 2 + rotatedX * scale;
              const projectedY = height / 2 + rotatedY * scale;
              minX = Math.min(minX, projectedX - radius);
              maxX = Math.max(maxX, projectedX + radius);
              minY = Math.min(minY, projectedY - radius);
              maxY = Math.max(maxY, projectedY + radius);
            });
            return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
          };

          let near = 150;
          let far = 1000;
          for (let iteration = 0; iteration < 24; iteration++) {
            const candidate = (near + far) / 2;
            const bounds = projectedBounds(candidate);
            if (bounds.width <= availableWidth && bounds.height <= availableHeight) {
              far = candidate;
            } else {
              near = candidate;
            }
          }
          cameraDistance = far;
          const bounds = projectedBounds(cameraDistance);
          panX = width / 2 - (bounds.minX + bounds.maxX) / 2;
          panY = height / 2 - (bounds.minY + bounds.maxY) / 2;
          save3DViewport();
          updatePositions(true);
        };
      } else {
        d3Svg.call(zoom);
        const startingTransform = savedViewport.mode === "3d"
          ? d3.zoomIdentity
              .translate(width / 2 + savedViewport.panX, height / 2 + savedViewport.panY)
              .scale(Math.max(0.1, Math.min(4, 350 / savedViewport.cameraDistance)))
              .translate(-width / 2, -height / 2)
          : d3.zoomIdentity.translate(savedViewport.x, savedViewport.y).scale(savedViewport.scale);
        d3Svg.call(zoom.transform, startingTransform);
        d3Svg.on("wheel", (event) => {
          if (event.ctrlKey) return;
          event.preventDefault();
          const currentTransform = d3.zoomTransform(svgRef.current!);
          const nextTransform = currentTransform.translate(-event.deltaX * 0.6, -event.deltaY * 0.6);
          d3Svg.call(zoom.transform, nextTransform);
        });

        zoomInRef.current = () => {
          d3Svg.transition().duration(250).call(zoom.scaleBy, 1.3);
        };
        zoomOutRef.current = () => {
          d3Svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.3);
        };
        const fitToGraph = (animate = true) => {
          const gEl = g.node() as SVGGElement | null;
          if (!gEl) return;
          try {
            const bbox = gEl.getBBox();
            if (!bbox.width || !bbox.height) return;
            const w2 = containerRef.current?.clientWidth || width;
            const h2 = containerRef.current?.clientHeight || height;
            const pad = 60;
            const scale = Math.min((w2 - pad * 2) / bbox.width, (h2 - pad * 2) / bbox.height, 2);
            if (!isFinite(scale) || scale <= 0) return;
            const tx = w2 / 2 - scale * (bbox.x + bbox.width / 2);
            const ty = h2 / 2 - scale * (bbox.y + bbox.height / 2);
            const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
            if (animate) {
              d3Svg.transition().duration(500).call(zoom.transform, transform);
            } else {
              d3Svg.call(zoom.transform, transform);
            }
          } catch (_) { /* getBBox can throw if element not in layout */ }
        };
        fitToGraphRef.current = fitToGraph;
      }

      const nodes: Node[] = filteredNodes.map((n: any, idx: number) => ({
        id: n.node_id,
        node_id: n.node_id,
        title: n.title,
        node_type: n.node_type,
        content: n.content,
        status: n.status,
        created_at: n.created_at,
        metadata: n.metadata,
        z: (idx % 2 === 0 ? 1 : -1) * (20 + (idx * 25) % 150),
        vz: 0,
      }));

      const edges: Edge[] = filteredEdges.map((e: any) => ({
        source: e.source_id,
        target: e.target_id,
        edge_type: e.edge_type,
        edge_id: e.edge_id,
        weight: e.weight || 1,
      }));

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      const resolvedEdges = edges
        .map((e) => {
          const s = nodeMap.get(e.source as string);
          const t = nodeMap.get(e.target as string);
          if (s && t) {
            return { ...e, source: s, target: t } as Edge;
          }
          return null;
        })
        .filter((e): e is Edge => e !== null);

      // Optimize: Build connection count map once instead of filtering for each node
      const connectionCounts = new Map<string, number>();
      graphEdges.forEach((e: any) => {
        const sId = e.source_id;
        const tId = e.target_id;
        connectionCounts.set(sId, (connectionCounts.get(sId) || 0) + 1);
        connectionCounts.set(tId, (connectionCounts.get(tId) || 0) + 1);
      });

      nodes.forEach((n: any) => {
        n.connections = connectionCounts.get(n.id) || 0;
      });

      const typeColors: Record<string, string> = {
        service: "#38bdf8",
        library: "#e879f9",
        technology: "#4ade80",
        concept: "#a78bfa",
        session: "#94a3b8",
        person: "#fb923c",
        insight: "#fbbf24",
        client: "#34d399",
        project: "#60a5fa",
        repo: "#f472b6",
        issue: "#f87171",
      };

      const domainHullColors = [
        "#38bdf8",
        "#a78bfa",
        "#4ade80",
        "#f87171",
        "#fb923c",
        "#fbbf24",
        "#e879f9",
        "#34d399",
      ];

      const typeOrder = ["domain", "service", "library", "technology", "concept", "session", "person"];
      const clusterCenters: Record<string, { x: number; y: number }> = {};
      typeOrder.forEach((t, i) => {
        const angle = (i / typeOrder.length) * 2 * Math.PI - Math.PI / 2;
        const r = Math.min(width, height) * 0.28;
        clusterCenters[t] = { x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle) };
      });

      const domainCenters = new Map<string, { x: number; y: number }>();
      if (domainNodes.length > 0) {
        const aspectRatio = width / Math.max(height, 1);
        const columns = Math.max(1, Math.ceil(Math.sqrt(domainNodes.length * aspectRatio)));
        const rows = Math.ceil(domainNodes.length / columns);
        domainNodes.forEach((domain: any, index: number) => {
          domainCenters.set(domain.node_id, {
            x: ((index % columns) + 1) * width / (columns + 1),
            y: (Math.floor(index / columns) + 1) * height / (rows + 1),
          });
        });
      }

      nodes.forEach((node) => {
        const domainCenter = domainCenters.get(node.node_id);
        if (!domainCenter) return;
        node.x = domainCenter.x;
        node.y = domainCenter.y;
      });

      // Optimize force simulation for large graphs
      const nodeCount = nodes.length;
      const isLargeGraph = nodeCount > 100;
      const isVeryLargeGraph = nodeCount > 250;

      const forceCluster = (alpha: number) => {
        for (const d of nodes) {
          const domainCenter = domainCenters.get(d.node_id);
          const c = domainCenter || clusterCenters[d.node_type];
          if (!c) continue;
          const strength = domainCenter ? 0.14 : 0.018;
          d.vx = (d.vx || 0) + (c.x - (d.x || 0)) * strength * alpha;
          d.vy = (d.vy || 0) + (c.y - (d.y || 0)) * strength * alpha;
        }
      };

      // Scale force parameters based on graph size for better performance
      const linkStrength = isLargeGraph ? 0.2 : 0.4;
      const chargeStrength = isLargeGraph ? -110 : -210;
      const linkDistance = isLargeGraph ? 120 : 95;

      const simulation = d3.forceSimulation<Node>(nodes)
        .force("link", d3.forceLink<Node, Edge>(resolvedEdges).id((d) => d.id).distance(linkDistance).strength(linkStrength))
        .force("charge", d3.forceManyBody().strength(chargeStrength).distanceMax(isLargeGraph ? 300 : 500).theta(0.9))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
        .force("collision", d3.forceCollide<Node>().radius((d: any) =>
          d.node_type === "domain"
            ? 85
            : getKnowledgeNodeRadius(d.connections || 0) + 10
        ))
        .force("cluster", forceCluster)
        .velocityDecay(isLargeGraph ? 0.88 : 0.65)
        .alphaDecay(isLargeGraph ? 0.03 : 0.025)
        .alpha(0.5)
        .stop();
      simulationRef.current = simulation;

      // Pre-warm: advance positions synchronously before first paint so graph appears settled
      const preWarmTicks = isVeryLargeGraph
        ? 24
        : isLargeGraph
          ? 18
          : Math.min(60, Math.round(160 / Math.sqrt(nodeCount + 1)));
      for (let i = 0; i < preWarmTicks; i++) simulation.tick();

      // State tracking for simulation settling
      let settledFrameCount = 0;
      const settledThreshold = isLargeGraph ? 2 : 3;
      const settleAlphaThreshold = isLargeGraph ? 0.12 : 0.16;
      const maxSimulationDuration = isLargeGraph ? 900 : 1200;
      let simulationStartedAt = performance.now();
      let isSettled = false;
      // Throttle hull recompute: update every N ticks (hulls are expensive per-tick)
      let hullTickCount = 0;
      const hullUpdateEvery = isVeryLargeGraph ? Number.POSITIVE_INFINITY : isLargeGraph ? 10 : 6;

      const domainAreas = domainNodes.map((dn: any, i: number) => {
        const memberIds = new Set<string>();
        for (const edge of loadedGraphIndex.edgesByNode.get(dn.node_id) || []) {
          const memberId = edge.source_id === dn.node_id ? edge.target_id : edge.source_id;
          if (keptIds.has(memberId)) memberIds.add(memberId);
        }
        const memberNodes = [...memberIds]
          .map((memberId) => nodeMap.get(memberId))
          .filter((member): member is Node => Boolean(member));
        return { domain: dn, memberIds, memberNodes, color: domainHullColors[i % domainHullColors.length] };
      }).filter((area: any) => area.memberIds.size > 0);



      const domainHullG = g.append("g");
      const hullLine = d3.line().curve(d3.curveCardinalClosed.tension(0.65));

      const _domainHullPath = (memberNodes: any[], pad: number, useProjected: boolean = false) => {
        if (!memberNodes.length) return null;
        const getCoord = (n: any) => {
          return useProjected ? [n.px || 0, n.py || 0] : [n.x || 0, n.y || 0];
        };
        if (memberNodes.length === 1) {
          const r = pad + 18;
          const [px, py] = getCoord(memberNodes[0]);
          const pts = Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * 2 * Math.PI;
            return [px + r * Math.cos(a), py + r * Math.sin(a)] as [number, number];
          });
          return hullLine(pts);
        }
        if (memberNodes.length === 2) {
          const [n1, n2] = memberNodes;
          const [x1, y1] = getCoord(n1);
          const [x2, y2] = getCoord(n2);
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const r = pad + 12;
          const pts: [number, number][] = [
            [x1 + nx * r, y1 + ny * r],
            [x2 + nx * r, y2 + ny * r],
            [x2 + nx * 0.5 * r + (dx/len) * r, y2 + ny * 0.5 * r + (dy/len) * r],
            [x2 - nx * r, y2 - ny * r],
            [x1 - nx * r, y1 - ny * r],
            [x1 - nx * 0.5 * r - (dx/len) * r, y1 - ny * 0.5 * r - (dy/len) * r]
          ];
          return hullLine(pts);
        }
        const pts: [number, number][] = memberNodes.map((n) => getCoord(n) as [number, number]);
        const raw = d3.polygonHull(pts);
        if (!raw || raw.length < 2) return null;
        const cx = raw.reduce((s, p) => s + p[0], 0) / raw.length;
        const cy = raw.reduce((s, p) => s + p[1], 0) / raw.length;
        const expanded: [number, number][] = raw.map(([x, y]) => {
          const dx = x - cx, dy = y - cy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          return [x + (dx / len) * pad, y + (dy / len) * pad];
        });
        return hullLine(expanded);
      };

      const getHullMetrics = (members: Node[], projected: boolean) => {
        let xTotal = 0;
        let topY = Infinity;
        let depthTotal = 0;
        for (const member of members) {
          const x = projected ? member.px || 0 : member.x || 0;
          const y = projected ? member.py || 0 : member.y || 0;
          xTotal += x;
          topY = Math.min(topY, y);
          depthTotal += member.depth || 0;
        }
        return {
          centerX: xTotal / members.length,
          topY: topY - 30,
          averageDepth: depthTotal / members.length,
        };
      };

      const areaElements = domainAreas.map((area: any) => {
        const onDomainClick = (event: MouseEvent) => {
          event.stopPropagation();
          void selectNodeById(area.domain.node_id);
        };

        const path = domainHullG.append("path")
          .datum(area)
          .attr("class", "domain-area")
          .attr("data-domain-id", area.domain.node_id)
          .attr("fill", area.color)
          .attr("fill-opacity", 0.07)
          .attr("stroke", area.color)
          .attr("stroke-opacity", 0.85)
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "8,5")
          .attr("pointer-events", "all")
          .style("cursor", "pointer")
          .on("click", onDomainClick);

        const label = domainHullG.append("text")
          .datum(area)
          .attr("class", "domain-area-label")
          .attr("data-domain-id", area.domain.node_id)
          .attr("text-anchor", "middle")
          .attr("font-family", "monospace")
        .attr("font-size", "9px")
        .attr("font-weight", "700")
        .attr("letter-spacing", "2.5px")
        .attr("fill", area.color)
        .attr("opacity", 0.75)
        .attr("pointer-events", "all")
        .style("cursor", "pointer")
        .on("click", onDomainClick)
        .text((area.domain.title || "").toUpperCase().slice(0, 22));

      return { path, label, area };
    });

    const link = g.append("g")
      .selectAll("line")
      .data(resolvedEdges)
      .enter()
      .append("line")
      .attr("stroke", "rgba(186,207,230,0.75)")
      .attr("stroke-width", (d) => Math.max(1.5, (d.weight || 1) * 2.0));

    const node = g.append("g")
      .selectAll("g")
      .data(nodes.filter((n) => n.node_type !== "domain"))
      .enter()
      .append("g")
      .attr("class", "node")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", (event, d) => {
        if (!event.active) {
          simulationStartedAt = performance.now();
          simulation.alphaTarget(0.3).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) {
            simulation.alphaTarget(0);
            // Reset settle tracking so nodes can settle again after drag
            settledFrameCount = 0;
            isSettled = false;
          }
          d.fx = null;
          d.fy = null;
        })
      )
      .on("click", async (event, d) => {
        event.stopPropagation();
        if (event.metaKey || event.ctrlKey) {
          setSelectedNodes((prev) => {
            const next = new Map(prev);
            if (next.has(d.node_id)) next.delete(d.node_id);
            else next.set(d.node_id, d);
            if (next.size === 1) setSelectedNode(Array.from(next.values())[0]);
            else if (next.size === 0) setSelectedNode(null);
            return next;
          });
        } else {
          setSelectedNodes(new Map());
          setSelectedNode(d);
          handleExploreNode(d.node_id);
          try {
            const res = await fetch(`${baseUrl}/api/knowledge/nodes/${d.node_id}`, {
              headers: buildAuthHeaders(apiKey, "")
            });
            if (res.ok) setSelectedNode(await res.json());
          } catch (e) {
            console.error("Failed to fetch node details", e);
          }
        }
      });

    const nodeShapePath = (d: any) => {
      const r = getKnowledgeNodeRadius(d.connections || 0);
      if (d.status === "staged") {
        return `M 0 ${-r} C ${r * 0.8} ${-r * 1.25}, ${r * 1.25} ${-r * 0.45}, ${r * 0.95} 0 C ${r * 0.7} ${r * 0.45}, ${r * 0.8} ${r * 1.2}, 0 ${r} C ${-r * 0.95} ${r * 1.1}, ${-r * 1.25} ${r * 0.35}, ${-r} 0 C ${-r * 0.9} ${-r * 0.4}, ${-r * 0.85} ${-r * 1.2}, 0 ${-r} Z`;
      }
      return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
    };

    const nodeVisual = node.append("path")
      .attr("class", "node-visual node-shape")
      .attr("d", nodeShapePath)
      .attr("fill", (d) => typeColors[d.node_type] || "#6b7280")
      .attr("stroke", "#dbeafe")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", (d: any) => d.status === "staged" ? "3,3" : "none");

    node.append("text")
      .attr("dx", (d: any) => getKnowledgeNodeRadius(d.connections || 0) + 5)
      .attr("dy", ".35em")
      .text((d) => (d.title && d.title.length > 25) ? d.title.slice(0, 25) + "…" : (d.title || d.id))
      .attr("fill", "var(--foreground)")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .style("pointer-events", "none")
      .style("opacity", 0);

    let searchVisibilityCache = {
      key: "",
      matchedIds: new Set<string>(),
      visibleIds: new Set<string>(),
    };
    updatePositions = (forceHull = false, _hullTick = 0, geometryOnly = false) => {
      const shouldUpdateHull = forceHull || (_hullTick % hullUpdateEvery === 0);
      let matchedIds = new Set<string>();
      let visibleIds = new Set<string>();
      const query = searchQueryRef.current.trim().toLowerCase();
      const tags = searchTagsRef.current;
      const activeSelectedNodes = selectedNodesRef.current;
      const activeSelectedNode = selectedNodeRef.current;
      const activeIsExploreActive = isExploreActiveRef.current;
      const activeFocalNodes = focalNodesRef.current;
      const activeExploreDepth = exploreDepthRef.current;

      // Use memoized adjacency list instead of rebuilding
      const adj = adjRef.current;

      // Cache distance map to avoid recomputing BFS every frame
      let distMap: Map<string, number> | null = null;

      if (!geometryOnly && activeIsExploreActive && activeFocalNodes.size > 0 && activeSelectedNodes.size === 0) {
        const exploreConfig = `${Array.from(activeFocalNodes).join(",")}-${activeExploreDepth}`;
        if (distMapCacheRef.current.config !== exploreConfig) {
          distMapCacheRef.current = {
            config: exploreConfig,
            distMap: bfs(activeFocalNodes, activeExploreDepth, adj)
          };
        }
        distMap = distMapCacheRef.current.distMap;
      }

      // Use pre-computed search matches
      const hasSearch = query || tags.length > 0;
      if (!geometryOnly && hasSearch) {
        const searchConfig = `${query}\u0000${tags.join("\u0000")}`;
        if (searchVisibilityCache.key === searchConfig) {
          matchedIds = searchVisibilityCache.matchedIds;
          visibleIds = searchVisibilityCache.visibleIds;
        } else {
          matchedIds = new Set(searchMatchesRef.current);
          if (tags.length > 0) {
            tags.forEach((tag, idx) => {
              const currentTagVisible = new Set<string>();
              const normalizedTag = tag.toLowerCase();
              for (const node of graphNodes) {
                const tagsList = node.metadata?.tags || [];
                const matchesTag = (node.title || "").toLowerCase().includes(normalizedTag)
                  || (node.content || "").toLowerCase().includes(normalizedTag)
                  || (node.node_id || "").toLowerCase().includes(normalizedTag)
                  || tagsList.some((nodeTag: string) => nodeTag.toLowerCase() === normalizedTag);
                if (!matchesTag) continue;
                currentTagVisible.add(node.node_id);
                for (const neighborId of loadedGraphIndex.adjacency[node.node_id] || []) {
                  currentTagVisible.add(neighborId);
                }
              }
              visibleIds = idx === 0
                ? currentTagVisible
                : new Set([...visibleIds].filter((id) => currentTagVisible.has(id)));
            });
          } else {
            visibleIds = new Set(matchedIds);
            matchedIds.forEach((id) => {
              for (const neighborId of loadedGraphIndex.adjacency[id] || []) visibleIds.add(neighborId);
            });
          }
          searchVisibilityCache = { key: searchConfig, matchedIds, visibleIds };
        }
      }

      const activeTypeFilter = typeFilterRef.current;
      const getNodeOpacity = (d: any) => {
        // In smart mode with no active explore/search, hide all nodes — domain bubbles only
        const isSmartMode = intelligentFilteringRef.current;
        if (
          isSmartMode
          && !activeTypeFilter
          && !hasSearch
          && !distMap
          && activeSelectedNodes.size === 0
        ) {
          return 0;
        }
        // Type filter: dim non-matching nodes (but don't fully hide them)
        const typeMatch = !activeTypeFilter || d.node_type === activeTypeFilter;
        let factor = 1.0;
        if (hasSearch) {
          factor = visibleIds.has(d.node_id) ? (matchedIds.has(d.node_id) ? 1.0 : 0.5) : 0.08;
        } else if (distMap) {
          factor = distMap.has(d.node_id) ? Math.max(0.4, 1 - distMap.get(d.node_id)! * 0.2) : 0.08;
        } else if (activeSelectedNodes.size > 0) {
          factor = activeSelectedNodes.has(d.node_id) ? 1.0 : 0.15;
        } else if (activeSelectedNode && d.node_id === (activeSelectedNode.node_id || activeSelectedNode.id)) {
          factor = 1.0;
        }
        return typeMatch ? factor : factor * 0.1;
      };

      const getLinkOpacity = (d: any) => {
        const s = d.source.node_id || d.source;
        const t = d.target.node_id || d.target;
        const isSmartMode = intelligentFilteringRef.current;
        if (isSmartMode && !hasSearch && !distMap && activeSelectedNodes.size === 0) {
          return 0;
        }
        let factor = 0.75;
        if (hasSearch) {
          factor = (visibleIds.has(s) && visibleIds.has(t)) ? 0.85 : 0.05;
        } else if (distMap) {
          factor = (distMap.has(s) && distMap.has(t)) ? 0.85 : 0.05;
        } else if (activeSelectedNodes.size > 0) {
          factor = (activeSelectedNodes.has(s) && activeSelectedNodes.has(t)) ? 0.85 : 0.15;
        }
        if (activeTypeFilter) {
          const sourceMatches = d.source?.node_type === activeTypeFilter;
          const targetMatches = d.target?.node_type === activeTypeFilter;
          factor *= sourceMatches || targetMatches ? 0.75 : 0.08;
        }
        return factor;
      };

      if (is3DMode) {
        if (geometryOnly) {
          resolvedEdges.forEach((edge: any) => {
            const s = edge.source;
            const t = edge.target;
            if (s.z != null && t.z != null) {
              const dz = t.z - s.z;
              s.vz = (s.vz || 0) + dz * 0.005;
              t.vz = (t.vz || 0) - dz * 0.005;
            }
          });

          nodes.forEach((n: any) => {
            n.z = (n.z || 0) + (n.vz || 0);
            n.vz = (n.vz || 0) * 0.82;
            n.z -= n.z * 0.015;
          });
        }

        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
        const cosPitch = Math.cos(pitch);
        const sinPitch = Math.sin(pitch);
        nodes.forEach((n: any) => {
          const cx = (n.x || 0) - width / 2;
          const cy = (n.y || 0) - height / 2;
          const cz = n.z || 0;

          const r1x = cx * cosYaw - cz * sinYaw;
          const r1z = cx * sinYaw + cz * cosYaw;

          const r2y = cy * cosPitch - r1z * sinPitch;
          const r2z = cy * sinPitch + r1z * cosPitch;

          const distance = cameraDistance;
          const fov = 350;
          const scale = fov / (distance + r2z);

          n.px = width / 2 + r1x * scale + panX;
          n.py = height / 2 + r2y * scale + panY;
          n.pScale = scale;
          n.depth = r2z;
        });

        link
          .attr("x1", (d: any) => d.source.px || 0)
          .attr("y1", (d: any) => d.source.py || 0)
          .attr("x2", (d: any) => d.target.px || 0)
          .attr("y2", (d: any) => d.target.py || 0);
        if (!geometryOnly) {
          link.attr("opacity", (d: any) => {
            const avgDepth = ((d.source.depth || 0) + (d.target.depth || 0)) / 2;
            const depthOpacity = Math.max(0.1, Math.min(0.7, 1 - (avgDepth + 150) / 300));
            return getLinkOpacity(d) * (depthOpacity / 0.7);
          });
        }

        node
          .attr("transform", (d: any) => `translate(${d.px || 0}, ${d.py || 0})`);
        if (!geometryOnly) {
          node.attr("opacity", (d: any) => {
            const avgDepth = d.depth || 0;
            const depthOpacity = Math.max(0.15, Math.min(1.0, 1 - (avgDepth + 150) / 350));
            return getNodeOpacity(d) * depthOpacity;
          });
        }

        nodeVisual
          .attr("transform", (d: any) => `scale(${d.pScale || 1})`);

        if (shouldUpdateHull) areaElements.forEach(({ path, label, area }: any) => {
          path.style("display", null);
          label.style("display", null);

          const members: Node[] = area.memberNodes;
          const dPath = _domainHullPath(members, 30, true);
          if (dPath) {
            path.attr("d", dPath);
            const metrics = getHullMetrics(members, true);
            label.attr("x", metrics.centerX).attr("y", metrics.topY);

            const depthOpacity = Math.max(0.05, Math.min(1.0, 1 - (metrics.averageDepth + 150) / 350));
            path.attr("fill-opacity", 0.07 * depthOpacity)
                .attr("stroke-opacity", 0.85 * depthOpacity);
            label.attr("opacity", 0.5 * depthOpacity);
          }
        });
      } else {
        link
          .attr("x1", (d: any) => d.source.x || 0)
          .attr("y1", (d: any) => d.source.y || 0)
          .attr("x2", (d: any) => d.target.x || 0)
          .attr("y2", (d: any) => d.target.y || 0);
        if (!geometryOnly) link.attr("opacity", (d: any) => getLinkOpacity(d));

        node
          .attr("transform", (d: any) => `translate(${d.x || 0}, ${d.y || 0})`);
        if (!geometryOnly) node.attr("opacity", (d: any) => getNodeOpacity(d));

        if (shouldUpdateHull) areaElements.forEach(({ path, label, area }: any) => {
          path.style("display", null);
          label.style("display", null);

          const members: Node[] = area.memberNodes;
          const hullPad = intelligentFilteringRef.current ? 48 : 30;
          const dPath = _domainHullPath(members, hullPad);
          if (dPath) {
            path.attr("d", dPath);
            const metrics = getHullMetrics(members, false);
            label.attr("x", metrics.centerX).attr("y", metrics.topY);
            const isMatch = matchedIds.has(area.domain.node_id);
            const isSmartMode = intelligentFilteringRef.current;
            const isExploring = isExploreActiveRef.current && focalNodesRef.current.size > 0;
            const isDomainFocused = isExploring && focalNodesRef.current.has(area.domain.node_id);
            // While exploring: show ONLY focused domain(s); hide all others
            const fillOpacity = isExploring
              ? (isDomainFocused ? 0.22 : 0)
              : hasSearch
                ? (isMatch ? 0.18 : 0.03)
                : isSmartMode
                  ? 0.13
                  : 0.07;
            const strokeOpacity = isExploring
              ? (isDomainFocused ? 1 : 0)
              : hasSearch
                ? (isMatch ? 1 : 0.25)
                : isSmartMode
                  ? 0.7
                  : 0.85;
            path.attr("fill-opacity", fillOpacity)
              .attr("stroke-opacity", strokeOpacity)
              .attr("stroke-width", isExploring ? (isDomainFocused ? 3 : 0) : hasSearch && isMatch ? 3 : 2)
              .attr("pointer-events", isExploring && !isDomainFocused ? "none" : "auto");
            const labelOpacity = isExploring
              ? (isDomainFocused ? 1 : 0)
              : hasSearch
                ? (isMatch ? 1 : 0.2)
                : isSmartMode
                  ? 0.85
                  : 0.75;
            label.attr("opacity", labelOpacity)
              .attr("font-size", isSmartMode ? 13 : 11);
          }
        });
      }
    };

    updatePositionsRef.current = updatePositions;

    // Large SVG graphs repaint at a lower frame rate while settling, then render once at full fidelity.
    let lastTickTime = 0;
    const tickThrottle = isVeryLargeGraph ? 50 : isLargeGraph ? 32 : 20;

    simulation.on("tick", () => {
      const now = performance.now();
      if (now - lastTickTime >= tickThrottle) {
        hullTickCount++;
        updatePositions(false, hullTickCount, true);
        lastTickTime = now;

        // Stop repainting once the layout settles or reaches its animation budget.
        if (!isSettled) {
          const exceededAnimationBudget = now - simulationStartedAt >= maxSimulationDuration;
          if (exceededAnimationBudget || simulation.alpha() < settleAlphaThreshold) {
            settledFrameCount++;
            if (exceededAnimationBudget || settledFrameCount >= settledThreshold) {
              isSettled = true;
              simulation.alphaTarget(0).stop();
              // Final hull render with settled positions
              updatePositions(true);
            }
          } else {
            settledFrameCount = 0;
          }
        }
      }
    });

    updatePositions(true);
    if (!isVeryLargeGraph) simulation.restart();
    if (!is3DMode && !hasFittedGraphRef.current) {
      fitToGraphRef.current(false);
      hasFittedGraphRef.current = true;
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (loadId === graphLoadIdRef.current) setIsLoading(false);
  }
};

const handleExploreNode = (nodeId: string) => {
  const node = graphIndexRef.current.nodesById.get(nodeId);
  const type = node?.node_type || "concept";
  setFocalsByType({ [type]: new Set([nodeId]) });
  setIsExploreActive(true);
};

// Full select: highlight in graph + open info panel + fetch details. Mirrors graph-click.
const selectNodeById = async (nodeId: string) => {
  const node = graphIndexRef.current.nodesById.get(nodeId);
  if (!node) return;
  setSelectedNodes(new Map());
  setSelectedNode(node as any);
  handleExploreNode(nodeId);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
      headers: buildAuthHeaders(apiKey, "")
    });
    if (res.ok) setSelectedNode(await res.json());
  } catch (e) {
    console.error("Failed to fetch node details", e);
  }
};

const toggleFocalNode = (nodeId: string) => {
  const node = graphIndexRef.current.nodesById.get(nodeId);
  const type = node?.node_type || "concept";
  setFocalsByType((prev) => {
    const next: Record<string, Set<string>> = {};
    for (const [k, v] of Object.entries(prev)) next[k] = new Set(v);
    const bucket = new Set(next[type] || []);
    if (bucket.has(nodeId)) bucket.delete(nodeId);
    else bucket.add(nodeId);
    if (bucket.size === 0) delete next[type];
    else next[type] = bucket;
    const totalSize = Object.values(next).reduce((s, b) => s + b.size, 0);
    if (totalSize === 0) setIsExploreActive(false);
    else setIsExploreActive(true);
    return next;
  });
};

const clearExploreMode = () => {
  setIsExploreActive(false);
  setFocalsByType({});
  setSelectedNode(null);
  setSelectedNodes(new Map());
  if (svgRef.current) {
    const svg = d3.select(svgRef.current);
    svg.selectAll(".node").attr("opacity", 1);
    svg.selectAll("line").attr("opacity", 1);
  }
};

useEffect(() => {
  let rafId: number;
  let lastWidth = 0;
  let lastHeight = 0;

  const handleResize = () => {
    if (!containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;

    // Skip if size hasn't actually changed
    if (w === lastWidth && h === lastHeight) return;

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (svgRef.current) {
        d3.select(svgRef.current).attr("width", w).attr("height", h);
        lastWidth = w;
        lastHeight = h;
        // Trigger graph update if needed
        if (updatePositionsRef.current) {
          updatePositionsRef.current();
        }
      }
    });
  };

  window.addEventListener("resize", handleResize);
  return () => {
    window.removeEventListener("resize", handleResize);
    if (rafId) cancelAnimationFrame(rafId);
  };
}, []);

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't intercept when typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "f" || e.key === "F") {
      fitToGraphRef.current();
    } else if (e.key === "+" || e.key === "=") {
      zoomInRef.current();
    } else if (e.key === "-") {
      zoomOutRef.current();
    } else if (e.key === "Escape") {
      clearExploreMode();
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);

useEffect(() => {
  if (!svgRef.current) return;
  const svg = d3.select(svgRef.current);

  if (searchTags.length > 0) {
    const matchedIds = new Set<string>();
    let visibleIds = new Set<string>();

    // Use memoized adjacency list
    const adj = adjRef.current;

    searchTags.forEach((tag, idx) => {
      const q = tag.toLowerCase().trim();
      const matches = rawNodes.filter(n =>
        (n.title || "").toLowerCase().includes(q) ||
        (n.node_id || "").toLowerCase().includes(q)
      );

      const currentTagVisible = new Set<string>();
      matches.forEach(n => {
        matchedIds.add(n.node_id);
        currentTagVisible.add(n.node_id);
        for (const nb of adj[n.node_id] || []) {
          currentTagVisible.add(nb);
        }
      });

      if (idx === 0) {
        visibleIds = currentTagVisible;
      } else {
        visibleIds = new Set(Array.from(visibleIds).filter(id => currentTagVisible.has(id)));
      }
    });

    svg.selectAll(".node")
      .attr("opacity", (d: any) => visibleIds.has(d.node_id) ? (matchedIds.has(d.node_id) ? 1.0 : 0.5) : 0.08)
      .attr("pointer-events", (d: any) => visibleIds.has(d.node_id) ? "auto" : "none");
    svg.selectAll(".node .node-shape")
      .attr("stroke", (n: any) => matchedIds.has(n.node_id) ? "#fff" : "#1a1a2e")
      .attr("stroke-width", (n: any) => matchedIds.has(n.node_id) ? 3 : 2)
      .attr("stroke-dasharray", (n: any) => n.status === "staged" ? "3,3" : "none");
    svg.selectAll(".node text")
      .attr("opacity", (n: any) => visibleIds.has(n.node_id) ? 1 : 0.15);
    svg.selectAll("line").attr("opacity", (e: any) => {
      const s = e.source.node_id || e.source;
      const t = e.target.node_id || e.target;
      return (visibleIds.has(s) && visibleIds.has(t)) ? 0.7 : 0.05;
    });
    svg.selectAll(".domain-area")
      .attr("fill-opacity", (area: any) => matchedIds.has(area.domain.node_id) ? 0.18 : 0.03)
      .attr("stroke-opacity", (area: any) => matchedIds.has(area.domain.node_id) ? 1 : 0.25)
      .attr("stroke-width", (area: any) => matchedIds.has(area.domain.node_id) ? 3 : 2);
    svg.selectAll(".domain-area-label")
      .attr("opacity", (area: any) => matchedIds.has(area.domain.node_id) ? 1 : 0.2);
  } else if (isExploreActive && focalNodes.size > 0 && selectedNodes.size === 0) {
    const adj = graphIndex.adjacency;
    // OR within type-bucket, AND across type-buckets.
    const activeBuckets = Object.values(focalsByType).filter(s => s.size > 0);
    let distMap: Map<string, number>;
    if (activeBuckets.length <= 1) {
      distMap = bfs(focalNodes, exploreDepth, adj);
    } else {
      const perBucket = activeBuckets.map(b => bfs(b, exploreDepth, adj));
      const intersectIds = perBucket.reduce<Set<string>>((acc, m, i) => {
        const keys = new Set(m.keys());
        return i === 0 ? keys : new Set([...acc].filter(k => keys.has(k)));
      }, new Set());
      distMap = new Map();
      intersectIds.forEach(id => {
        // min distance across buckets for sizing/opacity heuristics
        let min = Infinity;
        for (const m of perBucket) {
          const d = m.get(id);
          if (d != null && d < min) min = d;
        }
        distMap.set(id, min);
      });
    }
    svg.selectAll(".node").attr("opacity", (d: any) => distMap.has(d.node_id) ? 1 : 0)
      .attr("pointer-events", (d: any) => distMap.has(d.node_id) ? "auto" : "none");
    svg.selectAll("line").attr("opacity", (e: any) => {
      const s = e.source.node_id || e.source;
      const t = e.target.node_id || e.target;
      return (distMap.has(s) && distMap.has(t)) ? 0.7 : 0;
    });
    svg.selectAll(".node .node-shape")
      .attr("stroke", (n: any) => focalNodes.has(n.node_id) ? "#fff" : "#1a1a2e")
      .attr("stroke-width", (n: any) => focalNodes.has(n.node_id) ? 3 : 2)
      .attr("stroke-dasharray", (n: any) => n.status === "staged" ? "3,3" : "none");
    svg.selectAll(".node text").attr("opacity", (d: any) => distMap.has(d.node_id) ? 1 : 0);
    // Show only the selected domain hulls; hide the rest
    svg.selectAll(".domain-area")
      .attr("fill-opacity", (area: any) => focalNodes.has(area.domain.node_id) ? 0.18 : 0)
      .attr("stroke-opacity", (area: any) => focalNodes.has(area.domain.node_id) ? 1 : 0)
      .attr("stroke-width", (area: any) => focalNodes.has(area.domain.node_id) ? 3 : 0)
      .attr("pointer-events", (area: any) => focalNodes.has(area.domain.node_id) ? "auto" : "none");
    svg.selectAll(".domain-area-label")
      .attr("opacity", (area: any) => focalNodes.has(area.domain.node_id) ? 1 : 0);
  } else {
    svg.selectAll(".domain-area")
      .attr("fill-opacity", 0.07)
      .attr("stroke-opacity", 0.85)
      .attr("stroke-width", 2);
    svg.selectAll(".domain-area-label").attr("opacity", 0.75);
    if (intelligentFiltering && typeFilter) {
      svg.selectAll(".node")
        .attr("opacity", (node: any) => node.node_type === typeFilter ? 1 : 0.06)
        .attr("pointer-events", (node: any) => node.node_type === typeFilter ? "auto" : "none");
      svg.selectAll(".node text")
        .attr("opacity", (node: any) => node.node_type === typeFilter ? 1 : 0);
      svg.selectAll("line").attr("opacity", (edge: any) => {
        const sourceMatches = edge.source?.node_type === typeFilter;
        const targetMatches = edge.target?.node_type === typeFilter;
        return sourceMatches || targetMatches ? 0.55 : 0.03;
      });
      svg.selectAll(".domain-area")
        .attr("fill-opacity", 0.03)
        .attr("stroke-opacity", 0.25);
      svg.selectAll(".domain-area-label").attr("opacity", 0.3);
    } else if (intelligentFiltering) {
      // Smart mode, no domain selected — hide all nodes and edges
      svg.selectAll(".node").attr("opacity", 0);
      svg.selectAll("line").attr("opacity", 0);
    } else {
      svg.selectAll(".node")
        .attr("opacity", 1)
        .attr("pointer-events", "auto");
      svg.selectAll(".node .node-shape")
        .attr("stroke", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? "#00e6c8" : "#1a1a2e") : (n.node_id === selectedNodeId ? "#fff" : "#1a1a2e"))
        .attr("stroke-width", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? 4 : 1.5) : (n.node_id === selectedNodeId ? 3 : 2))
        .attr("stroke-dasharray", (n: any) => n.status === "staged" ? "3,3" : "none")
        .attr("opacity", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? (n.status === "staged" ? 0.6 : 1) : 0.3) : (n.status === "staged" ? 0.6 : 1));
      svg.selectAll(".node text").attr("opacity", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? 1 : 0) : (n.node_id === selectedNodeId ? 1 : 0));
      svg.selectAll("line").attr("opacity", (e: any) => {
        if (selectedNodes.size > 0) {
          const s = e.source.node_id || e.source;
          const t = e.target.node_id || e.target;
          return (selectedNodes.has(s) && selectedNodes.has(t)) ? 0.85 : 0.15;
        }
        return 0.75;
      });
    }
  }
}, [exploreDepth, isExploreActive, focalNodes, focalsByType, graphIndex, rawNodes, rawEdges, selectedNodes, selectedNodeId, searchQuery, searchTags, intelligentFiltering, typeFilter]);

useEffect(() => {
  exploreDepthRef.current = exploreDepth;
  isExploreActiveRef.current = isExploreActive;
  focalNodesRef.current = focalNodes;
  selectedNodesRef.current = selectedNodes;
  selectedNodeRef.current = selectedNode;
  searchQueryRef.current = searchQuery;
  searchTagsRef.current = searchTags;
  intelligentFilteringRef.current = intelligentFiltering;
  typeFilterRef.current = typeFilter;
  if (is3DMode && updatePositionsRef.current) {
    updatePositionsRef.current(true);
  }
}, [exploreDepth, isExploreActive, focalNodes, selectedNodes, selectedNodeId, searchQuery, searchTags, is3DMode, intelligentFiltering, typeFilter]);

useEffect(() => {
  const fetchWorkspacesList = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/workspaces`, {
        headers: buildAuthHeaders(apiKey, ""),
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableWorkspaces(Array.isArray(data) ? data : (data?.workspaces || []));
      }
    } catch (e) {
      console.error("Failed to load workspaces:", e);
    }
  };
  fetchWorkspacesList();
}, [baseUrl, apiKey]);

const handleMergeSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const nodeIds = Array.from(selectedNodes.keys());
  if (nodeIds.length < 2) return;
  const survivorTitle = selectedNodes.get(nodeIds[0])?.title || "node";
  if (!confirm(`Merge ${nodeIds.length} nodes into "${survivorTitle}"? This cannot be undone.`)) return;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/merge`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ node_ids: nodeIds, node_type: mergeNodeType }),
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedNodes(new Map());
      setSelectedNode(data);
      await loadGraph();
    } else {
      const err = await res.json();
      alert("Error: " + (err.error || "Merge failed"));
    }
  } catch (e: any) { alert("Failed: " + e.message); } finally { setIsLoading(false); }
};

const handleBulkConnect = async () => {
  const ids = Array.from(selectedNodes.keys());
  if (ids.length < 2) return;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/edges/bulk`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ source_id: ids[0], target_ids: ids.slice(1), edge_type: bulkEdgeType }),
    });
    if (res.ok) {
      setSelectedNodes(new Map());
      setSelectedNode(null);
      await loadGraph();
    } else alert("Failed to connect nodes");
  } catch (e: any) { alert("Failed: " + e.message); } finally { setIsLoading(false); }
};

  const handleBulkApplyWorkspace = async () => {
    const ids = Array.from(selectedNodes.keys());
    if (ids.length === 0) return;
    setIsLoading(true);
    try {
      await Promise.all(ids.map(async (nodeId) => {
        const nodeRes = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
          headers: buildAuthHeaders(apiKey, ""),
        });
        if (nodeRes.ok) {
          const nodeData = await nodeRes.json();
          const updatedMetadata = {
            ...(nodeData.metadata || {}),
            workspaces: bulkWorkspace ? [bulkWorkspace] : [],
          };
          if (bulkWorkspace) {
            updatedMetadata.workspace_id = bulkWorkspace;
          } else {
            delete updatedMetadata.workspace_id;
          }
          await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
            method: "PUT",
            headers: buildAuthHeaders(apiKey),
            body: JSON.stringify({ metadata: updatedMetadata }),
          });
        }
      }));
      setSelectedNodes(new Map());
      setSelectedNode(null);
      await loadGraph();
    } catch (err: any) {
      alert("Bulk workspace update failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectNodes = async (e: React.FormEvent) => {
    e.preventDefault();
    const isMulti = selectedNodes.size >= 2;
    if ((!selectedNode && !isMulti) || connectTargetIds.length === 0) return;
    const sourceIds = isMulti ? Array.from(selectedNodes.keys()) : [selectedNode!.node_id || selectedNode!.id];
    setIsLoading(true);
    try {
      await Promise.all(sourceIds.map(async (sourceId) => {
        const res = await fetch(`${baseUrl}/api/knowledge/edges/bulk`, {
          method: "POST",
          headers: buildAuthHeaders(apiKey),
          body: JSON.stringify({ source_id: sourceId, target_ids: connectTargetIds, edge_type: connectType }),
        });
        if (!res.ok) {
          throw new Error(`Failed to connect node: ${sourceId}`);
        }
      }));
      setIsConnectModalOpen(false);
      setConnectTargetIds([]);
      setConnectTargetQuery("");
      setSelectedNodes(new Map());
      setSelectedNode(null);
      await loadGraph();
    } catch (err: any) {
      alert("Failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

const handleDeleteEdge = async (edgeId: string | undefined, sourceId: string, targetId: string, edgeType: string) => {
  if (!confirm("Are you sure you want to remove this connection edge?")) return;
  setIsLoading(true);
  try {
    let res;
    if (edgeId) {
      res = await fetch(`${baseUrl}/api/knowledge/edges/${edgeId}`, {
        method: "DELETE",
        headers: buildAuthHeaders(apiKey, ""),
      });
    } else {
      res = await fetch(`${baseUrl}/api/knowledge/edges/disconnect`, {
        method: "POST",
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify({ source_id: sourceId, target_id: targetId, edge_type: edgeType }),
      });
    }
    if (res.ok) {
      await loadGraph();
    } else {
      alert("Failed to remove edge");
    }
  } catch (err: any) {
    alert("Failed: " + err.message);
  } finally {
    setIsLoading(false);
  }
};

const handleBulkDelete = async () => {
  const ids = Array.from(selectedNodes.keys());
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} node(s)? This cannot be undone.`)) return;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/bulk-delete`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ node_ids: ids }),
    });
    if (res.ok) {
      setSelectedNodes(new Map());
      setSelectedNode(null);
      await loadGraph();
    } else alert("Bulk delete failed");
  } catch (e: any) { alert("Failed: " + e.message); } finally { setIsLoading(false); }
};

const handleCommitNode = async (nodeId: string) => {
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/commit`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ node_ids: [nodeId] }),
    });
    if (res.ok) {
      await loadGraph();
      const detailRes = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
        headers: buildAuthHeaders(apiKey, "")
      });
      if (detailRes.ok) {
        setSelectedNode(await detailRes.json());
      }
    } else {
      alert("Failed to commit node");
    }
  } catch (err: any) {
    alert("Failed: " + err.message);
  } finally {
    setIsLoading(false);
  }
};

const handleUpdateNodeMeta = async () => {
  if (!selectedNode) return;
  const nodeId = selectedNode.node_id || selectedNode.id;
  const nextTitle = editedNodeTitle.trim();
  const nextType = editedNodeType.trim();

  const currentWorkspaces = selectedNode.metadata?.workspaces || (selectedNode.metadata?.workspace_id ? [selectedNode.metadata.workspace_id] : []);
  const currentWorkspaceVal = currentWorkspaces[0] || "";
  const currentMatchingWs = Array.isArray(availableWorkspaces) ? availableWorkspaces.find(ws =>
    ws.workspace_id === currentWorkspaceVal ||
    ws.id === currentWorkspaceVal ||
    ws.name === currentWorkspaceVal
  ) : undefined;
  const currentWorkspaceId = currentMatchingWs?.workspace_id || currentMatchingWs?.id || currentWorkspaceVal;

  const isWorkspaceChanged = editedNodeWorkspace !== currentWorkspaceId;

  const payload: Record<string, any> = {};
  if (nextTitle && nextTitle !== (selectedNode.title || "")) payload.title = nextTitle;
  if (nextType && nextType !== selectedNode.node_type) payload.node_type = nextType;

  if (isWorkspaceChanged) {
    payload.metadata = {
      ...(selectedNode.metadata || {}),
      workspaces: editedNodeWorkspace ? [editedNodeWorkspace] : [],
    };
    if (editedNodeWorkspace) {
      payload.metadata.workspace_id = editedNodeWorkspace;
    } else {
      delete payload.metadata.workspace_id;
    }
  }

  if (Object.keys(payload).length === 0) return;

  setIsSavingNodeTitle(true);
  setIsSavingNodeType(true);
  setIsSavingNodeWorkspaces(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
      method: "PUT",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to update node");
      return;
    }
    const updated = await res.json();
    setSelectedNode(updated);
    await loadGraph();
  } catch (err: any) {
    alert(`Failed to update node: ${err.message || String(err)}`);
  } finally {
    setIsSavingNodeTitle(false);
    setIsSavingNodeType(false);
    setIsSavingNodeWorkspaces(false);
  }
};

const handleCommitAll = async () => {
  if (!confirm("Are you sure you want to commit all staged nodes in this workspace?")) return;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/commit`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ workspace_id: "olympus" }),
    });
    if (res.ok) {
      await loadGraph();
    } else {
      alert("Failed to commit all nodes");
    }
  } catch (e: any) {
    alert("Failed: " + e.message);
  } finally {
    setIsLoading(false);
  }
};

const handleDeleteSelected = async () => {
  if (!selectedNode) return;
  const nodeId = selectedNode.node_id || selectedNode.id;
  if (!confirm(`Delete node "${selectedNode.title || nodeId}"? This cannot be undone.`)) return;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(apiKey, ""),
    });
    if (res.ok) {
      setSelectedNode(null);
      await loadGraph();
    } else alert("Delete failed");
  } catch (e: any) { alert("Failed: " + e.message); } finally { setIsLoading(false); }
};

const handleAddNode = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newNodeTitle.trim()) return;
  setIsSubmittingNode(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ title: newNodeTitle, node_type: newNodeType, content: newNodeContent, metadata: { workspaces: ["olympus"] } }),
    });
    if (res.ok) {
      const created = await res.json();
      setNewNodeTitle(""); setNewNodeContent("");
      setIsAddModalOpen(false);
      await loadGraph();
      setSelectedNode(created);
    } else alert("Failed to create node");
  } catch (e: any) { alert(e.message); } finally { setIsSubmittingNode(false); }
};

const handlePurgeGraph = async () => {
  setIsLoading(true);
  try {
    const previewRes = await fetch(`${baseUrl}/api/knowledge/purge-workspace-preview`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ workspace_id: "olympus" }),
    });
    if (!previewRes.ok) {
      alert("Failed to preview purge.");
      return;
    }
    const preview = await previewRes.json();
    const deleteNodeIds: string[] = preview.delete_node_ids || [];
    const graphRes = await fetch(`${baseUrl}/api/knowledge/graph?workspace_id=olympus&slim=true&include_staged=true`, {
      headers: buildAuthHeaders(apiKey, ""),
    });
    const graph = graphRes.ok ? await graphRes.json() : { edges: [] };
    const edgeIds = new Set(
      (graph.edges || [])
        .filter((edge: any) => deleteNodeIds.includes(edge.source_id) || deleteNodeIds.includes(edge.target_id))
        .map((edge: any) => edge.edge_id || `${edge.source_id}:${edge.target_id}:${edge.edge_type || "relates_to"}`)
    );
    const purgeMessage = `I’m going to purge ${preview.to_delete || 0} nodes and ${edgeIds.size} edges.\n\n` +
      `This will delete exclusive nodes and unlink shared nodes for workspace "olympus".\n` +
      `Nodes without edges remain committed. Orphaned edges are not part of this purge.`;
    if (!confirm(purgeMessage)) return;
  } catch (err: any) {
    alert(`Failed to prepare purge: ${err.message || String(err)}`);
    return;
  } finally {
    setIsLoading(false);
  }
  setIsLoading(true);
  try {
    await fetch(`${baseUrl}/api/knowledge/purge-workspace`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ workspace_id: "olympus" }),
    });
    setSelectedNode(null);
    await loadGraph();
  } catch (e: any) { alert("Purge workspace failed: " + e.message); } finally { setIsLoading(false); }
};

const handlePruneGraph = async () => {
  if (!confirm("Are you sure you want to prune dangling edges and orphaned nodes?")) return;
  setIsLoading(true);
  try {
    await fetch(`${baseUrl}/api/knowledge/prune`, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: JSON.stringify({ workspace_id: "olympus" }),
    });
    setSelectedNode(null);
    await loadGraph();
  } catch (e: any) { alert("Prune failed: " + e.message); } finally { setIsLoading(false); }
};

const targetNodeOptions = useMemo(
  () => rawNodes.filter((node) => (node.node_id || node.id) !== selectedNodeId),
  [rawNodes, selectedNodeId],
);
const filteredTargetNodes = useMemo(() => {
  const query = connectTargetQuery.trim().toLowerCase();
  if (!query) return targetNodeOptions;
  return targetNodeOptions.filter((node) =>
    `${node.title || ""} ${node.node_type || ""} ${node.node_id || ""}`.toLowerCase().includes(query)
  );
}, [connectTargetQuery, targetNodeOptions]);
const groupedTargetNodes = useMemo(() => {
  const grouped = filteredTargetNodes.reduce<Record<string, any[]>>((groups, node) => {
    const key = node.node_type || "other";
    (groups[key] ||= []).push(node);
    return groups;
  }, {});
  Object.values(grouped).forEach((nodes) => nodes.sort((left, right) =>
    (left.title || left.node_id).localeCompare(right.title || right.node_id)
  ));
  return grouped;
}, [filteredTargetNodes]);
const connectTypeOrder = ["domain", "service", "library", "technology", "concept", "session", "project", "repo", "client", "insight", "person", "other"];
const selectedConnections = useMemo(() => {
  if (!selectedNodeId) return [];
  return (graphIndex.edgesByNode.get(selectedNodeId) || []).map((edge) => {
    const relatedNodeId = edge.source_id === selectedNodeId ? edge.target_id : edge.source_id;
    return {
      edge_id: edge.edge_id,
      edge_type: edge.edge_type || "relates_to",
      direction: edge.source_id === selectedNodeId ? "outgoing" : "incoming",
      relatedNode: graphIndex.nodesById.get(relatedNodeId),
      relatedNodeId,
    };
  });
}, [graphIndex, selectedNodeId]);
const inferredDomains = useMemo(
  () => selectedNodeId ? inferNodeDomainsFromIndex(selectedNodeId, graphIndex) : [],
  [graphIndex, selectedNodeId],
);

const triggerUpload = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event: any) => {
      try {
        const payload = JSON.parse(event.target.result);
        const diff = buildKnowledgeImportDiff(rawNodes, rawEdges, payload);
        setImportNodes(diff.newNodes.length > 0);
        setImportEdges(diff.newEdges.length > 0);
        setPendingImport(diff);
      } catch (err: any) {
        alert("Invalid knowledge export: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  input.click();
};

const confirmImport = async () => {
  if (!pendingImport) return;
  const nodes = importNodes ? pendingImport.newNodes : [];
  const availableNodeIds = new Set([
    ...rawNodes.map((node) => node.node_id || node.id),
    ...nodes.map((node: any) => node.node_id || node.id),
  ]);
  const edges = importEdges
    ? pendingImport.newEdges.filter(
        (edge: any) => availableNodeIds.has(edge.source_id) && availableNodeIds.has(edge.target_id)
      )
    : [];
  if (nodes.length === 0 && edges.length === 0) {
    alert("No import additions selected.");
    return;
  }

  setIsLoading(true);
  try {
    await importKnowledgePayload(baseUrl, apiKey, { nodes, edges });
    setPendingImport(null);
    alert(`Import successful: ${nodes.length} nodes and ${edges.length} edges added.`);
    await loadGraph();
  } catch (err: any) {
    alert(err.message || "Failed to import knowledge graph.");
  } finally {
    setIsLoading(false);
  }
};

  const triggerDownload = async () => {
  try {
    const selectedIds = Array.from(selectedNodes.keys());
    if (selectedIds.length === 0 && selectedNode) {
      selectedIds.push(selectedNode.node_id || selectedNode.id);
    }
    const exportData = await fetchKnowledgeExportData(baseUrl, apiKey);
    const data = buildKnowledgeExportPayload(exportData, selectedIds);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `savant-knowledge-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) { alert(err.message); }
};

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const query = searchQuery.trim();
      if (query && !searchTags.includes(query)) {
        setSearchTags([...searchTags, query]);
        setSearchQuery("");
      }
    }
  };

  useEffect(() => {
    const handleReload = () => {
      void loadGraph();
    };
    const handleAddNode = () => {
      setIsAddModalOpen(true);
    };
    const handleCommitAllEvent = () => {
      void handleCommitAll();
    };
    const handlePurge = () => {
      void handlePurgeGraph();
    };
    const handleUpload = () => {
      triggerUpload();
    };
    const handleDownload = () => {
      void triggerDownload();
    };
    const handleChatHistory = () => {
      openChatHistory();
    };

    window.addEventListener("knowledge-reload", handleReload);
    window.addEventListener("knowledge-add-node", handleAddNode);
    window.addEventListener("knowledge-commit-all", handleCommitAllEvent);
    window.addEventListener("knowledge-purge", handlePurge);
    window.addEventListener("knowledge-upload", handleUpload);
    window.addEventListener("knowledge-download", handleDownload);
    window.addEventListener("knowledge-chat-history", handleChatHistory);

    return () => {
      window.removeEventListener("knowledge-reload", handleReload);
      window.removeEventListener("knowledge-add-node", handleAddNode);
      window.removeEventListener("knowledge-commit-all", handleCommitAllEvent);
      window.removeEventListener("knowledge-purge", handlePurge);
      window.removeEventListener("knowledge-upload", handleUpload);
      window.removeEventListener("knowledge-download", handleDownload);
      window.removeEventListener("knowledge-chat-history", handleChatHistory);
    };
  }, [apiKey, baseUrl, rawNodes, rawEdges, selectedNode, selectedNodes]);

  const ToolbarButton = ({
    title,
    label,
    onClick,
    children,
    disabled = false,
    className = "",
  }: {
    title: string;
    label: string;
    onClick: () => void;
    children: React.ReactNode;
    disabled?: boolean;
    className?: string;
  }) => (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`p-1 text-muted-foreground hover:text-[var(--cp-cyan)] disabled:opacity-40 transition-all cursor-pointer disabled:cursor-not-allowed ${className}`}
          >
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="bottom" className="px-2 py-1 text-xs z-50 bg-[var(--cp-bg-3)] border border-[var(--cp-border)] text-[var(--cp-cyan)] font-mono">
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );

  useEffect(() => {
    if (restoringChatThreadRef.current) {
      restoringChatThreadRef.current = false;
    } else if (!isThreadBrowserOpen) {
      setDrawerTab("info");
    }
    setEditedNodeTitle(selectedNode?.title || "");
    setEditedNodeType(selectedNode?.node_type || "");
    const workspacesList = selectedNode?.metadata?.workspaces || (selectedNode?.metadata?.workspace_id ? [selectedNode.metadata.workspace_id] : []);
    const workspaceVal = workspacesList[0] || "";
    const matchingWs = Array.isArray(availableWorkspaces) ? availableWorkspaces.find(ws =>
      ws.workspace_id === workspaceVal ||
      ws.id === workspaceVal ||
      ws.name === workspaceVal
    ) : undefined;
    setEditedNodeWorkspace(matchingWs?.workspace_id || matchingWs?.id || workspaceVal);
  }, [selectedNode?.node_id, selectedNode?.id, availableWorkspaces]);

  const loadKnowledgeThreads = async () => {
    setIsLoadingThreads(true);
    try {
      let storedThreads: AthenaThread[] = [];
      try {
        storedThreads = await window.system.loadAthenaThreads();
      } catch (error) {
        console.error("Failed to load database chat threads:", error);
      }
      const knowledgeThreads = new Map<string, AthenaThread>();
      for (const thread of storedThreads) {
        if (thread.kind === "knowledge" && thread.context) {
          knowledgeThreads.set(thread.target_id, thread);
          continue;
        }
        const node = graphIndex.nodesById.get(thread.target_id);
        if (!node) continue;
        const migratedContext = buildKnowledgeChatContextSnapshot({
          selectedNodeId: thread.target_id,
          selectedNodeIds: [],
          focalsByType: { [node.node_type]: [thread.target_id] },
          exploreDepth: 2,
          isExploreActive: true,
          searchQuery: "",
          searchTags: [],
          filterSearch: "",
          typeFilter: null,
          openType: node.node_type,
          is3DMode: false,
        });
        const migratedThread = {
          ...thread,
          title: thread.title || node.title || thread.target_id,
          context: migratedContext,
          kind: "knowledge",
        };
        knowledgeThreads.set(thread.target_id, migratedThread);
        void window.system.saveChatHistory(thread.target_id, thread.messages, {
          title: migratedThread.title,
          context: migratedContext,
          kind: "knowledge",
        });
      }

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(KNOWLEDGE_CHAT_HISTORY_PREFIX)) continue;
        const targetId = key.slice(KNOWLEDGE_CHAT_HISTORY_PREFIX.length);
        try {
          const messages = JSON.parse(localStorage.getItem(key) || "[]");
          if (!Array.isArray(messages) || messages.length === 0) continue;
          const metadataValue = localStorage.getItem(`${KNOWLEDGE_CHAT_THREAD_PREFIX}${targetId}`);
          const metadata = metadataValue ? JSON.parse(metadataValue) : null;
          const node = graphIndex.nodesById.get(targetId);
          const context = metadata?.context || (node
            ? buildKnowledgeChatContextSnapshot({
                selectedNodeId: targetId,
                selectedNodeIds: [],
                focalsByType: { [node.node_type]: [targetId] },
                exploreDepth: 2,
                isExploreActive: true,
                searchQuery: "",
                searchTags: [],
                filterSearch: "",
                typeFilter: null,
                openType: node.node_type,
                is3DMode: false,
              })
            : null);
          if (!context) continue;
          const lastTimestamp = messages[messages.length - 1]?.timestamp;
          knowledgeThreads.set(targetId, {
            target_id: targetId,
            title: metadata?.title || node?.title || targetId,
            context,
            kind: "knowledge",
            messages,
            updated_at: metadata?.updated_at || lastTimestamp || new Date().toISOString(),
          });
        } catch (error) {
          console.error("Failed to restore local knowledge chat thread:", targetId, error);
        }
      }

      setChatThreads(
        [...knowledgeThreads.values()].sort(
          (left, right) => Date.parse(right.updated_at || "") - Date.parse(left.updated_at || ""),
        ),
      );
    } catch (error) {
      console.error("Failed to load knowledge chat threads:", error);
      setChatThreads([]);
    } finally {
      setIsLoadingThreads(false);
    }
  };

  const openChatHistory = () => {
    setIsThreadBrowserOpen(true);
    void loadKnowledgeThreads();
  };

  const restoreChatThread = async (thread: AthenaThread) => {
    const snapshot = thread.context;
    if (!snapshot) {
      alert("This older chat does not contain restorable graph context.");
      return;
    }

    const validNodeIds = new Set(graphIndex.nodesById.keys());
    const restoredFocals = restoreKnowledgeFocals(snapshot, validNodeIds);
    const restoredSelectedNodes = new Map<string, any>();
    for (const nodeId of snapshot.selectedNodeIds || []) {
      const node = graphIndex.nodesById.get(nodeId);
      if (node) restoredSelectedNodes.set(nodeId, node);
    }
    const restoredSelectedNode = snapshot.selectedNodeId
      ? graphIndex.nodesById.get(snapshot.selectedNodeId) || null
      : null;

    if (!restoredSelectedNode && restoredSelectedNodes.size === 0 && Object.keys(restoredFocals).length === 0) {
      alert("The nodes used by this chat are no longer available in the graph.");
      return;
    }

    restoringChatThreadRef.current = true;
    setFocalsByType(restoredFocals);
    setExploreDepth(Math.max(1, snapshot.exploreDepth || 1));
    setIsExploreActive(snapshot.isExploreActive && Object.keys(restoredFocals).length > 0);
    setSearchQuery(snapshot.searchQuery || "");
    setSearchTags(snapshot.searchTags || []);
    setFilterSearch(snapshot.filterSearch || "");
    setTypeFilter(snapshot.typeFilter || null);
    setOpenType(snapshot.openType || null);
    setIs3DMode(Boolean(snapshot.is3DMode));
    setSelectedNodes(restoredSelectedNodes);
    setSelectedNode(restoredSelectedNode as Node | null);
    setChatMessages(thread.messages || []);
    setIsThreadBrowserOpen(false);
    setDrawerTab("ai");
    setIsInspectorOpen(true);
    setIsFilterPaneOpen(false);
    window.setTimeout(() => {
      restoringChatThreadRef.current = false;
    }, 0);

    if (restoredSelectedNode) {
      try {
        const nodeId = restoredSelectedNode.node_id || restoredSelectedNode.id;
        const response = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
          headers: buildAuthHeaders(apiKey, ""),
        });
        if (response.ok) setSelectedNode(await response.json());
      } catch (error) {
        console.error("Failed to restore selected node details:", error);
      }
    }
  };

  const deleteChatThread = async (threadId: string) => {
    await window.system.clearChatHistory(threadId);
    localStorage.removeItem(`${KNOWLEDGE_CHAT_HISTORY_PREFIX}${threadId}`);
    localStorage.removeItem(`${KNOWLEDGE_CHAT_THREAD_PREFIX}${threadId}`);
    setChatThreads((threads) => threads.filter((thread) => thread.target_id !== threadId));
  };

  const persistLocalKnowledgeThread = (
    targetId: string,
    messages: ChatMessage[],
    title: string,
    context: KnowledgeChatContextSnapshot,
  ) => {
    localStorage.setItem(`${KNOWLEDGE_CHAT_HISTORY_PREFIX}${targetId}`, JSON.stringify(messages));
    localStorage.setItem(`${KNOWLEDGE_CHAT_THREAD_PREFIX}${targetId}`, JSON.stringify({
      target_id: targetId,
      title,
      context,
      kind: "knowledge",
      updated_at: new Date().toISOString(),
    }));
  };

  useEffect(() => {
    if (!activeChatScopeId) return;
    const nodeId = activeChatScopeId;
    let active = true;

    window.system.getChatHistory(nodeId).then((history) => {
      if (!active) return;
      if (history && history.length > 0) {
        setChatMessages(history);
        window.system.saveChatHistory(nodeId, history, {
          title: currentChatTitle,
          context: currentChatContext,
          kind: "knowledge",
        }).catch(console.error);
      } else {
        // Fallback to localStorage and migrate to database
        const key = `${KNOWLEDGE_CHAT_HISTORY_PREFIX}${nodeId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setChatMessages(parsed);
            persistLocalKnowledgeThread(nodeId, parsed, currentChatTitle, currentChatContext);
            window.system.saveChatHistory(nodeId, parsed, {
              title: currentChatTitle,
              context: currentChatContext,
              kind: "knowledge",
            }).catch(console.error);
          } catch (e) {
            setChatMessages([]);
          }
        } else {
          setChatMessages([]);
        }
      }
    }).catch((err) => {
      console.error("Failed to load chat history from DB:", err);
      if (!active) return;
      const key = `${KNOWLEDGE_CHAT_HISTORY_PREFIX}${nodeId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          setChatMessages(JSON.parse(stored));
        } catch (e) {
          setChatMessages([]);
        }
      } else {
        setChatMessages([]);
      }
    });

    return () => {
      active = false;
    };
  }, [activeChatScopeId]);

  const saveChatMessages = (newMessages: ChatMessage[]) => {
    setChatMessages(newMessages);
    if (activeChatScopeId) {
      const nodeId = activeChatScopeId;
      persistLocalKnowledgeThread(nodeId, newMessages, currentChatTitle, currentChatContext);
      window.system.saveChatHistory(nodeId, newMessages, {
        title: currentChatTitle,
        context: currentChatContext,
        kind: "knowledge",
      }).catch((err) => {
        console.error("Failed to save chat history to database:", err);
      });
    }
  };

  useEffect(() => {
    if (chatEndRef.current && typeof chatEndRef.current.scrollIntoView === "function") {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isAiLoading, drawerTab]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAiLoading || !activeChatScopeId) return;

    const activeNode = selectedNode;
    const activeNodeId = activeChatScopeId;
    const activeThreadContext = currentChatContext;
    const activeThreadTitle = currentChatTitle;
    const userText = chatInput;
    setChatInput("");

    const key = `${KNOWLEDGE_CHAT_HISTORY_PREFIX}${activeNodeId}`;
    let currentMessages: ChatMessage[] = chatMessages;
    try {
      const dbHistory = await window.system.getChatHistory(activeNodeId);
      if (dbHistory && dbHistory.length > 0) {
        currentMessages = dbHistory;
      } else {
        const stored = localStorage.getItem(key);
        if (stored) {
          currentMessages = JSON.parse(stored);
        }
      }
    } catch (err) {}

    const updatedMessages: ChatMessage[] = [
      ...currentMessages,
      { id: Math.random().toString(), sender: "user", text: userText, timestamp: new Date().toISOString() }
    ];

    if (activeChatScopeId === activeNodeId) {
      setChatMessages(updatedMessages);
    }
    persistLocalKnowledgeThread(activeNodeId, updatedMessages, activeThreadTitle, activeThreadContext);
    window.system.saveChatHistory(activeNodeId, updatedMessages, {
      title: activeThreadTitle,
      context: activeThreadContext,
      kind: "knowledge",
    }).catch(console.error);
    setIsAiLoading(true);

    try {
      let provider = "gemini";
      let model = "3.5";
      try {
        const s = await window.system.getSettings();
        const chain = s?.["provider:chain"] || [];
        if (chain.length > 0) {
          provider = chain[0].provider;
          model = chain[0].model;
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }

      const isFilteredChat = Boolean(activeFilteredContext);
      const adj = graphIndex.adjacency;
      const distances = isFilteredChat
        ? new Map(activeFilteredContext!.nodes.map((node) => [node.node_id, 0]))
        : bfs(new Set([activeNodeId]), exploreDepth, adj);
      const neighborNodes = isFilteredChat
        ? activeFilteredContext!.nodes
        : rawNodes.filter(n => n.node_id !== activeNodeId && distances.has(n.node_id));
      const neighborEdges = isFilteredChat
        ? activeFilteredContext!.edges
        : rawEdges.filter(e => distances.has(e.source_id) && distances.has(e.target_id));

      const neighborsText = neighborNodes.map(n => {
        const dist = distances.get(n.node_id);
        return `- Neighbor Node (Distance: ${dist} hops): ID=${n.node_id}, Title="${n.title || "Untitled"}", Type=${n.node_type.toUpperCase()}, Status=${n.status || "unknown"}, Content="${n.content || ""}"`;
      }).join("\n");

      const edgesText = neighborEdges.map(e =>
        `- Edge: ${e.source_id} --[${e.edge_type || "relates_to"}]--> ${e.target_id}`
      ).join("\n");

      const promptPayload = `You are an AI assistant integrated into the Savant Olympus app.
The user is asking questions about a node in the Knowledge Graph and its neighborhood context.

[INSTRUCTIONS FOR THE AGENT]
- Use the provided graph nodes, adjacent relationships, and edges to reference and understand the underlying LOGIC, facts, code architecture, and software relationships they represent.
- Answer the user's question directly by focusing on these logical relationships, engineering logic, facts, and code concepts.
- Do NOT talk about the layout, visual structure, node IDs, edge weights, or graph theory terminology unless explicitly requested. Speak in terms of actual code architecture, functionalities, and logical concepts.

[${isFilteredChat ? "FILTERED GRAPH CONTEXT" : "SELECTED NODE"}]
- ID: ${activeNodeId}
- Type: ${isFilteredChat ? "FILTERED NODE SET" : (activeNode?.node_type || "unknown").toUpperCase()}
- Title: ${isFilteredChat ? `${neighborNodes.length} Filtered Nodes` : activeNode?.title || "Untitled"}
- Status: ${isFilteredChat ? "active filter result" : activeNode?.status || "unknown"}
- Content: ${isFilteredChat ? "Use every filtered node and edge listed below as the complete chat context." : activeNode?.content || "No content available."}

[NEIGHBORHOOD SETTINGS]
- Neighborhood Depth (Hops): ${exploreDepth}
- Total Neighbor Nodes: ${neighborNodes.length}
- Total Connection Edges: ${neighborEdges.length}

[NEIGHBORS WITHIN ${exploreDepth} HOPS]
${neighborsText || "No adjacent neighbors found within this depth."}

[CONNECTION EDGES]
${edgesText || "No connection edges found within this depth."}

[CONVERSATION HISTORY]
${updatedMessages.length > 0 ?
  updatedMessages.map(msg => `${msg.sender === "user" ? "User" : "AI"}: ${msg.text}`).join("\n")
  : "No previous messages in this conversation."
}

[NEW USER QUESTION]
${userText}

Please analyze the node information, the neighboring nodes, and the connection edges, and provide a helpful, technical response answering the user's question.`;

      const responseText = await window.ipcRenderer.invoke("run-agent", {
        provider,
        model,
        prompt: await buildAthenaAugmentedPrompt(
          promptPayload,
          isFilteredChat
            ? `${neighborNodes.map((node) => `${node.title || ""} ${node.content || ""}`).join(" ")} ${userText}`
            : `${activeNode?.title || ""} ${userText} ${activeNode?.content || ""}`
        )
      });

      const latestStored = localStorage.getItem(key);
      let latestMessages: ChatMessage[] = updatedMessages;
      try {
        const dbHistory = await window.system.getChatHistory(activeNodeId);
        if (dbHistory && dbHistory.length > 0) {
          latestMessages = dbHistory;
        } else if (latestStored) {
          latestMessages = JSON.parse(latestStored);
        }
      } catch (e) {}

      const finalMessages: ChatMessage[] = [
        ...latestMessages,
        { id: Math.random().toString(), sender: "assistant", text: responseText || "No response received from the gateway.", timestamp: new Date().toISOString() }
      ];

      persistLocalKnowledgeThread(activeNodeId, finalMessages, activeThreadTitle, activeThreadContext);
      window.system.saveChatHistory(activeNodeId, finalMessages, {
        title: activeThreadTitle,
        context: activeThreadContext,
        kind: "knowledge",
      }).catch(console.error);
      if (activeChatScopeId === activeNodeId) {
        setChatMessages(finalMessages);
      }
    } catch (err: any) {
      console.error("AI run-agent failed:", err);
      const latestStored = localStorage.getItem(key);
      let latestMessages: ChatMessage[] = updatedMessages;
      try {
        const dbHistory = await window.system.getChatHistory(activeNodeId);
        if (dbHistory && dbHistory.length > 0) {
          latestMessages = dbHistory;
        } else if (latestStored) {
          latestMessages = JSON.parse(latestStored);
        }
      } catch (e) {}
      const errorMessages: ChatMessage[] = [
        ...latestMessages,
        { id: Math.random().toString(), sender: "assistant", text: `Error: ${err.message || "Failed to communicate with AI agent."}`, timestamp: new Date().toISOString() }
      ];
      persistLocalKnowledgeThread(activeNodeId, errorMessages, activeThreadTitle, activeThreadContext);
      window.system.saveChatHistory(activeNodeId, errorMessages, {
        title: activeThreadTitle,
        context: activeThreadContext,
        kind: "knowledge",
      }).catch(console.error);
      if (activeChatScopeId === activeNodeId) {
        setChatMessages(errorMessages);
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    void loadGraph();
    return () => {
      graphLoadIdRef.current += 1;
      simulationRef.current?.stop();
    };
  }, [baseUrl, apiKey, is3DMode]);

const hasInspectorContext = Boolean(activeFilteredContext || selectedNodes.size >= 2 || selectedNode);
const showInspectorRail = hasInspectorContext;

return (
  <div className="h-full min-h-0 flex flex-col overflow-hidden bg-[var(--cp-bg-0)] p-4 gap-4">
    <div className="flex justify-between items-center bg-[var(--cp-bg-1)] border border-[var(--cp-border)] p-3 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">Knowledge Network</span>
        <div className="flex flex-col">
          <div className="relative">
            <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2 py-1">
              <Search size={12} className="text-muted-foreground" />
              <input
                type="text"
                placeholder="Find knowledge node..."
                value={searchQuery}
                onKeyDown={handleSearchKeyDown}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs font-mono focus:outline-none w-48 text-foreground"
              />
            </div>
            {searchQuery.trim().length >= 4 && (
              <div className="absolute left-0 right-0 mt-1 bg-[var(--cp-bg-1)] border border-[var(--cp-border)] z-30 max-h-48 overflow-y-auto shadow-2xl">
                {searchResults.map((n) => (
                  <div
                    key={n.node_id}
                    onClick={async () => {
                      setSelectedNodes(new Map());
                      if (n.node_type === "domain") {
                        setSearchTags((current) => current.includes(n.title) ? current : [...current, n.title]);
                        await selectNodeById(n.node_id);
                        setSearchQuery("");
                        return;
                      }
                      setSelectedNode(n);
                      handleExploreNode(n.node_id);
                      try {
                        const res = await fetch(`${baseUrl}/api/knowledge/nodes/${n.node_id}`, { headers: buildAuthHeaders(apiKey, "") });
                        if (res.ok) setSelectedNode(await res.json());
                      } catch (e) { console.error(e); }
                      setSearchQuery("");
                    }}
                    className="px-2.5 py-1.5 border-b border-[var(--cp-border)]/40 hover:bg-[var(--cp-cyan)]/10 text-xs font-mono cursor-pointer truncate text-foreground"
                  >
                    {n.title}
                  </div>
                ))}
              </div>
            )}
          </div>
          {searchTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 max-w-xs">
              {searchTags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 text-[9px] font-mono bg-[var(--cp-cyan)]/10 text-[var(--cp-cyan)] border border-[var(--cp-cyan)]/25 px-1.5 py-0.5 rounded">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setSearchTags(searchTags.filter(t => t !== tag))}
                    className="hover:text-white font-bold cursor-pointer ml-0.5 text-muted-foreground"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-0.5">
            <button
              type="button"
              onClick={() => setIs3DMode(!is3DMode)}
              className={`px-2 py-1 text-[10px] uppercase font-mono transition-all cursor-pointer flex items-center gap-1.5 ${is3DMode ? "bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Box size={12} /> {is3DMode ? "3D VIEW" : "2D VIEW"}
            </button>
            <button
              type="button"
              onClick={() => zoomInRef.current()}
              className="px-2 py-1 text-[10px] text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer flex items-center justify-center border-l border-[var(--cp-border)]/50"
              title="Zoom In"
            >
              <ZoomIn size={12} />
            </button>
            <button
              type="button"
              onClick={() => zoomOutRef.current()}
              className="px-2 py-1 text-[10px] text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer flex items-center justify-center border-l border-[var(--cp-border)]/50"
              title="Zoom Out"
            >
              <ZoomOut size={12} />
            </button>
            <button
              type="button"
              onClick={() => fitToGraphRef.current()}
              className="px-2 py-1 text-[10px] text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer flex items-center justify-center border-l border-[var(--cp-border)]/50"
              title="Fit to Graph (F)"
            >
              <Maximize size={12} />
            </button>
          </div>
        <div className="flex items-center gap-1.5 bg-blue-950/40 border border-blue-700/60 px-2.5 py-1 rounded">
            <span className="text-[10px] font-mono text-blue-400 font-bold">EXPLORE</span>
            <span className="text-[9px] text-blue-300 font-mono">{rawNodes.length} Nodes · {rawEdges.length} Edges</span>
        </div>
      </div>
    </div>
    <div className="flex-1 min-h-0 overflow-hidden flex gap-0">
      {/* Left sidebar: domain selector + node type cloud */}
      <div className={`${isFilterPaneOpen ? "w-56 gap-2" : "w-11 gap-0"} shrink-0 flex flex-col overflow-hidden transition-all duration-200`}>
        <div className="flex items-center justify-between border border-[var(--cp-border)] bg-[var(--cp-bg-1)] px-2 py-1.5 shrink-0">
          {isFilterPaneOpen && (
            <h3 className="text-xs uppercase text-[var(--section-label)] tracking-wider font-mono">
              Explore filters
            </h3>
          )}
          <button
            type="button"
            onClick={toggleFilterPane}
            title={isFilterPaneOpen ? "Collapse explore filters" : "Expand explore filters"}
            aria-label={isFilterPaneOpen ? "Collapse explore filters" : "Expand explore filters"}
            className="h-6 w-6 inline-flex items-center justify-center border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
          >
            {isFilterPaneOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
          </button>
        </div>
        {isFilterPaneOpen ? (
          <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
        <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-1.5 py-1 shrink-0">
          <Search size={10} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Filter all node types..."
            value={filterSearch}
            onChange={(event) => setFilterSearch(event.target.value)}
            className="bg-transparent text-[10px] font-mono focus:outline-none w-full text-foreground"
          />
          {filterSearch && (
            <button
              type="button"
              onClick={() => setFilterSearch("")}
              className="text-muted-foreground hover:text-foreground text-[9px] cursor-pointer"
              aria-label="Clear explore filter"
            >
              ✕
            </button>
          )}
        </div>
        {(() => {
          // Compute per-panel "allowed" sets: for panel X, intersect BFS-reachable
          // sets from every OTHER active type-bucket. This hides options that
          // couldn't survive the current AND-across-types filter.
          const allowedForPanel = (panelType: string) =>
            filterReachability.allowedByType.get(panelType) || null;
          return (
            <>
              {/* Per-type filter panels — one panel per node type present in the graph */}
              {KNOWLEDGE_NODE_TYPES.map((nodeType) => {
                const allTypeNodes = sortedNodesByType.get(nodeType) || [];
                if (allTypeNodes.length === 0) return null;
                const allowed = allowedForPanel(nodeType);
                const selectedInType = focalsByType[nodeType] || new Set<string>();
                const typeNodes = sidebarNodesByType.get(nodeType) || [];
                if (typeNodes.length === 0) return null;
                const isOpen = openType === nodeType;
                const palette = ["#38bdf8","#a78bfa","#4ade80","#f87171","#fb923c","#fbbf24","#e879f9","#34d399"];
                return (
                  <div key={nodeType} className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2">
                    <button
                      type="button"
                      onClick={() => setOpenType(prev => prev === nodeType ? null : nodeType)}
                      className="w-full flex items-center justify-between mb-2 px-0.5 cursor-pointer group"
                    >
                      <div className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-widest group-hover:text-foreground">
                        {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        <span>{nodeType}s</span>
                        <span className="opacity-60">
                          ({typeNodes.length}{allowed ? `/${allTypeNodes.length}` : ""})
                        </span>
                      </div>
                      {selectedInType.size > 0 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocalsByType(prev => {
                              const next = { ...prev };
                              delete next[nodeType];
                              if (Object.keys(next).length === 0) setIsExploreActive(false);
                              return next;
                            });
                          }}
                          className="text-[9px] font-mono text-[var(--cp-cyan)] hover:text-white cursor-pointer"
                        >
                          ✕ ({selectedInType.size})
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div className="max-h-64 overflow-y-auto">
                          {typeNodes.map((n) => {
                              const idx = nodePositionByType.get(nodeType)?.get(n.node_id || n.id) || 0;
                              const color = palette[idx % palette.length];
                              const isActive = selectedInType.has(n.node_id);
                              return (
                                <label
                                  key={n.node_id}
                                  className={`w-full text-left px-2 py-1.5 mb-0.5 text-[10px] font-mono flex items-center gap-1.5 transition-all cursor-pointer border ${isActive ? "border-current bg-white/5" : "border-transparent hover:bg-white/5"}`}
                                  style={{ color }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={() => toggleFocalNode(n.node_id)}
                                    className="w-3 h-3 shrink-0 cursor-pointer accent-current"
                                    style={{ accentColor: color }}
                                  />
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                                  <span className="truncate">{n.title || n.node_id}</span>
                                </label>
                              );
                            })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}

        {/* Visible-nodes panel — appears only when at least one filter is active */}
        {(() => {
          if (filterReachability.activeEntries.length === 0) return null;
          const visible = filterReachability.visibleNodes;
          if (visible.length === 0) return null;
          const typeColors: Record<string, string> = {
            domain: "#38bdf8", service: "#38bdf8", library: "#e879f9", technology: "#4ade80",
            concept: "#a78bfa", session: "#94a3b8", person: "#fb923c", insight: "#fbbf24",
            client: "#34d399", project: "#60a5fa", repo: "#f472b6", issue: "#f87171",
          };
          return (
            <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-2">
              <div className="flex items-center justify-between mb-2 px-0.5">
                <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
                  Visible <span className="opacity-60">({visible.length})</span>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {visible.map((n) => {
                  const color = typeColors[n.node_type] || "#6b7280";
                  const isSelected = selectedNode?.node_id === n.node_id;
                  return (
                    <button
                      key={n.node_id}
                      type="button"
                      onClick={() => selectNodeById(n.node_id)}
                      className={`w-full text-left px-2 py-1 mb-0.5 text-[10px] font-mono flex items-center gap-1.5 cursor-pointer border ${isSelected ? "border-current bg-white/5" : "border-transparent hover:bg-white/5"}`}
                      style={{ color }}
                      title={n.title || n.node_id}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="truncate flex-1">{n.title || n.node_id}</span>
                      <span className="opacity-40 text-[8px] shrink-0">{n.node_type}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}
          </div>
        ) : (
          <div className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex items-center justify-center">
            <span className="font-mono text-[10px] text-[var(--cp-cyan)] [writing-mode:vertical-rl] rotate-180 tracking-widest">
              FILTER
            </span>
          </div>
        )}
      </div>

      {/* Graph canvas */}
      <div className="flex-1 min-w-0 relative">
      <div
        ref={containerRef}
        className="absolute top-0 bottom-0 left-0 border border-[var(--cp-border)] bg-[linear-gradient(180deg,rgba(10,14,24,0.96),rgba(16,22,36,0.96))] overflow-hidden transition-[right] duration-200"
        style={{
          right: showInspectorRail
            ? (isInspectorOpen ? "min(34rem, 46vw)" : "2.75rem")
            : 0,
        }}
      >
        {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/25 z-10 text-xs font-mono text-[var(--cp-cyan)] animate-pulse">SYNCING_VECTORS...</div>}
        <svg ref={svgRef} id="kb-graph-svg" className="w-full h-full cursor-grab active:cursor-grabbing" />
        {isExploreActive && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-[var(--cp-bg-1)] border border-[var(--cp-cyan)] rounded shadow-2xl font-mono text-xs z-20">
            <span className="text-[var(--section-label)] font-bold uppercase tracking-wider">DEPTH</span>
            <button onClick={() => setExploreDepth((d) => Math.max(1, d - 1))} className="w-5 h-5 flex items-center justify-center bg-[var(--cp-bg-2)] border border-[var(--cp-border)] hover:bg-[var(--cp-bg-3)] rounded font-bold cursor-pointer">-</button>
            <span className="text-foreground font-bold px-1">{exploreDepth}</span>
            <button onClick={() => setExploreDepth((d) => d + 1)} className="w-5 h-5 flex items-center justify-center bg-[var(--cp-bg-2)] border border-[var(--cp-border)] hover:bg-[var(--cp-bg-3)] rounded font-bold cursor-pointer">+</button>
            <button onClick={clearExploreMode} className="ml-2 px-2 py-0.5 border border-red-950 text-red-500 rounded bg-red-950/20 hover:bg-red-900/40 text-[10px] cursor-pointer">✕ CLEAR</button>
          </div>
        )}
      </div>
      {showInspectorRail && (
        <div
          className={`absolute top-0 right-0 bottom-0 ${isInspectorOpen ? "" : "w-11"} border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden z-20 shadow-2xl transition-all duration-200`}
          style={isInspectorOpen ? { width: "min(34rem, 46vw)" } : undefined}
        >
          <div className={`flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] ${isInspectorOpen ? "px-4 py-3" : "px-2 py-1.5"} items-center justify-between`}>
            {isInspectorOpen && (
              <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--section-label)]">
                {activeFilteredContext ? "Filtered Context" : selectedNodes.size >= 2 ? `Merge ${selectedNodes.size} Nodes` : "Node Details"}
              </span>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleInspector}
                title={isInspectorOpen ? "Collapse node details" : "Expand node details"}
                aria-label={isInspectorOpen ? "Collapse node details" : "Expand node details"}
                className="h-6 w-6 inline-flex items-center justify-center border border-[var(--cp-border)] text-[var(--cp-cyan)] hover:bg-[rgba(0,229,255,0.08)]"
              >
                {isInspectorOpen ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
              </button>
              {isInspectorOpen && (
                <button onClick={() => { setSelectedNode(null); setSelectedNodes(new Map()); setIsInspectorOpen(false); }} className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer">✕</button>
              )}
            </div>
          </div>
          {isInspectorOpen && selectedNodes.size === 0 && (selectedNode || activeFilteredContext) && (
            <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
              <button
                onClick={() => setDrawerTab("info")}
                className={`flex-1 py-2 text-center font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer border-r border-[var(--cp-border)] ${
                  drawerTab === "info" ? "bg-[var(--cp-bg-1)] text-[var(--cp-cyan)] border-b-2 border-b-[var(--cp-cyan)]" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {activeFilteredContext ? "// List of Nodes" : "// Node Info"}
              </button>
              <button
                onClick={() => setDrawerTab("ai")}
                className={`flex-1 py-2 text-center font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
                  drawerTab === "ai" ? "bg-[var(--cp-bg-1)] text-[var(--cp-cyan)] border-b-2 border-b-[var(--cp-cyan)]" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                // Ask ATHENA
              </button>
            </div>
          )}
          {isInspectorOpen ? (!activeFilteredContext && selectedNodes.size >= 2 && isAdmin ? (
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-4 font-mono text-xs">
                <div className="text-[10px] text-muted-foreground">⌘/Ctrl+Click to multiselect. First node is survivor.</div>
                <div className="space-y-1 bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] max-h-48 overflow-y-auto">
                  {Array.from(selectedNodes.values()).map((n, i) => (
                    <div key={n.node_id} className="flex justify-between items-center gap-2 border-b border-[var(--cp-border)]/30 py-1 last:border-b-0">
                      <span className="truncate flex-1 text-foreground/80">{n.title || n.id}</span>
                      {i === 0 ? <span className="text-[8px] text-[var(--cp-cyan)] uppercase border border-[var(--cp-cyan)]/30 px-1 rounded">Survivor</span> : (
                        <button onClick={() => { setSelectedNodes((prev) => { const next = new Map(prev); next.delete(n.node_id); if (next.size === 1) setSelectedNode(Array.from(next.values())[0]); return next; }); }} className="text-red-400 text-[9px]">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleMergeSubmit} className="space-y-3 pt-2 border-t border-[var(--cp-border)]/30">
                  <h4 className="text-[10px] text-muted-foreground uppercase font-bold">TARGET TYPE</h4>
                  <select value={mergeNodeType} onChange={(e) => setMergeNodeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">
                    {KNOWLEDGE_NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="submit" className="w-full py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 flex items-center justify-center gap-1"><GitFork size={12} />Merge Nodes</button>
                </form>
                <div className="space-y-3 pt-4 border-t border-[var(--cp-border)]/30">
                  <h4 className="text-[10px] text-muted-foreground uppercase font-bold">LINK TO WORKSPACE</h4>
                  <select
                    value={bulkWorkspace}
                    onChange={(e) => setBulkWorkspace(e.target.value)}
                    className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs"
                  >
                    <option value="">No Workspace</option>
                    {Array.isArray(availableWorkspaces) && availableWorkspaces.map((ws) => (
                      <option key={ws.workspace_id || ws.id} value={ws.workspace_id || ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={handleBulkApplyWorkspace} className="w-full py-1.5 bg-[var(--cp-cyan)]/20 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] font-bold text-xs uppercase hover:bg-[var(--cp-cyan)]/30 flex items-center justify-center gap-1"><Plus size={12} />Apply Workspace</button>
                </div>
                <div className="space-y-3 pt-4 border-t border-[var(--cp-border)]/30">
                  <h4 className="text-[10px] text-muted-foreground uppercase font-bold">LINK TO OTHER NODE</h4>
                  <button onClick={() => { setConnectTargetIds([]); setConnectTargetQuery(""); setIsConnectModalOpen(true); }} className="w-full py-1.5 bg-[var(--cp-cyan)]/20 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] font-bold text-xs uppercase hover:bg-[var(--cp-cyan)]/30 flex items-center justify-center gap-1.5"><GitFork size={12} />Connect Selected to Other...</button>
                </div>
                <div className="space-y-3 pt-4 border-t border-[var(--cp-border)]/30">
                  <h4 className="text-[10px] text-muted-foreground uppercase font-bold">BULK CONNECT SURVIVOR</h4>
                  <select value={bulkEdgeType} onChange={(e) => setBulkEdgeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 font-mono text-xs">
                    {["relates_to", "learned_from", "uses", "depends_on", "built_with"].map((et) => <option key={et} value={et}>{et.replace(/_/g, " ")}</option>)}
                  </select>
                  <button onClick={handleBulkConnect} className="w-full py-1.5 bg-[var(--cp-cyan)]/20 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] font-bold text-xs uppercase hover:bg-[var(--cp-cyan)]/30 flex items-center justify-center gap-1"><Plus size={12} />Connect Survivor to Others</button>
                </div>
                <div className="pt-4 border-t border-[var(--cp-border)]/30"><button onClick={handleBulkDelete} className="w-full py-1.5 bg-red-950/20 border border-red-500/30 text-red-400 font-bold text-xs uppercase hover:bg-red-950/40 flex items-center justify-center gap-1"><Trash2 size={12} />Delete Selected</button></div>
              </div>
            </div>
          ) : (
            drawerTab === "info" ? (
              activeFilteredContext ? (
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-3 font-mono">
                    <div className="text-xs text-[var(--cp-cyan)] uppercase tracking-wider">Filtered Graph Context</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {activeFilteredContext.nodes.length} nodes · {activeFilteredContext.edges.length} edges
                    </div>
                  </div>
                  <div className="space-y-1">
                    {activeFilteredContext.nodes.map((node) => (
                      <div key={node.node_id} className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-3 py-2 font-mono">
                        <div className="text-xs text-foreground">{node.title || node.node_id}</div>
                        <div className="text-[9px] text-muted-foreground uppercase mt-0.5">{node.node_type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
              <>
                <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-4">
                  <div className="border-b border-[var(--cp-border)] pb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono text-[var(--cp-cyan)] uppercase bg-[rgba(0,229,255,0.06)] px-1.5 py-0.5 border border-[var(--cp-cyan)]/20 rounded">{selectedNode!.node_type}</span>
                      {inferredDomains.map(({ node: domain, distance }) => (
                        <span
                          key={domain.node_id || domain.id}
                          title={distance === 0 ? "Selected domain" : `Inferred ${distance} hop${distance === 1 ? "" : "s"} away`}
                          className="text-[9px] font-mono text-violet-300 uppercase bg-violet-950/20 px-1.5 py-0.5 border border-violet-500/25 rounded"
                        >
                          DOMAIN: {domain.title || domain.node_id}
                        </span>
                      ))}
                    </div>
                    {selectedNode!.status === "staged" ? <span className="text-[9px] font-mono text-yellow-500 uppercase bg-yellow-950/20 px-1 border border-yellow-500/20 rounded">staged</span> : <span className="text-[9px] font-mono text-green-500 uppercase bg-green-950/20 px-1 border border-green-500/20 rounded">committed</span>}
                  </div>
                  {isAdmin && <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">NODE TITLE</label>
                    <input
                      value={editedNodeTitle}
                      onChange={(e) => setEditedNodeTitle(e.target.value)}
                      className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                      placeholder="Node title"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">NODE TYPE</label>
                    <select
                      value={editedNodeType}
                      onChange={(e) => setEditedNodeType(e.target.value)}
                      className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                    >
                      {KNOWLEDGE_NODE_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">WORKSPACE</label>
                    <select
                      value={editedNodeWorkspace}
                      onChange={(e) => setEditedNodeWorkspace(e.target.value)}
                      className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                    >
                      <option value="">No Workspace</option>
                      {Array.isArray(availableWorkspaces) && availableWorkspaces.map((ws) => (
                        <option key={ws.workspace_id || ws.id} value={ws.workspace_id || ws.id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleUpdateNodeMeta}
                      disabled={
                        ((!editedNodeTitle.trim() || editedNodeTitle.trim() === (selectedNode!.title || "")) &&
                         (!editedNodeType.trim() || editedNodeType.trim() === selectedNode!.node_type) &&
                         (editedNodeWorkspace === (
                           (() => {
                             const currentWorkspaces = selectedNode!.metadata?.workspaces || (selectedNode!.metadata?.workspace_id ? [selectedNode!.metadata.workspace_id] : []);
                             const currentVal = currentWorkspaces[0] || "";
                             const match = Array.isArray(availableWorkspaces) ? availableWorkspaces.find(ws => ws.workspace_id === currentVal || ws.id === currentVal || ws.name === currentVal) : undefined;
                             return match?.workspace_id || match?.id || currentVal;
                           })()
                         ))) ||
                        isSavingNodeTitle || isSavingNodeType || isSavingNodeWorkspaces
                      }
                      className="w-full py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 font-mono"
                    >
                      {(isSavingNodeTitle || isSavingNodeType || isSavingNodeWorkspaces) ? "Saving..." : "Update Details"}
                    </button>
                  </div>
                  </>}
                  <div>
                    <h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">CONNECTIONS</h4>
                    {selectedConnections.length ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {selectedConnections.map((connection) => (
                          <div key={connection.edge_id || `${connection.edge_type}-${connection.relatedNodeId}`} className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-3 py-2 text-xs font-mono">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[var(--section-label)] uppercase">{connection.edge_type.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-muted-foreground uppercase">{connection.direction}</span>
                            </div>
                            <div className="mt-1 text-foreground/80 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => void selectNodeById(connection.relatedNodeId)}
                                className="text-left hover:text-[var(--cp-cyan)] cursor-pointer"
                                aria-label={`Go to ${connection.relatedNode?.title || connection.relatedNodeId}`}
                              >
                                <span className="font-bold underline decoration-transparent hover:decoration-current">
                                  {connection.relatedNode?.title || connection.relatedNodeId}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  [{connection.relatedNode?.node_type || "unknown"}]
                                </span>
                              </button>
                              {isAdmin && <button
                                onClick={() =>
                                  handleDeleteEdge(
                                    connection.edge_id,
                                    connection.direction === "outgoing" ? (selectedNode!.node_id || selectedNode!.id) : connection.relatedNodeId,
                                    connection.direction === "outgoing" ? connection.relatedNodeId : (selectedNode!.node_id || selectedNode!.id),
                                    connection.edge_type
                                  )
                                }
                                className="text-red-400 hover:text-red-500 font-mono text-[9px] uppercase hover:bg-red-950/20 px-1 border border-red-500/20 rounded shrink-0 cursor-pointer"
                                title="Remove connection edge"
                              >
                                Remove
                              </button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-muted-foreground bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-3 py-2">
                        No connections found for this node.
                      </div>
                    )}
                  </div>
                  {selectedNode!.content && (
                    <div>
                      <h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">CONTENT</h4>
                      <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] max-h-96 overflow-y-auto">{selectedNode!.content}</pre>
                    </div>
                  )}
                  {selectedNode!.metadata?.source && (<div><h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">SOURCE</h4><p className="text-xs text-foreground/70">{selectedNode!.metadata.source}</p></div>)}
                  {isAdmin && selectedNode!.status === "staged" && (
                    <div className="pt-2">
                      <button onClick={() => handleCommitNode(selectedNode!.node_id || selectedNode!.id)} className="w-full py-2 bg-green-600 text-white font-bold text-xs uppercase hover:bg-green-700 flex items-center justify-center gap-1.5 font-mono text-[10px]"><Check size={14} />COMMIT_NODE</button>
                    </div>
                  )}
                  {isAdmin && <div className="pt-2">
                    <button onClick={() => { setConnectTargetIds([]); setConnectTargetQuery(""); setIsConnectModalOpen(true); }} className="w-full py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 flex items-center justify-center gap-1.5"><GitFork size={14} />CONNECT_NODE</button>
                  </div>}
                </div>
              </div>
              {isAdmin && <div className="p-4 border-t border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
                <button onClick={handleDeleteSelected} disabled={!selectedNode} title="Delete" className="w-full py-2 border border-red-500/30 text-red-500 disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase hover:bg-red-950/20"><Trash2 size={14} />DELETE_NODE</button>
              </div>}
            </>
            )) : (
              <div className="flex flex-col h-full overflow-hidden">
                {chatMessages.length > 0 && (
                  <div className="shrink-0 border-b border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Export conversation</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void handleExportConversation("html")} title="Download conversation as HTML" aria-label="Download conversation as HTML" className="p-1.5 border border-[var(--cp-border)] text-muted-foreground hover:text-[var(--cp-cyan)]">
                        <FileCode2 size={12} />
                      </button>
                      <button type="button" onClick={() => void handleExportConversation("pdf")} title="Download conversation as PDF" aria-label="Download conversation as PDF" className="p-1.5 border border-[var(--cp-border)] text-muted-foreground hover:text-[var(--cp-cyan)]">
                        <FileText size={12} />
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs font-mono text-muted-foreground p-8 text-center leading-relaxed">
                      {activeFilteredContext
                        ? `Ask questions about all ${activeFilteredContext.nodes.length} filtered nodes and ${activeFilteredContext.edges.length} visible edges.`
                        : "Ask questions about this knowledge node and its neighborhood. ATHENA will look at its connections and metadata to answer."}
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={msg.id || i} data-athena-message-index={i} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                        <div className="relative group max-w-[85%]">
                          <div className={`rounded px-3 py-2 text-xs font-mono border ${
                            msg.sender === "user"
                              ? "bg-[var(--cp-cyan)]/10 border-[var(--cp-cyan)]/25 text-foreground"
                              : "bg-[var(--cp-bg-2)] border-[var(--cp-border)] text-foreground/90"
                          }`}>
                            <div className="absolute -top-2 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button type="button" onClick={() => handleCopyMessage(msg.text)} title="Copy message text" aria-label="Copy message text" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-[var(--cp-cyan)]">
                                <Copy size={9} />
                              </button>
                              <button type="button" onClick={() => void handleExportMessage("html", msg, i)} title="Download message as HTML" aria-label="Download message as HTML" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-[var(--cp-cyan)]">
                                <FileCode2 size={9} />
                              </button>
                              <button type="button" onClick={() => void handleExportMessage("pdf", msg, i)} title="Download message as PDF" aria-label="Download message as PDF" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-[var(--cp-cyan)]">
                                <FileText size={9} />
                              </button>
                              <button type="button" onClick={() => handleDeleteMessage(msg.id)} title="Delete message" aria-label="Delete message" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-red-400">
                                <Trash2 size={9} />
                              </button>
                            </div>
                            {msg.sender === "assistant" ? (
                              <div
                                data-athena-export-content
                                className="font-sans leading-relaxed [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:my-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:my-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-[var(--cp-border)] [&_th]:bg-[var(--cp-bg-1)] [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-[var(--cp-border)] [&_td]:p-2 [&_td]:align-top [&_pre]:bg-[var(--cp-bg-0)] [&_pre]:border [&_pre]:border-[var(--cp-border)] [&_pre]:p-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-[10px] [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--cp-cyan)] [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
                              >
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                              </div>
                            ) : (
                              <p data-athena-export-content className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-[8px] text-muted-foreground mt-1 px-1 font-mono uppercase">
                          {msg.sender === "user" ? "USER" : "ATHENA"} • {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  )}
                  {isAiLoading && (
                    <div className="flex items-center gap-2 text-xs font-mono text-[var(--cp-cyan)] px-1">
                      <span className="animate-pulse">ATHENA IS THINKING...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendChatMessage} className="p-3 border-t border-[var(--cp-border)] bg-[var(--cp-bg-2)] flex gap-2 shrink-0">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChatMessage(e);
                      }
                    }}
                    placeholder={activeFilteredContext ? "Ask ATHENA about these filtered nodes..." : "Ask ATHENA about this node..."}
                    rows={1}
                    className="flex-1 bg-[var(--cp-bg-0)] border border-[var(--cp-border)] px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] resize-none min-h-[32px] max-h-[120px] overflow-y-auto"
                  />
                  <button type="submit" disabled={isAiLoading || !chatInput.trim()} className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 font-mono">ASK</button>
                  {chatMessages.length > 0 && (
                    <button type="button" onClick={() => saveChatMessages([])} className="px-2 py-1.5 border border-red-500/20 text-red-400 hover:bg-red-950/20 text-xs font-mono">CLEAR</button>
                  )}
                </form>
              </div>
            )
          )) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="font-mono text-[10px] text-[var(--cp-cyan)] [writing-mode:vertical-rl] rotate-180 tracking-widest">
                DETAILS
              </span>
            </div>
          )}
        </div>
      )}
      </div>{/* /flex-1 min-w-0 relative (graph canvas wrapper) */}
    </div>
    <div
      className={`fixed inset-0 z-[100] bg-[var(--cp-bg-0)] transition-transform duration-500 ease-in-out ${
        isThreadBrowserOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
      }`}
      aria-hidden={!isThreadBrowserOpen}
    >
      <div className="h-full flex flex-col">
        <div className="h-16 shrink-0 border-b border-[var(--cp-border)] bg-[var(--cp-bg-1)] px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History size={18} className="text-[var(--cp-cyan)]" />
            <div>
              <h2 className="text-sm font-mono font-bold uppercase tracking-widest text-[var(--section-label)]">Previous Knowledge Chats</h2>
              <p className="text-[10px] font-mono text-muted-foreground">Open a conversation to restore its graph state and continue.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsThreadBrowserOpen(false)}
            aria-label="Close previous chats"
            className="h-9 w-9 border border-[var(--cp-border)] text-muted-foreground hover:text-foreground hover:border-[var(--cp-cyan)] flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {isLoadingThreads ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-muted-foreground">
              LOADING CHATS...
            </div>
          ) : chatThreads.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-muted-foreground text-center p-8">
              No saved knowledge chats yet.
            </div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-2">
              {chatThreads.map((thread) => {
                const firstUserMessage = thread.messages.find((message) => message.sender === "user");
                return (
                  <div key={thread.target_id} className="border border-[var(--cp-border)] bg-[var(--cp-bg-1)] p-4 flex gap-4 items-start">
                    <button
                      type="button"
                      onClick={() => void restoreChatThread(thread)}
                      className="min-w-0 flex-1 text-left cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-mono font-bold text-foreground truncate group-hover:text-[var(--cp-cyan)]">
                          {thread.title || thread.target_id}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground shrink-0">
                          {new Date(thread.updated_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mt-2 line-clamp-2">
                        {firstUserMessage?.text || "Empty conversation"}
                      </p>
                      <span className="inline-block mt-3 text-[9px] font-mono text-[var(--cp-cyan)] uppercase">
                        {thread.messages.length} messages · Open and continue
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteChatThread(thread.target_id)}
                      title="Delete chat"
                      className="p-2 text-muted-foreground hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    {pendingImport && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-lg p-6 rounded shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2">
            <div>
              <h3 className="text-sm font-mono text-[var(--section-label)] tracking-wider font-bold">IMPORT PREVIEW</h3>
              <p className="text-[10px] font-mono text-muted-foreground mt-1">Review the graph diff before adding anything.</p>
            </div>
            <button onClick={() => setPendingImport(null)} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={`border p-3 flex items-start gap-2 cursor-pointer ${importNodes ? "border-[var(--cp-cyan)] bg-[var(--cp-cyan)]/5" : "border-[var(--cp-border)]"}`}>
              <input
                type="checkbox"
                checked={importNodes}
                disabled={pendingImport.newNodes.length === 0}
                onChange={(event) => setImportNodes(event.target.checked)}
                className="mt-0.5 accent-[var(--cp-cyan)]"
              />
              <span>
                <span className="block text-xs font-mono text-foreground">ADD NODES</span>
                <span className="block text-lg font-mono font-bold text-[var(--cp-cyan)]">{pendingImport.newNodes.length}</span>
              </span>
            </label>
            <label className={`border p-3 flex items-start gap-2 cursor-pointer ${importEdges ? "border-[var(--cp-cyan)] bg-[var(--cp-cyan)]/5" : "border-[var(--cp-border)]"}`}>
              <input
                type="checkbox"
                checked={importEdges}
                disabled={pendingImport.newEdges.length === 0}
                onChange={(event) => setImportEdges(event.target.checked)}
                className="mt-0.5 accent-[var(--cp-cyan)]"
              />
              <span>
                <span className="block text-xs font-mono text-foreground">ADD EDGES</span>
                <span className="block text-lg font-mono font-bold text-[var(--cp-cyan)]">{pendingImport.newEdges.length}</span>
              </span>
            </label>
          </div>

          <div className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] p-3 text-[10px] font-mono text-muted-foreground space-y-1">
            <div className="text-emerald-400">Required node and edge fields validated.</div>
            <div>{pendingImport.existingNodeCount} existing nodes will be skipped.</div>
            <div>{pendingImport.existingEdgeCount} existing edges will be skipped.</div>
            {pendingImport.newNodes.length === 0 && pendingImport.newEdges.length === 0 && (
              <div className="text-amber-400">No additions are needed. This graph is already up to date.</div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setPendingImport(null)} className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={isLoading || (!importNodes && !importEdges) || (pendingImport.newNodes.length === 0 && pendingImport.newEdges.length === 0)}
              className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase font-mono disabled:opacity-50"
            >
              {isLoading ? "IMPORTING..." : "OK, LET'S DO THIS"}
            </button>
          </div>
        </div>
      </div>
    )}
    {isConnectModalOpen && (selectedNode || selectedNodes.size >= 2) && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 rounded shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2"><h3 className="text-sm font-mono text-[var(--cp-cyan)] tracking-wider font-bold">CONNECT NODE LINK</h3><button onClick={() => { setIsConnectModalOpen(false); setConnectTargetQuery(""); }} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button></div>
          <form onSubmit={handleConnectNodes} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Source Node(s)</label>
              <div className="text-xs font-mono bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2.5 py-1.5 text-foreground/80 max-h-24 overflow-y-auto">
                {selectedNodes.size >= 2
                  ? Array.from(selectedNodes.values()).map(n => n.title || n.id).join(", ")
                  : (selectedNode?.title || selectedNode?.id || "")}
              </div>
            </div>
            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Relation Type</label><select value={connectType} onChange={(e) => setConnectType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5">{["relates_to", "learned_from", "uses", "depends_on", "built_with"].map(et => <option key={et} value={et}>{et.replace(/_/g, " ")}</option>)}</select></div>
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Target Node</label>
              <div className="flex items-center gap-2 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2.5 py-1.5">
                <Search size={12} className="text-muted-foreground shrink-0" />
                <input
                  value={connectTargetQuery}
                  onChange={(e) => setConnectTargetQuery(e.target.value)}
                  placeholder="Search by title, type, or id"
                  className="w-full bg-transparent text-xs font-mono focus:outline-none text-foreground"
                />
              </div>
              <div className="max-h-72 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)]">
                {connectTypeOrder.map((type) => {
                  const nodes = groupedTargetNodes[type] || [];
                  if (!nodes.length) return null;
                  return (
                    <div key={type} className="border-b border-[var(--cp-border)]/40 last:border-b-0">
                      <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--cp-cyan)] bg-black/10">
                        {type}
                        <span className="ml-2 text-muted-foreground">({nodes.length})</span>
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        {nodes.map((n) => {
                          const isSelected = connectTargetIds.includes(n.node_id);
                          return (
                            <button
                              type="button"
                              key={n.node_id}
                              onClick={() => {
                                setConnectTargetIds(prev =>
                                  prev.includes(n.node_id)
                                    ? prev.filter(id => id !== n.node_id)
                                    : [...prev, n.node_id]
                                );
                              }}
                              className={`w-full text-left px-2.5 py-2 border-t border-[var(--cp-border)]/30 hover:bg-[var(--cp-cyan)]/10 text-xs font-mono ${
                                isSelected ? "bg-[var(--cp-cyan)]/15 text-[var(--cp-cyan)]" : "text-foreground/80"
                              }`}
                            >
                              <span className="block truncate">{n.title || n.node_id}</span>
                              <span className="block text-[10px] text-muted-foreground uppercase">[{n.node_type}] {n.node_id}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!filteredTargetNodes.length && (
                  <div className="px-3 py-6 text-center text-xs font-mono text-muted-foreground">No matching nodes</div>
                )}
              </div>
              {connectTargetIds.length > 0 && (
                <div className="text-[10px] font-mono text-[var(--cp-cyan)] uppercase">
                  Selected targets ({connectTargetIds.length}): {connectTargetIds.join(", ")}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => { setIsConnectModalOpen(false); setConnectTargetQuery(""); }} className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono">Cancel</button><button type="submit" className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase"><Plus size={14} />CREATE_LINK</button></div>
          </form>
        </div>
      </div>
    )}
    {isAddModalOpen && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 rounded shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2">
            <h3 className="text-sm font-mono text-[var(--section-label)] tracking-wider font-bold">ADD NODE</h3>
            <button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button>
          </div>
          <form onSubmit={handleAddNode} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Title</label>
              <input type="text" required value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Type</label>
              <select value={newNodeType} onChange={(e) => setNewNodeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">
                {KNOWLEDGE_NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Content</label>
              <textarea rows={4} value={newNodeContent} onChange={(e) => setNewNodeContent(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] resize-none font-mono text-xs" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono">Cancel</button>
              <button type="submit" disabled={isSubmittingNode} className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Plus size={14} />{isSubmittingNode ? "CREATING..." : "CREATE_NODE"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </div>
);
}
