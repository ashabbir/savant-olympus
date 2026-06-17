import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GitFork, Network, Layers, RefreshCw, ZoomIn, ZoomOut, Maximize, Plus, Trash2, Search, ArrowRight, ArrowLeft, Download, Upload, Info, Check, Copy } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
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

const ATHENA_CHAT_HISTORY_KEY = "savant_athena_chat_history";
const ATHENA_KNOWLEDGE_SCOPE = "knowledge";
const KNOWLEDGE_NODE_TYPES = [
  "insight",
  "client",
  "domain",
  "service",
  "library",
  "technology",
  "project",
  "concept",
  "repo",
  "session",
  "issue",
];


interface KnowledgeViewProps {
  serverUrl: string;
  apiKey: string;
}

export function KnowledgeView({ serverUrl, apiKey }: KnowledgeViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activeLayer, setActiveLayer] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [nodesCount, setNodesCount] = useState(0);
  const [edgesCount, setEdgesCount] = useState(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [editedNodeTitle, setEditedNodeTitle] = useState("");
  const [editedNodeType, setEditedNodeType] = useState("");
  const [isSavingNodeType, setIsSavingNodeType] = useState(false);
  const [isSavingNodeTitle, setIsSavingNodeTitle] = useState(false);

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [focalNodes, setFocalNodes] = useState<Set<string>>(new Set());
  const [exploreDepth, setExploreDepth] = useState(2);
  const [isExploreActive, setIsExploreActive] = useState(false);
  const [rawNodes, setRawNodes] = useState<any[]>([]);
  const [rawEdges, setRawEdges] = useState<any[]>([]);
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
  const layers = ["all", ...KNOWLEDGE_NODE_TYPES];

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

  const loadGraph = async () => {
    if (!svgRef.current || !containerRef.current) return;
    setIsLoading(true);
    setSelectedNode(null);
    clearExploreMode();

    try {
      let url = `${baseUrl}/api/knowledge/graph?limit=150&slim=true&include_staged=true&_=${Date.now()}`;
      const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
      const raw = await res.json();

      setRawNodes(raw.nodes || []);
      setRawEdges(raw.edges || []);

      let filteredNodes = raw.nodes || [];
      let filteredEdges = raw.edges || [];

      if (activeLayer !== "all") {
        filteredNodes = filteredNodes.filter((n: any) => n.node_type === activeLayer);
        const keptIds = new Set(filteredNodes.map((n: any) => n.node_id));
        filteredEdges = filteredEdges.filter(
          (e: any) => keptIds.has(e.source_id) && keptIds.has(e.target_id)
        );
      }

      setNodesCount(filteredNodes.length);
      setEdgesCount(filteredEdges.length);

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
        });
      d3Svg.call(zoom);

      const nodes: Node[] = filteredNodes.map((n: any) => ({
        id: n.node_id,
        node_id: n.node_id,
        title: n.title,
        node_type: n.node_type,
        content: n.content,
        status: n.status,
        created_at: n.created_at,
        metadata: n.metadata,
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

      nodes.forEach((n: any) => {
        n.connections = resolvedEdges.filter(
          (l) => (l.source as Node).id === n.id || (l.target as Node).id === n.id
        ).length;
      });

      const typeColors: Record<string, string> = {
        domain: "#facc15",
        service: "#22d3ee",
        library: "#d946ef",
        technology: "#4ade80",
        concept: "#a78bfa",
        session: "#6b7280",
      };

      const domainHullColors = [
        "rgba(34,211,238,0.38)",
        "rgba(167,139,250,0.38)",
        "rgba(74,222,128,0.38)",
        "rgba(244,63,94,0.38)",
        "rgba(251,146,60,0.38)",
      ];

      const typeOrder = ["domain", "service", "library", "technology", "concept", "session"];
      const clusterCenters: Record<string, { x: number; y: number }> = {};
      typeOrder.forEach((t, i) => {
        const angle = (i / typeOrder.length) * 2 * Math.PI - Math.PI / 2;
        const r = Math.min(width, height) * 0.28;
        clusterCenters[t] = { x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle) };
      });

      const forceCluster = (alpha: number) => {
        for (const d of nodes) {
          const c = clusterCenters[d.node_type];
          if (!c) continue;
          d.vx = (d.vx || 0) + (c.x - (d.x || 0)) * 0.04 * alpha;
          d.vy = (d.vy || 0) + (c.y - (d.y || 0)) * 0.04 * alpha;
        }
      };

      const simulation = d3.forceSimulation<Node>(nodes)
        .force("link", d3.forceLink<Node, Edge>(resolvedEdges).id((d) => d.id).distance(80).strength(0.4))
        .force("charge", d3.forceManyBody().strength(-180))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
        .force("collision", d3.forceCollide<Node>().radius((d: any) => 22 + (d.connections || 0) * 2))
        .force("cluster", forceCluster);

      const domainNodes = nodes.filter((n) => n.node_type === "domain");
      const domainAreas = domainNodes.map((dn, i) => {
        const memberIds = new Set([dn.node_id]);
        filteredEdges.forEach((e: any) => {
          if (e.source_id === dn.node_id) memberIds.add(e.target_id);
          if (e.target_id === dn.node_id) memberIds.add(e.source_id);
        });
        return { domain: dn, memberIds, color: domainHullColors[i % domainHullColors.length] };
      });



      const domainHullG = g.append("g");
      const hullLine = d3.line().curve(d3.curveCardinalClosed.tension(0.65));

      const _domainHullPath = (memberNodes: any[], pad: number) => {
        if (!memberNodes.length) return null;
        if (memberNodes.length === 1) {
          const r = pad + 18;
          const [px, py] = [memberNodes[0].x, memberNodes[0].y];
          const pts = Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * 2 * Math.PI;
            return [px + r * Math.cos(a), py + r * Math.sin(a)] as [number, number];
          });
          return hullLine(pts);
        }
        if (memberNodes.length === 2) {
          const [n1, n2] = memberNodes;
          const [x1, y1] = [n1.x, n1.y];
          const [x2, y2] = [n2.x, n2.y];
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
        const pts: [number, number][] = memberNodes.map((n) => [n.x, n.y]);
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

      const areaElements = domainAreas.map((area) => {
        const path = domainHullG.append("path")
          .attr("fill", area.color)
          .attr("fill-opacity", 0.12)
          .attr("stroke", area.color)
          .attr("stroke-opacity", 0.6)
          .attr("stroke-width", 1.5)
          .attr("stroke-dasharray", "6,4")
          .attr("pointer-events", "none");

        const label = domainHullG.append("text")
          .attr("text-anchor", "middle")
          .attr("font-family", "monospace")
        .attr("font-size", "8px")
        .attr("font-weight", "700")
        .attr("letter-spacing", "2px")
        .attr("fill", area.color)
        .attr("opacity", 0.5)
        .attr("pointer-events", "none")
        .text((area.domain.title || "").toUpperCase().slice(0, 22));

      return { path, label, area };
    });

    const forceDomainGravity = (alpha: number) => {
      for (const area of domainAreas) {
        const dn = nodes.find((n) => n.node_id === area.domain.node_id);
        if (!dn || dn.x == null || dn.y == null) continue;
        for (const n of nodes) {
          if (!area.memberIds.has(n.node_id) || n.node_id === dn.node_id) continue;
          n.vx = (n.vx || 0) + (dn.x - (n.x || 0)) * 0.012 * alpha;
          n.vy = (n.vy || 0) + (dn.y - (n.y || 0)) * 0.012 * alpha;
        }
      }
    };
    if (domainAreas.length > 0) {
      simulation.force("domainGravity", forceDomainGravity);
    }

    const link = g.append("g")
      .selectAll("line")
      .data(resolvedEdges)
      .enter()
      .append("line")
      .attr("stroke", "rgba(148,163,184,0.55)")
      .attr("stroke-width", (d) => Math.max(1.2, (d.weight || 1) * 1.8));

    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
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
              headers: { "X-API-Key": apiKey }
            });
            if (res.ok) setSelectedNode(await res.json());
          } catch (e) {
            console.error("Failed to fetch node details", e);
          }
        }
      });

    node.append("path")
      .attr("class", "node-shape")
      .attr("d", (d: any) => {
        const r = Math.max(8, 6 + (d.connections || 0) * 2);
        if (d.status === "staged") {
          // Curvy wobbly circle (squircle / blob)
          return `M 0 ${-r} C ${r * 0.8} ${-r * 1.25}, ${r * 1.25} ${-r * 0.45}, ${r * 0.95} 0 C ${r * 0.7} ${r * 0.45}, ${r * 0.8} ${r * 1.2}, 0 ${r} C ${-r * 0.95} ${r * 1.1}, ${-r * 1.25} ${r * 0.35}, ${-r} 0 C ${-r * 0.9} ${-r * 0.4}, ${-r * 0.85} ${-r * 1.2}, 0 ${-r} Z`;
        }
        // Perfect circle using SVG path commands
        return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
      })
      .attr("fill", (d) => typeColors[d.node_type] || "#6b7280")
      .attr("stroke", "#dbeafe")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", (d: any) => d.status === "staged" ? "3,3" : "none");

    node.append("text")
      .attr("dx", (d: any) => Math.max(8, 6 + (d.connections || 0) * 2) + 4)
      .attr("dy", ".35em")
      .text((d) => (d.title && d.title.length > 25) ? d.title.slice(0, 25) + "…" : (d.title || d.id))
      .attr("fill", "var(--foreground)")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .style("pointer-events", "none")
      .style("opacity", 0.92);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x || 0)
        .attr("y1", (d: any) => d.source.y || 0)
        .attr("x2", (d: any) => d.target.x || 0)
        .attr("y2", (d: any) => d.target.y || 0);
      node.attr("transform", (d: any) => `translate(${d.x || 0}, ${d.y || 0})`);
      areaElements.forEach(({ path, label, area }) => {
        const members = nodes.filter((n) => area.memberIds.has(n.node_id) && n.x != null && n.y != null);
        if (!members.length) return;
        const dPath = _domainHullPath(members, 30);
        if (dPath) {
          path.attr("d", dPath);
          const cx = members.reduce((s, n) => s + (n.x || 0), 0) / members.length;
          const topY = Math.min(...members.map((n) => n.y || 0)) - 30;
          label.attr("x", cx).attr("y", topY);
        }
      });
    });
  } catch (e) {
    console.error(e);
  } finally {
    setIsLoading(false);
  }
};

