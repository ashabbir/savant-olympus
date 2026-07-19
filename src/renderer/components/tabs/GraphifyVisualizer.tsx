import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ZoomIn, ZoomOut, Maximize2, Search, Loader2, Info } from "lucide-react";
import { createContextService } from "@/services/contextService";
import { GraphEntityChatPanel } from "./context/components/GraphEntityChatPanel";

interface GraphifyVisualizerProps {
  repoId: string;
  repoName: string;
  baseUrl: string;
  apiKey: string;
  activeModel?: { provider: string; model: string };
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  node_id: string;
  node_type: string;
  title: string;
  content?: string;
  metadata?: any;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  edge_id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  edge_type: string;
  weight?: number;
  label?: string;
}

export const GraphifyVisualizer: React.FC<GraphifyVisualizerProps> = ({
  repoId,
  repoName,
  baseUrl,
  apiKey,
  activeModel,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);

  const [activeTab, setActiveTab] = useState<"details" | "chat">("details");
  const contextService = React.useMemo(() => createContextService(baseUrl, apiKey), [baseUrl, apiKey]);

  // D3 zoom reference
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // 1. Initial Load: Fetch main entities
  const loadMainEntities = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedNode(null);
    try {
      const data = await contextService.getGraphifyMainEntities(repoId, repoName);

      const formattedNodes: GraphNode[] = (data.nodes || []).map((n: any) => ({
        ...n,
        id: n.node_id,
      }));

      const formattedEdges: GraphEdge[] = (data.edges || []).map((e: any) => ({
        ...e,
        source: e.source_id,
        target: e.target_id,
      }));

      setNodes(formattedNodes);
      setEdges(formattedEdges);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMainEntities();
  }, [repoId, repoName, contextService]);

  // 2. Fetch direct neighbors on select
  const expandNodeNeighbors = async (node: GraphNode) => {
    setIsExpanding(true);
    try {
      const data = await contextService.getGraphifyNeighbors(repoId, repoName, node.node_id);

      setNodes((prevNodes) => {
        const existingIds = new Set(prevNodes.map((n) => n.node_id));
        const newNodes = (data.nodes || [])
          .filter((n: any) => !existingIds.has(n.node_id))
          .map((n: any) => ({ ...n, id: n.node_id }));
        return [...prevNodes, ...newNodes];
      });

      setEdges((prevEdges) => {
        const existingKeys = new Set(
          prevEdges.map(
            (e) =>
              `${typeof e.source === "object" ? e.source.id : e.source}-${
                typeof e.target === "object" ? e.target.id : e.target
              }-${e.edge_type}`
          )
        );
        const newEdges = (data.edges || [])
          .map((e: any) => ({
            ...e,
            source: e.source_id,
            target: e.target_id,
          }))
          .filter(
            (e: any) =>
              !existingKeys.has(`${e.source}-${e.target}-${e.edge_type}`)
          );
        return [...prevEdges, ...newEdges];
      });
    } catch (err) {
      console.error("Expand node error:", err);
    } finally {
      setIsExpanding(false);
    }
  };

  // 3. Search query to highlight/center/insert node
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
        const results = await contextService.searchGraphify(repoId, repoName, searchQuery);
        if (results && results.length > 0) {
          const match = results[0];
          const matchNode: GraphNode = { ...match, id: match.node_id };

          setNodes((prevNodes) => {
            if (prevNodes.some((n) => n.node_id === matchNode.node_id)) {
              return prevNodes;
            }
            return [...prevNodes, matchNode];
          });

          // Focus on the matched node
          setSelectedNode(matchNode);
          expandNodeNeighbors(matchNode);
        } else {
          setError(`No entities matching "${searchQuery}" found.`);
        }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. D3 Simulation & Rendering
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const width = containerRef.current?.clientWidth || 600;
    const height = containerRef.current?.clientHeight || 450;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clean container
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Add main group for zoom/pan
    const mainGroup = svg.append("g").attr("class", "graph-content");

    // Configure zoom behaviour
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        mainGroup.attr("transform", event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Reset view initially
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));

    // Resolve edge references dynamically (nodes might be updated)
    const resolvedEdges = edges
      .map((edge) => {
        const sourceNode = nodes.find(
          (n) => n.node_id === (typeof edge.source === "object" ? edge.source.id : edge.source)
        );
        const targetNode = nodes.find(
          (n) => n.node_id === (typeof edge.target === "object" ? edge.target.id : edge.target)
        );
        if (sourceNode && targetNode) {
          return { ...edge, source: sourceNode, target: targetNode };
        }
        return null;
      })
      .filter((e) => e !== null) as GraphEdge[];

    // Force simulation configurations
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(resolvedEdges)
          .id((d) => d.id)
          .distance(90)
          .strength(0.4)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(0, 0).strength(0.05))
      .force("collision", d3.forceCollide<GraphNode>().radius(25))
      .alphaDecay(0.04);

    // Render markers for edges
    svg
      .append("defs")
      .selectAll("marker")
      .data(["calls", "imports", "inherits", "depends_on", "defines"])
      .enter()
      .append("marker")
      .attr("id", (d) => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 18)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", (d) =>
        d === "calls" ? "#00e5ff" : d === "imports" ? "#b388ff" : d === "inherits" ? "#81c784" : d === "defines" ? "#38bdf8" : "#90a4ae"
      )
      .attr("d", "M0,-5L10,0L0,5");

    // Render edges
    const link = mainGroup
      .append("g")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(resolvedEdges)
      .enter()
      .append("line")
      .attr("stroke-width", (d) => (d.weight ? d.weight * 1.5 : 1.5))
      .attr("stroke", (d) =>
        d.edge_type === "calls"
          ? "#00e5ff"
          : d.edge_type === "imports"
          ? "#b388ff"
          : d.edge_type === "inherits"
          ? "#81c784"
          : d.edge_type === "defines"
          ? "#38bdf8"
          : "#455a64"
      )
      .attr("marker-end", (d) => `url(#arrow-${d.edge_type})`)
      .attr("opacity", (d) => {
        if (!selectedNode) return 0.6;
        const srcId = typeof d.source === "object" ? d.source.id : d.source;
        const tgtId = typeof d.target === "object" ? d.target.id : d.target;
        return (srcId === selectedNode.id || tgtId === selectedNode.id) ? 0.8 : 0.1;
      });

    // Render node groups
    const node = mainGroup
      .append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("cursor", "pointer")
      .attr("opacity", (d) => selectedNode ? (d.id === selectedNode.id ? 1.0 : 0.25) : 1.0)
      .on("click", (event, d) => {
        setSelectedNode(d);
        expandNodeNeighbors(d);
      })
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
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
      );

    // Draw node circles with glowing shadows
    node
      .append("circle")
      .attr("r", (d) => {
        const members = Number(d.metadata?.member_count || 0);
        const base = d.node_type === "class" ? Math.min(24, 11 + Math.sqrt(members) * 2.2) : 9;
        return d.id === selectedNode?.id ? base + 4 : base;
      })
      .attr("fill", (d) =>
        d.node_type === "class"
          ? "#00e5ff"
          : d.node_type === "function" || d.node_type === "method"
          ? "#ffab40"
          : d.node_type === "file"
          ? "#38bdf8"
          : "#b388ff"
      )
      .attr("stroke", (d) => (d.id === selectedNode?.id ? "#ffffff" : "transparent"))
      .attr("stroke-width", 2.5)
      .style("filter", (d) =>
        d.id === selectedNode?.id
          ? "drop-shadow(0px 0px 8px rgba(255,255,255,0.8))"
          : "drop-shadow(0px 0px 4px rgba(0,0,0,0.5))"
      );

    // Node titles
    node
      .append("text")
      .attr("dx", 14)
      .attr("dy", ".35em")
      .text((d) => d.title)
      .attr("fill", "#ffffff")
      .attr("font-size", "9px")
      .attr("font-family", "monospace")
      .style("text-shadow", "0 1px 2px rgba(0,0,0,0.8)")
      .style("pointer-events", "none");

    // Tick simulation function
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, selectedNode]);

  // Zoom control helpers
  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(250).call(zoomBehaviorRef.current.scaleBy, factor);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    svg
      .transition()
      .duration(250)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8)
      );
  };

  return (
    <div className="flex-1 flex gap-4 overflow-hidden h-[450px]">
      {/* Graph Area */}
      <div className="flex-1 bg-[var(--cp-bg-2)] border border-[var(--cp-border)] rounded relative flex flex-col overflow-hidden">
        {/* Search Header */}
        {/* Search Header */}
        <div className="absolute top-3 left-3 z-20 flex flex-col w-64">
          <form
            onSubmit={handleSearch}
            className="flex items-center bg-black/60 backdrop-blur-md border border-[var(--cp-border)] rounded px-2 py-1 gap-1.5 w-full"
          >
            <Search size={12} className="text-muted-foreground" />
            <input
              type="text"
              placeholder="Search classes, files, imports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-0 outline-none text-[10px] font-mono text-foreground placeholder:text-muted-foreground/60 w-full"
            />
          </form>
          {searchQuery.trim().length >= 3 && (
            <div className="mt-1 bg-[var(--cp-bg-1)] border border-[var(--cp-border)] z-30 max-h-48 overflow-y-auto shadow-2xl rounded">
              {nodes
                .filter((n) =>
                  n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  n.node_id?.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((n) => (
                  <div
                    key={n.node_id}
                    onClick={() => {
                      setSelectedNode(n);
                      expandNodeNeighbors(n);
                      setSearchQuery("");
                    }}
                    className="px-2.5 py-1.5 border-b border-[var(--cp-border)]/40 hover:bg-[var(--cp-cyan)]/10 text-[10px] font-mono cursor-pointer truncate text-foreground bg-[var(--cp-bg-2)]/90"
                  >
                    {n.title}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="absolute top-3 right-3 z-10 px-2 py-1 bg-black/60 border border-[var(--cp-border)] rounded text-[9px] font-mono text-muted-foreground">
          VISIBLE: <strong className="text-foreground">{nodes.length}</strong> NODES / <strong className="text-foreground">{edges.length}</strong> EDGES
        </div>
        <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 bg-black/60 border border-[var(--cp-border)] rounded hover:bg-black/80 text-foreground cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={() => handleZoom(0.7)}
            className="p-1.5 bg-black/60 border border-[var(--cp-border)] rounded hover:bg-black/80 text-foreground cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 bg-black/60 border border-[var(--cp-border)] rounded hover:bg-black/80 text-foreground cursor-pointer"
            title="Reset View"
          >
            <Maximize2 size={12} />
          </button>
        </div>

        {/* Loader */}
        {(isLoading || isExpanding) && (
          <div className="absolute top-10 right-3 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 border border-[var(--cp-border)] rounded text-[9px] font-mono text-[var(--cp-cyan)] animate-pulse">
            <Loader2 size={10} className="animate-spin" />
            <span>{isLoading ? "Loading Graph..." : "Expanding Neighbors..."}</span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 bg-black/60 border border-[var(--cp-border)] rounded p-2 text-[8px] font-mono text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00e5ff]" />
            <span>Class</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#ffab40]" />
            <span>Function / Method</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
            <span>Module / File</span>
          </div>
          <div className="pt-1 border-t border-[var(--cp-border)]/50">Class size = member count</div>
        </div>

        {/* Render Error */}
        {error && (
          <div className="absolute top-12 left-3 z-10 bg-red-950/40 border border-red-500/50 text-red-500 rounded px-3 py-1.5 text-[10px] font-mono w-64 max-h-24 overflow-y-auto">
            {error}
          </div>
        )}

        {/* SVG Wrapper */}
        <div ref={containerRef} className="w-full h-full">
          {nodes.length > 0 ? (
            <svg
              ref={svgRef}
              className="w-full h-full bg-transparent select-none"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center opacity-35">
              {isLoading && <Loader2 size={24} className="animate-spin mb-1.5 text-[var(--cp-cyan)]" />}
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {isLoading ? "initializing_project_graph" : "no_graph_entities_returned"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Details Side Panel */}
      <div className="w-80 bg-[var(--cp-bg-1)] border border-[var(--cp-border)] rounded p-4 flex flex-col overflow-hidden space-y-3 font-mono text-xs text-muted-foreground">
        <h4 className="text-[10px] font-bold text-foreground border-b border-[var(--cp-border)] pb-2 flex items-center gap-1.5 shrink-0">
          <Info size={12} className="text-[var(--cp-cyan)]" />
          ENTITY INSPECTOR
        </h4>

        {selectedNode ? (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            {/* Tabs */}
            <div className="flex border-b border-[var(--cp-border)] mb-2 font-mono shrink-0">
              <button
                onClick={() => setActiveTab("details")}
                className={`flex-1 pb-1.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer text-center border-b-2 transition-all ${
                  activeTab === "details"
                    ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 pb-1.5 font-bold uppercase tracking-wider text-[10px] cursor-pointer text-center border-b-2 transition-all ${
                  activeTab === "chat"
                    ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Ask ATHENA
              </button>
            </div>

            {activeTab === "details" ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div>
                  <span className="block text-[9px] text-muted-foreground/60 uppercase">ID</span>
                  <span className="text-foreground select-all font-bold text-[10px] bg-[var(--cp-bg-2)] p-1 rounded block border border-[var(--cp-border)] max-w-full truncate">
                    {selectedNode.node_id}
                  </span>
                </div>

                <div>
                  <span className="block text-[9px] text-muted-foreground/60 uppercase">Name</span>
                  <span className="text-foreground text-sm font-bold block truncate">
                    {selectedNode.title}
                  </span>
                </div>

                <div>
                  <span className="block text-[9px] text-muted-foreground/60 uppercase">Type</span>
                  <span className={`px-2 py-0.5 text-[9px] border rounded font-mono uppercase inline-block ${
                    selectedNode.node_type === "class"
                      ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                      : selectedNode.node_type === "file"
                      ? "border-neutral-500 text-neutral-400"
                      : "border-orange-500 text-orange-400 bg-orange-950/10"
                  }`}>
                    {selectedNode.node_type}
                  </span>
                </div>

                {selectedNode.content && (
                  <div>
                    <span className="block text-[9px] text-muted-foreground/60 uppercase mb-1">Docstring / Content</span>
                    <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-2 rounded text-[10px] leading-relaxed max-h-36 overflow-y-auto text-foreground whitespace-pre-wrap">
                      {selectedNode.content}
                    </div>
                  </div>
                )}

                {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                  <div>
                    <span className="block text-[9px] text-muted-foreground/60 uppercase mb-1">Metadata Attributes</span>
                    <div className="bg-[var(--cp-bg-2)] border border-[var(--cp-border)] p-2 rounded text-[9px] space-y-1.5 max-h-40 overflow-y-auto">
                      {Object.entries(selectedNode.metadata).map(([key, val]) => (
                        <div key={key} className="flex justify-between border-b border-[var(--cp-border)]/50 pb-1">
                          <span className="text-muted-foreground">{key}:</span>
                          <span className="text-foreground font-bold truncate max-w-[120px]" title={String(val)}>
                            {String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="text-[9px] text-muted-foreground/60 italic pt-2 border-t border-[var(--cp-border)]">
                  * Click neighbors in the graph canvas to traverse imports and calls dynamically.
                </div>
              </div>
            ) : (
              <GraphEntityChatPanel
                node={selectedNode}
                repoName={repoName}
                serverUrl={baseUrl}
                apiKey={apiKey}
                activeModel={activeModel}
              />
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-12">
            <Maximize2 size={24} className="text-muted-foreground mb-2" />
            <span className="text-[10px] text-center max-w-[180px] leading-relaxed">
              SELECT AN ENTITY ON THE GRAPH CANVAS TO INSPECT ITS ARCHITECTURE DETAILS
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
