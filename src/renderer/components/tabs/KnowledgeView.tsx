import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GitFork, Network, Layers, RefreshCw, ZoomIn, ZoomOut, Maximize, Plus, Trash2, Search, ArrowRight, ArrowLeft, Download, Upload, Info } from "lucide-react";

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
  weight?: number;
  edge_id?: string;
}

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

  // Add node form state
  const [newNodeTitle, setNewNodeTitle] = useState("");
  const [newNodeType, setNewNodeType] = useState("concept");
  const [newNodeContent, setNewNodeContent] = useState("");
  const [isSubmittingNode, setIsSubmittingNode] = useState(false);

  // Search, highlight, and explore states
  const [searchQuery, setSearchQuery] = useState("");
  const [focalNodes, setFocalNodes] = useState<Set<string>>(new Set());
  const [exploreDepth, setExploreDepth] = useState(2);
  const [isExploreActive, setIsExploreActive] = useState(false);
  const [rawNodes, setRawNodes] = useState<any[]>([]);
  const [rawEdges, setRawEdges] = useState<any[]>([]);

  // Connect Node State
  const [connectType, setConnectType] = useState("relates_to");
  const [connectTargetId, setConnectTargetId] = useState("");

  const [selectedNodes, setSelectedNodes] = useState<Map<string, any>>(new Map());
  const [mergeNodeType, setMergeNodeType] = useState<string>("insight");
  const [bulkEdgeType, setBulkEdgeType] = useState<string>("relates_to");

  const baseUrl = serverUrl.replace(/\/+$/, "");
  const layers = ["all", "domain", "service", "library", "technology", "concept", "session"];

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
      let url = `${baseUrl}/api/knowledge/graph?limit=150&slim=true&_=${Date.now()}`;
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

      const haloG = g.append("g");
      Object.entries(clusterCenters).forEach(([type, c]) => {
        const typeNodes = nodes.filter((n) => n.node_type === type);
        if (!typeNodes.length) return;
        haloG.append("circle")
          .attr("cx", c.x)
          .attr("cy", c.y)
          .attr("r", 60 + typeNodes.length * 8)
          .attr("fill", typeColors[type] || "#6b7280")
          .attr("opacity", 0.08)
          .attr("stroke", typeColors[type] || "#6b7280")
          .attr("stroke-opacity", 0.25)
          .attr("stroke-width", 1.5);
        haloG.append("text")
          .attr("x", c.x)
          .attr("y", c.y - 60 - typeNodes.length * 8 - 6)
          .attr("text-anchor", "middle")
          .attr("font-family", "monospace")
          .attr("font-size", "9px")
          .attr("fill", typeColors[type] || "#6b7280")
          .attr("opacity", 0.65)
          .attr("font-weight", "600")
          .text(type.toUpperCase());
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
        const pts: [number, number][] = memberNodes.map((n) => [n.x, n.y]);
        const raw = pts.length >= 3 ? d3.polygonHull(pts) : pts.slice();
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
      .attr("stroke", "rgba(148,163,184,0.45)")
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

    node.append("circle")
      .attr("r", (d: any) => Math.max(8, 6 + (d.connections || 0) * 2))
      .attr("fill", (d) => typeColors[d.node_type] || "#6b7280")
      .attr("stroke", "#1a1a2e")
      .attr("stroke-width", 2);

    node.append("text")
      .attr("dx", (d: any) => Math.max(8, 6 + (d.connections || 0) * 2) + 4)
      .attr("dy", ".35em")
      .text((d) => (d.title && d.title.length > 25) ? d.title.slice(0, 25) + "…" : (d.title || d.id))
      .attr("fill", "var(--foreground)")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .style("pointer-events", "none")
      .style("opacity", 0.85);

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
        const pts = members.map((n) => [n.x, n.y] as [number, number]);
        const hull = pts.length >= 3 ? d3.polygonHull(pts) : pts;
        if (hull) {
          path.attr("d", hullLine(hull as any));
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
  if (isExploreActive && focalNodes.size > 0 && selectedNodes.size === 0) {
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
    svg.selectAll(".node circle")
      .attr("stroke", (n: any) => focalNodes.has(n.node_id) ? "#fff" : "#1a1a2e")
      .attr("stroke-width", (n: any) => focalNodes.has(n.node_id) ? 3 : 2);
  } else {
    svg.selectAll(".node circle")
      .attr("stroke", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? "#00e6c8" : "#1a1a2e") : ((selectedNode && n.node_id === selectedNode.id) ? "#fff" : "#1a1a2e"))
      .attr("stroke-width", (n: any) => selectedNodes.size > 0 ? (selectedNodes.has(n.node_id) ? 4 : 1.5) : ((selectedNode && n.node_id === selectedNode.id) ? 3 : 2))
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
}, [exploreDepth, isExploreActive, focalNodes, rawNodes, rawEdges, selectedNodes, selectedNode]);

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
  if (!selectedNode || !connectTargetId) return;
  const sourceId = selectedNode.node_id || selectedNode.id;
  setIsLoading(true);
  try {
    const res = await fetch(`${baseUrl}/api/knowledge/edges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ source_id: sourceId, target_id: connectTargetId, edge_type: connectType }),
    });
    if (res.ok) {
      setIsConnectModalOpen(false);
      setConnectTargetId("");
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
      await loadGraph();
      setSelectedNode(created);
    } else alert("Failed to create node");
  } catch (e: any) { alert(e.message); } finally { setIsSubmittingNode(false); }
};

const handlePurgeGraph = async () => {
  if (!confirm("Are you sure you want to purge Olympus workspace knowledge nodes?")) return;
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
    const res = await fetch(`${baseUrl}/api/knowledge/export`, { headers: { "X-API-Key": apiKey } });
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
  <div className="flex-1 flex flex-col overflow-hidden bg-[var(--cp-bg-0)] p-4 space-y-4">
    <div className="flex justify-between items-center bg-[var(--cp-bg-1)] border border-[var(--cp-border)] p-3 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">// Knowledge Network</span>
        <div className="relative">
          <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2 py-1">
            <Search size={12} className="text-muted-foreground" />
            <input
              type="text"
              placeholder="Find knowledge node..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs font-mono focus:outline-none w-48 text-foreground"
            />
          </div>
          {searchQuery.trim().length > 0 && (
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
                  className="px-2.5 py-1.5 border-b border-[var(--cp-border)]/40 hover:bg-[var(--cp-cyan)]/10 text-xs font-mono cursor-pointer truncate"
                >
                  {n.title}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-0.5">
          <button onClick={triggerUpload} title="Upload" className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"><Upload size={14} /></button>
          <button onClick={triggerDownload} title="Download" className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"><Download size={14} /></button>
          <button onClick={loadGraph} title="Reload" className="p-1 text-muted-foreground hover:text-[var(--cp-cyan)] transition-all cursor-pointer"><RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /></button>
          <button onClick={handlePurgeGraph} title="Purge" className="p-1 text-red-400 hover:text-red-300 transition-all cursor-pointer"><Trash2 size={14} /></button>
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
    <div className="flex-1 flex gap-4 overflow-hidden relative min-h-0">
      <div ref={containerRef} className="flex-1 border border-[var(--cp-border)] bg-[var(--cp-bg-0)] relative overflow-hidden">
        {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 text-xs font-mono text-[var(--cp-cyan)] animate-pulse">SYNCING_VECTORS...</div>}
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
      <div className="w-80 border border-[var(--cp-border)] bg-[var(--cp-bg-1)] flex flex-col overflow-hidden" style={{ animation: "slideInRight 0.2s ease-out" }}>

        <div className="flex border-b border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)] px-4 py-3 items-center justify-between">
          <span className="text-xs font-mono tracking-widest uppercase font-bold text-[var(--cp-cyan)]">
            {selectedNodes.size >= 2 ? `// Merge ${selectedNodes.size} Nodes` : selectedNode ? "// Node Details" : "// Add Node"}
          </span>
          {(selectedNode || selectedNodes.size > 0) && (
            <button onClick={() => { setSelectedNode(null); setSelectedNodes(new Map()); }} className="text-muted-foreground hover:text-foreground text-xs font-mono cursor-pointer">✕</button>
          )}
        </div>
        <div className="flex-1 p-4 overflow-y-auto">
          {selectedNodes.size >= 2 ? (
            <div className="space-y-4 font-mono text-xs">
              <div className="text-[10px] text-muted-foreground">⌘/Ctrl+Click to multiselect. First node is survivor.</div>
              <div className="space-y-1 bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] max-h-48 overflow-y-auto">
                {Array.from(selectedNodes.values()).map((n, i) => (
                  <div key={n.node_id} className="flex justify-between items-center gap-2 border-b border-[var(--cp-border)]/30 py-1 last:border-b-0">
                    <span className="truncate flex-1 text-foreground/80">{n.title || n.id}</span>
                    {i === 0 ? <span className="text-[8px] text-[var(--cp-cyan)] uppercase border border-[var(--cp-cyan)]/30 px-1 rounded">Survivor</span> : (
                      <button onClick={() => { setSelectedNodes((prev) => { const next = new Map(prev); next.delete(n.node_id); if(next.size===1) setSelectedNode(Array.from(next.values())[0]); return next; }); }} className="text-red-400 text-[9px]">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleMergeSubmit} className="space-y-3 pt-2 border-t border-[var(--cp-border)]/30">
                <h4 className="text-[10px] text-muted-foreground uppercase font-bold">// TARGET TYPE</h4>
                <select value={mergeNodeType} onChange={(e) => setMergeNodeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">
                  {["insight", "client", "domain", "service", "library", "technology", "project", "concept", "repo", "session"].map((t) => <option key={t} value={t}>{t}</option>)}
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
          ) : selectedNode ? (
            <div className="space-y-4">
              <div className="border-b border-[var(--cp-border)] pb-2 flex items-center justify-between">
                <span className="text-[10px] font-mono text-[var(--cp-cyan)] uppercase bg-[rgba(0,229,255,0.06)] px-1.5 py-0.5 border border-[var(--cp-cyan)]/20 rounded">{selectedNode.node_type}</span>
                {selectedNode.status === "staged" ? <span className="text-[9px] font-mono text-yellow-500 uppercase bg-yellow-950/20 px-1 border border-yellow-500/20 rounded">staged</span> : <span className="text-[9px] font-mono text-green-500 uppercase bg-green-950/20 px-1 border border-green-500/20 rounded">committed</span>}
              </div>
              <div><h3 className="text-md font-bold text-foreground mt-2">{selectedNode.title || selectedNode.id}</h3></div>
              {selectedNode.content && (
                <div>
                  <h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">// CONTENT</h4>
                  <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed bg-[var(--cp-bg-2)] p-2 border border-[var(--cp-border)] max-h-96 overflow-y-auto">{selectedNode.content}</pre>
                </div>
              )}
              {selectedNode.metadata?.source && (<div><h4 className="text-[10px] font-mono uppercase text-muted-foreground mb-1 tracking-wider">// SOURCE</h4><p className="text-xs text-foreground/70">{selectedNode.metadata.source}</p></div>)}
              <div className="pt-2">
                <button onClick={() => { setConnectTargetId(""); setIsConnectModalOpen(true); }} className="w-full py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 flex items-center justify-center gap-1.5"><GitFork size={14} />CONNECT_NODE</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAddNode} className="space-y-4">
              <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Title</label><input type="text" required value={newNodeTitle} onChange={(e) => setNewNodeTitle(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs" /></div>
              <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Node Type</label><select value={newNodeType} onChange={(e) => setNewNodeType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] font-mono text-xs">{["domain", "service", "library", "technology", "concept", "session"].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Content</label><textarea rows={4} value={newNodeContent} onChange={(e) => setNewNodeContent(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5 focus:outline-none focus:border-[var(--cp-cyan)] resize-none font-mono text-xs" /></div>
              <div className="pt-2"><button type="submit" disabled={isSubmittingNode} className="w-full py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"><Plus size={14} />{isSubmittingNode ? "CREATING..." : "CREATE_NODE"}</button></div>
            </form>
          )}
        </div>
        <div className="p-4 border-t border-[var(--cp-border)] shrink-0 bg-[var(--cp-bg-2)]">
          <button onClick={handleDeleteSelected} disabled={!selectedNode} title="Delete" className="w-full py-2 border border-red-500/30 text-red-500 disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase hover:bg-red-950/20"><Trash2 size={14} />DELETE_NODE</button>
        </div>
      </div>
    </div>
    {isConnectModalOpen && selectedNode && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-[var(--cp-bg-1)] border border-[var(--cp-border)] w-full max-w-md p-6 rounded shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--cp-border)] pb-2"><h3 className="text-sm font-mono text-[var(--cp-cyan)] tracking-wider font-bold">// CONNECT NODE LINK</h3><button onClick={() => setIsConnectModalOpen(false)} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button></div>
          <form onSubmit={handleConnectNodes} className="space-y-4">
            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Source Node</label><div className="text-xs font-mono bg-[var(--cp-bg-2)] border border-[var(--cp-border)] px-2.5 py-1.5 text-foreground/80">{selectedNode.title || selectedNode.id}</div></div>
            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Relation Type</label><select value={connectType} onChange={(e) => setConnectType(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5">{["relates_to", "learned_from", "uses", "depends_on", "built_with"].map(et => <option key={et} value={et}>{et.replace(/_/g, " ")}</option>)}</select></div>
            <div><label className="block text-[10px] uppercase font-mono text-muted-foreground mb-1">Target Node</label><select required value={connectTargetId} onChange={(e) => setConnectTargetId(e.target.value)} className="w-full bg-[var(--cp-bg-2)] border border-[var(--cp-border)] text-foreground text-xs px-2.5 py-1.5">{rawNodes.filter((n) => n.node_id !== selectedNode.id).map((n) => <option key={n.node_id} value={n.node_id}>[{n.node_type}] {n.title}</option>)}</select></div>
            <div className="flex gap-2 justify-end pt-2"><button type="button" onClick={() => setIsConnectModalOpen(false)} className="px-4 py-2 border border-[var(--cp-border)] text-xs uppercase font-mono">Cancel</button><button type="submit" className="px-4 py-2 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase"><Plus size={14} />CREATE_LINK</button></div>
          </form>
        </div>
      </div>
    )}
  </div>
);
}