const handleExploreNode = (nodeId: string) => {
  setFocalNodes(new Set([nodeId]));
  setIsExploreActive(true);
};

const clearExploreMode = () => {
  setIsExploreActive(false);
  setFocalNodes(new Set());
  setSelectedNode(null);
  setSelectedNodes(new Map());
  if (svgRef.current) {
    const svg = d3.select(svgRef.current);
    svg.selectAll(".node").attr("opacity", 1);
    svg.selectAll("line").attr("opacity", 1);
  }
};

useEffect(() => {
  if (!svgRef.current) return;
  const svg = d3.select(svgRef.current);

  if (searchTags.length > 0) {
    const matchedIds = new Set<string>();
    let visibleIds = new Set<string>();

    const adj: Record<string, string[]> = {};
    rawNodes.forEach((n) => { adj[n.node_id] = []; });
    rawEdges.forEach((e) => {
      if (adj[e.source_id]) adj[e.source_id].push(e.target_id);
      if (adj[e.target_id]) adj[e.target_id].push(e.source_id);
    });

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
      .attr("opacity", (d: any) => visibleIds.has(d.node_id) ? (matchedIds.has(d.node_id) ? 1.0 : 0.5) : 0.08);
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
  } else if (isExploreActive && focalNodes.size > 0 && selectedNodes.size === 0) {
    const adj: Record<string, string[]> = {};
    rawNodes.forEach((n) => { adj[n.node_id] = []; });
    rawEdges.forEach((e) => {
      if (adj[e.source_id]) adj[e.source_id].push(e.target_id);
      if (adj[e.target_id]) adj[e.target_id].push(e.source_id);
    });
    const distMap = bfs(focalNodes, exploreDepth, adj);
    svg.selectAll(".node").attr("opacity", (d: any) => distMap.has(d.node_id) ? Math.max(0.4, 1 - distMap.get(d.node_id)! * 0.2) : 0.08);
    svg.selectAll("line").attr("opacity", (e: any) => {
      const s = e.source.node_id || e.source;
      const t = e.target.node_id || e.target;
      return (distMap.has(s) && distMap.has(t)) ? 0.7 : 0.05;
    });
    svg.selectAll(".node .node-shape")
      .attr("stroke", (n: any) => focalNodes.has(n.node_id) ? "#fff" : "#1a1a2e")
      .attr("stroke-width", (n: any) => focalNodes.has(n.node_id) ? 3 : 2)
      .attr("stroke-dasharray", (n: any) => n.status === "staged" ? "3,3" : "none");
    svg.selectAll(".node text").attr("opacity", 1);
  } else {
    svg.selectAll(".node .node-shape")
      .attr("stroke", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? "#00e6c8" : "#1a1a2e") : ((selectedNode && n.node_id === selectedNode.id) ? "#fff" : "#1a1a2e"))
      .attr("stroke-width", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? 4 : 1.5) : ((selectedNode && n.node_id === selectedNode.id) ? 3 : 2))
      .attr("stroke-dasharray", (n: any) => n.status === "staged" ? "3,3" : "none")
      .attr("opacity", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? (n.status === "staged" ? 0.6 : 1) : 0.3) : (n.status === "staged" ? 0.6 : 1));
    svg.selectAll(".node text").attr("opacity", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? 1 : 0.15) : 1);
    svg.selectAll("line").attr("opacity", (e: any) => {
      if (selectedNodes.size > 0) {
        const s = e.source.node_id || e.source;
        const t = e.target.node_id || e.target;
        return (selectedNodes.has(s) && selectedNodes.has(t)) ? 0.7 : 0.15;
      }
      return 0.45;
    });
  }
}, [exploreDepth, isExploreActive, focalNodes, rawNodes, rawEdges, selectedNodes, selectedNode, searchQuery, searchTags]);

useEffect(() => {
  if (selectedNodes.size > 0) return;
  setIsInspectorOpen(Boolean(selectedNode));
}, [selectedNode, selectedNodes.size]);

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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ source_id: ids[0], target_ids: ids.slice(1), edge_type: bulkEdgeType }),
    });
    if (res.ok) {
      setSelectedNodes(new Map());
      setSelectedNode(null);
      await loadGraph();
    } else alert("Failed to connect nodes");
  } catch (e: any) { alert("Failed: " + e.message); } finally { setIsLoading(false); }
};

  const handleConnectNodes = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedNode || connectTargetIds.length === 0) return;
  const sourceId = selectedNode.node_id || selectedNode.id;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/edges/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ source_id: sourceId, target_ids: connectTargetIds, edge_type: connectType }),
    });
    if (res.ok) {
      setIsConnectModalOpen(false);
      setConnectTargetIds([]);
      setConnectTargetQuery("");
      await loadGraph();
    } else {
      alert("Failed to connect nodes");
    }
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
        headers: { "X-API-Key": apiKey },
      });
    } else {
      res = await fetch(`${baseUrl}/api/knowledge/edges/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ node_ids: [nodeId] }),
    });
    if (res.ok) {
      await loadGraph();
      const detailRes = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
        headers: { "X-API-Key": apiKey }
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
  const payload: Record<string, string> = {};
  if (nextTitle && nextTitle !== (selectedNode.title || "")) payload.title = nextTitle;
  if (nextType && nextType !== selectedNode.node_type) payload.node_type = nextType;
  if (Object.keys(payload).length === 0) return;

  setIsSavingNodeTitle(true);
  setIsSavingNodeType(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/${nodeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
  }
};

const handleCommitAll = async () => {
  if (!confirm("Are you sure you want to commit all staged nodes in this workspace?")) return;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/nodes/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
      headers: { "X-API-Key": apiKey },
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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ workspace_id: "olympus" }),
    });
    if (!previewRes.ok) {
      alert("Failed to preview purge.");
      return;
    }
    const preview = await previewRes.json();
    const deleteNodeIds: string[] = preview.delete_node_ids || [];
    const graphRes = await fetch(`${baseUrl}/api/knowledge/graph?workspace_id=olympus&slim=true&include_staged=true`, {
      headers: { "X-API-Key": apiKey },
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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
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
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ workspace_id: "olympus" }),
    });
    setSelectedNode(null);
    await loadGraph();
  } catch (e: any) { alert("Prune failed: " + e.message); } finally { setIsLoading(false); }
};

const targetNodeOptions = rawNodes.filter((n) => n.node_id !== selectedNode?.id);
const filteredTargetNodes = connectTargetQuery.trim()
  ? targetNodeOptions.filter((n) => {
      const haystack = `${n.title || ""} ${n.node_type || ""} ${n.node_id || ""}`.toLowerCase();
      return haystack.includes(connectTargetQuery.trim().toLowerCase());
    })
  : targetNodeOptions;
  const groupedTargetNodes = filteredTargetNodes.reduce<Record<string, any[]>>((acc, node) => {
    const key = node.node_type || "other";
    (acc[key] ||= []).push(node);
    return acc;
  }, {});
  const connectTypeOrder = ["domain", "service", "library", "technology", "concept", "session", "project", "repo", "client", "insight", "other"];
  const selectedConnections = selectedNode
    ? rawEdges
        .filter((edge) => edge.source_id === selectedNode.node_id || edge.target_id === selectedNode.node_id)
        .map((edge) => {
          const relatedNodeId = edge.source_id === selectedNode.node_id ? edge.target_id : edge.source_id;
          const relatedNode = rawNodes.find((node) => node.node_id === relatedNodeId);
          const isOutgoing = edge.source_id === selectedNode.node_id;
          return {
            edge_id: edge.edge_id,
            edge_type: edge.edge_type || "relates_to",
            direction: isOutgoing ? "outgoing" : "incoming",
            relatedNode,
            relatedNodeId,
          };
        })
    : [];

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
        setIsLoading(true);
        const res = await fetch(`${baseUrl}/api/knowledge/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          alert("Import successful.");
          await loadGraph();
        } else alert("Failed to import.");
      } catch (err: any) { alert("Invalid JSON: " + err.message); } finally { setIsLoading(false); }
    };
    reader.readAsText(file);
  };

  input.click();
};

  const triggerDownload = async () => {
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/export?workspace_id=olympus`, {
      headers: { "X-API-Key": apiKey },
    });
    if (res.ok) {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `savant-knowledge-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else alert("Failed to export");
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

    window.addEventListener("knowledge-reload", handleReload);
    window.addEventListener("knowledge-add-node", handleAddNode);
    window.addEventListener("knowledge-commit-all", handleCommitAllEvent);
    window.addEventListener("knowledge-purge", handlePurge);
    window.addEventListener("knowledge-upload", handleUpload);
    window.addEventListener("knowledge-download", handleDownload);

    return () => {
      window.removeEventListener("knowledge-reload", handleReload);
      window.removeEventListener("knowledge-add-node", handleAddNode);
      window.removeEventListener("knowledge-commit-all", handleCommitAllEvent);
      window.removeEventListener("knowledge-purge", handlePurge);
      window.removeEventListener("knowledge-upload", handleUpload);
      window.removeEventListener("knowledge-download", handleDownload);
    };
  }, [apiKey, baseUrl]);

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
    setDrawerTab("info");
    setEditedNodeTitle(selectedNode?.title || "");
    setEditedNodeType(selectedNode?.node_type || "");
  }, [selectedNode?.node_id, selectedNode?.id]);

  useEffect(() => {
    if (!selectedNode) return;
    const nodeId = selectedNode.node_id || selectedNode.id;
    let active = true;

    window.system.getChatHistory(nodeId).then((history) => {
      if (!active) return;
      if (history && history.length > 0) {
        setChatMessages(history);
      } else {
        // Fallback to localStorage and migrate to database
        const key = `savant_knowledge_chat_history_${nodeId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setChatMessages(parsed);
            window.system.saveChatHistory(nodeId, parsed).catch(console.error);
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
      const key = `savant_knowledge_chat_history_${nodeId}`;
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
  }, [selectedNode?.node_id, selectedNode?.id]);

  const saveChatMessages = (newMessages: ChatMessage[]) => {
    setChatMessages(newMessages);
    if (selectedNode) {
      const nodeId = selectedNode.node_id || selectedNode.id;
      const key = `savant_knowledge_chat_history_${nodeId}`;
      localStorage.setItem(key, JSON.stringify(newMessages));
      window.system.saveChatHistory(nodeId, newMessages).catch((err) => {
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
    if (!chatInput.trim() || isAiLoading || !selectedNode) return;

    const activeNode = selectedNode;
    const activeNodeId = activeNode.node_id || activeNode.id;
    const userText = chatInput;
    setChatInput("");

    const key = `savant_knowledge_chat_history_${activeNodeId}`;
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

    if (selectedNode && (selectedNode.node_id || selectedNode.id) === activeNodeId) {
      setChatMessages(updatedMessages);
    }
    localStorage.setItem(key, JSON.stringify(updatedMessages));
    window.system.saveChatHistory(activeNodeId, updatedMessages).catch(console.error);
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

      // Build adjacency list
      const adj: Record<string, string[]> = {};
      rawNodes.forEach((n) => { adj[n.node_id] = []; });
      rawEdges.forEach((e) => {
        if (adj[e.source_id]) adj[e.source_id].push(e.target_id);
        if (adj[e.target_id]) adj[e.target_id].push(e.source_id);
      });

      // Get neighbors and edges within exploreDepth
      const distances = bfs(new Set([activeNodeId]), exploreDepth, adj);

      const neighborNodes = rawNodes.filter(n => n.node_id !== activeNodeId && distances.has(n.node_id));
      const neighborEdges = rawEdges.filter(e => distances.has(e.source_id) && distances.has(e.target_id));

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

[SELECTED NODE]
- ID: ${activeNodeId}
- Type: ${(activeNode.node_type || "unknown").toUpperCase()}
- Title: ${activeNode.title || "Untitled"}
- Status: ${activeNode.status || "unknown"}
- Content: ${activeNode.content || "No content available."}

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
        prompt: await buildAthenaAugmentedPrompt(promptPayload, `${activeNode.title || ""} ${userText} ${activeNode.content || ""}`)
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

      localStorage.setItem(key, JSON.stringify(finalMessages));
      window.system.saveChatHistory(activeNodeId, finalMessages).catch(console.error);
      if (selectedNode && (selectedNode.node_id || selectedNode.id) === activeNodeId) {
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
      localStorage.setItem(key, JSON.stringify(errorMessages));
      window.system.saveChatHistory(activeNodeId, errorMessages).catch(console.error);
      if (selectedNode && (selectedNode.node_id || selectedNode.id) === activeNodeId) {
        setChatMessages(errorMessages);
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => { loadGraph(); }, [activeLayer, baseUrl, apiKey]);
useEffect(() => {
  const handleResize = () => {
    if (svgRef.current && containerRef.current) {
      d3.select(svgRef.current).attr("width", containerRef.current.clientWidth).attr("height", containerRef.current.clientHeight);
    }
  };
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);

return (
  <div className="h-full min-h-0 flex flex-col overflow-hidden bg-[var(--cp-bg-0)] p-4 gap-4">
    <div className="flex justify-between items-center bg-[var(--cp-bg-1)] border border-[var(--cp-border)] p-3 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">// Knowledge Network</span>
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
                {rawNodes.filter(n => n.title?.toLowerCase().includes(searchQuery.toLowerCase())).map((n) => (
                  <div
                    key={n.node_id}
                    onClick={async () => {
                      setSelectedNodes(new Map());
                      setSelectedNode(n);
                      handleExploreNode(n.node_id);
                      try {
                        const res = await fetch(`${baseUrl}/api/knowledge/nodes/${n.node_id}`, { headers: { "X-API-Key": apiKey } });
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
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-1">
          {layers.map((layer) => (
            <button
              key={layer}
              onClick={() => setActiveLayer(layer)}
              className={`px-2 py-1 text-[10px] uppercase font-mono transition-all cursor-pointer ${activeLayer === layer ? "bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold" : "text-muted-foreground hover:text-foreground"}`}
            >
              {layer}
            </button>
          ))}
        </div>
      </div>
    </div>
    <div className="flex-1 min-h-0 overflow-hidden relative">
      <div ref={containerRef} className="absolute inset-0 min-w-0 border border-[var(--cp-border)] bg-[linear-gradient(180deg,rgba(10,14,24,0.96),rgba(16,22,36,0.96))] overflow-hidden">
        {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/25 z-10 text-xs font-mono text-[var(--cp-cyan)] animate-pulse">SYNCING_VECTORS...</div>}
        <svg ref={svgRef} id="kb-graph-svg" className="w-full h-full cursor-grab active:cursor-grabbing" />
        {isExploreActive && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-[var(--cp-bg-1)] border border-[var(--cp-cyan)] rounded shadow-2xl font-mono text-xs z-20">
            <span className="text-[var(--cp-cyan)] font-bold uppercase tracking-wider">DEPTH</span>
            <button onClick={() => setExploreDepth((d) => Math.max(1, d - 1))} className="w-5 h-5 flex items-center justify-center bg-[var(--cp-bg-2)] border border-[var(--cp-border)] hover:bg-[var(--cp-bg-3)] rounded font-bold cursor-pointer">-</button>
            <span className="text-foreground font-bold px-1">{exploreDepth}</span>
            <button onClick={() => setExploreDepth((d) => d + 1)} className="w-5 h-5 flex items-center justify-center bg-[var(--cp-bg-2)] border border-[var(--cp-border)] hover:bg-[var(--cp-bg-3)] rounded font-bold cursor-pointer">+</button>
            <button onClick={clearExploreMode} className="ml-2 px-2 py-0.5 border border-red-950 text-red-500 rounded bg-red-950/20 hover:bg-red-900/40 text-[10px] cursor-pointer">✕ CLEAR</button>
          </div>
        )}
      </div>
      {(selectedNodes.size >= 2 || selectedNode) && (
        <div className="absolute top-0 right-0 bottom-0 w-[34rem] max-w-[46vw] border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden z-20 shadow-2xl" style={{ animation: "slideInRight 0.2s ease-out" }}>
          <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] px-4 py-3 items-center justify-between">
            <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--cp-cyan)]">
              {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : "// Node Details"}
            </span>
            <div className="flex items-center gap-2">
              {selectedNodes.size === 0 && (
                <button onClick={() => setIsInspectorOpen((open) => !open)} className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer">
                  {isInspectorOpen ? "Collapse" : "Open"}
                </button>
              )}
              <button onClick={() => { setSelectedNode(null); setSelectedNodes(new Map()); setIsInspectorOpen(false); }} className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer">✕</button>
            </div>
          </div>
          {selectedNodes.size === 0 && selectedNode && (
            <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
              <button
                onClick={() => setDrawerTab("info")}
                className={`flex-1 py-2 text-center font-mono text-[10px] uppercase font-bold tracking-wider cursor-pointer border-r border-[var(--cp-border)] ${
                  drawerTab === "info" ? "bg-[var(--cp-bg-1)] text-[var(--cp-cyan)] border-b-2 border-b-[var(--cp-cyan)]" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                // Node Info
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
          {selectedNodes.size >= 2 ? (
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
                  <h4 className="text-[10px] text-muted-foreground uppercase font-bold">// TARGET TYPE</h4>
                  <select value={mergeNodeType} onChange={(e) => setMergeNodeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">
                    {KNOWLEDGE_NODE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button type="submit" className="w-full py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 flex items-center justify-center gap-1"><GitFork size={12} />Merge Nodes</button>
                </form>
                <div className="space-y-3 pt-4 border-t border-[var(--cp-border)]/30">
                  <h4 className="text-[10px] text-muted-foreground uppercase font-bold">// BULK CONNECT</h4>
                  <select value={bulkEdgeType} onChange={(e) => setBulkEdgeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 font-mono text-xs">
                    {["relates_to", "learned_from", "uses", "depends_on", "built_with"].map((et) => <option key={et} value={et}>{et.replace(/_/g, " ")}</option>)}
                  </select>
                  <button onClick={handleBulkConnect} className="w-full py-1.5 bg-[var(--cp-cyan)]/20 border border-[var(--cp-cyan)]/40 text-[var(--cp-cyan)] font-bold text-xs uppercase hover:bg-[var(--cp-cyan)]/30 flex items-center justify-center gap-1"><Plus size={12} />Connect All</button>
                </div>
                <div className="pt-2"><button onClick={handleBulkDelete} className="w-full py-1.5 bg-red-950/20 border border-red-500/30 text-red-400 font-bold text-xs uppercase hover:bg-red-950/40 flex items-center justify-center gap-1"><Trash2 size={12} />Delete Selected</button></div>
              </div>
            </div>
          ) : isInspectorOpen ? (
            drawerTab === "info" ? (
              <>
                <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-4">
                  <div className="border-b border-[var(--cp-border)] pb-2 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[var(--cp-cyan)] uppercase bg-[rgba(0,229,255,0.06)] px-1.5 py-0.5 border border-[var(--cp-cyan)]/20 rounded">{selectedNode!.node_type}</span>
                    {selectedNode!.status === "staged" ? <span className="text-[9px] font-mono text-yellow-500 uppercase bg-yellow-950/20 px-1 border border-yellow-500/20 rounded">staged</span> : <span className="text-[9px] font-mono text-green-500 uppercase bg-green-950/20 px-1 border border-green-500/20 rounded">committed</span>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">// NODE TITLE</label>
                    <input
                      value={editedNodeTitle}
                      onChange={(e) => setEditedNodeTitle(e.target.value)}
                      className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                      placeholder="Node title"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">// NODE TYPE</label>
                    <div className="flex gap-2">
                      <select
                        value={editedNodeType}
                        onChange={(e) => setEditedNodeType(e.target.value)}
                        className="flex-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono"
                      >
                        {KNOWLEDGE_NODE_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleUpdateNodeMeta}
                        disabled={
                          (!editedNodeTitle.trim() || editedNodeTitle.trim() === (selectedNode!.title || "")) &&
                          (!editedNodeType.trim() || editedNodeType.trim() === selectedNode!.node_type) ||
                          isSavingNodeTitle || isSavingNodeType
                        }
                        className="px-3 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-[10px] uppercase hover:opacity-90 disabled:opacity-50 font-mono"
                      >
                        {(isSavingNodeTitle || isSavingNodeType) ? "Saving..." : "Update"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">// CONNECTIONS</h4>
                    {selectedConnections.length ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {selectedConnections.map((connection) => (
                          <div key={connection.edge_id || `${connection.edge_type}-${connection.relatedNodeId}`} className="border border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-3 py-2 text-xs font-mono">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[var(--cp-cyan)] uppercase">{connection.edge_type.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-muted-foreground uppercase">{connection.direction}</span>
                            </div>
                            <div className="mt-1 text-foreground/80 flex items-center justify-between gap-2">
                              <div>
                                <span className="font-bold">{connection.relatedNode?.title || connection.relatedNodeId}</span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  [{connection.relatedNode?.node_type || "unknown"}]
                                </span>
                              </div>
                              <button
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
                              </button>
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
                      <h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">// CONTENT</h4>
                      <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] max-h-96 overflow-y-auto">{selectedNode!.content}</pre>
                    </div>
                  )}
                  {selectedNode!.metadata?.source && (<div><h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">// SOURCE</h4><p className="text-xs text-foreground/70">{selectedNode!.metadata.source}</p></div>)}
                  {selectedNode!.status === "staged" && (
                    <div className="pt-2">
                      <button onClick={() => handleCommitNode(selectedNode!.node_id || selectedNode!.id)} className="w-full py-2 bg-green-600 text-white font-bold text-xs uppercase hover:bg-green-700 flex items-center justify-center gap-1.5 font-mono text-[10px]"><Check size={14} />COMMIT_NODE</button>
                    </div>
                  )}
                  <div className="pt-2">
                    <button onClick={() => { setConnectTargetIds([]); setConnectTargetQuery(""); setIsConnectModalOpen(true); }} className="w-full py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 flex items-center justify-center gap-1.5"><GitFork size={14} />CONNECT_NODE</button>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
                <button onClick={handleDeleteSelected} disabled={!selectedNode} title="Delete" className="w-full py-2 border border-red-500/30 text-red-500 disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase hover:bg-red-950/20"><Trash2 size={14} />DELETE_NODE</button>
              </div>
            </>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs font-mono text-muted-foreground p-8 text-center leading-relaxed">
                      Ask questions about this knowledge node and its 1-hop neighborhood. ATHENA will look at its connections and metadata to answer.
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                        <div className="relative group max-w-[85%]">
                          <div className={`rounded px-3 py-2 text-xs font-mono border ${
                            msg.sender === "user" 
                              ? "bg-[var(--cp-cyan)]/10 border-[var(--cp-cyan)]/25 text-foreground" 
                              : "bg-[var(--cp-bg-2)] border-[var(--cp-border)] text-foreground/90"
                          }`}>
                            <div className="absolute -top-2 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button type="button" onClick={() => handleCopyMessage(msg.text)} title="Copy message text" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-[var(--cp-cyan)]">
                                <Copy size={9} />
                              </button>
                              <button type="button" onClick={() => handleDeleteMessage(msg.id)} title="Delete message" className="p-1 rounded bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-muted-foreground hover:text-red-400">
                                <Trash2 size={9} />
                              </button>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
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
                    placeholder="Ask ATHENA about this node..."
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
          ) : (
            <div className="flex-1 p-4 flex items-center justify-center">
              <button onClick={() => setIsInspectorOpen(true)} className="px-3 py-2 border border-[var(--cp-cyan)]/30 text-[var(--cp-cyan)] font-mono text-[10px] uppercase tracking-wider bg-[var(--cp-bg-2)]">
                Open node details
              </button>
            </div>
          )}
        </div>
      )}
    </div>
    {isConnectModalOpen && selectedNode && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 rounded shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2"><h3 className="text-sm font-mono text-[var(--cp-cyan)] tracking-wider font-bold">// CONNECT NODE LINK</h3><button onClick={() => { setIsConnectModalOpen(false); setConnectTargetQuery(""); }} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button></div>
          <form onSubmit={handleConnectNodes} className="space-y-4">
            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Source Node</label><div className="text-xs font-mono bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2.5 py-1.5 text-foreground/80">{selectedNode.title || selectedNode.id}</div></div>
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
            <h3 className="text-sm font-mono text-[var(--cp-cyan)] tracking-wider font-bold">// ADD NODE</h3>
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
