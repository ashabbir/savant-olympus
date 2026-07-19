import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ZoomIn, ZoomOut, Maximize2, Search, Loader2, Info, Sparkles, Send, Copy, Trash } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  buildAthenaPromptSections,
  fetchAthenaCodeContext,
  fetchAthenaKnowledgeContext,
  fetchAthenaMcpTools,
  formatAthenaContextHits,
} from "@/lib/athenaContext";

interface GraphifyVisualizerProps {
  repoId: string;
  repoName: string;
  baseUrl: string;
  apiKey: string;
  activeModel?: { provider: string; model: string };
}

interface ChatMessage {
  id?: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isAthenaThinking, setIsAthenaThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const getStorageKey = () => `savant_chat_history_graphify_${repoName}_${selectedNode?.node_id}`;

  useEffect(() => {
    if (!selectedNode) {
      setMessages([]);
      return;
    }
    async function load() {
      try {
        const key = getStorageKey();
        const stored = await window.system.getChatHistory(key);
        if (stored) {
          setMessages(stored);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error("Error loading chat history:", err);
        setMessages([]);
      }
    }
    load();
  }, [selectedNode?.node_id, repoName]);

  const saveMessages = (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    try {
      window.system.saveChatHistory(getStorageKey(), newMessages);
    } catch (err) {
      console.error("Error saving chat history:", err);
    }
  };

  const handleClearHistory = () => {
    saveMessages([]);
  };

  // Scroll to bottom helper
  useEffect(() => {
    if (chatEndRef.current && typeof chatEndRef.current.scrollIntoView === "function") {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAthenaThinking, activeTab]);

  const buildAthenaAugmentedPrompt = async (basePrompt: string, query: string) => {
    const baseUrlClean = baseUrl.replace(/\/+$/, "");
    const [codeHits, knowledgeHits, tools] = await Promise.all([
      fetchAthenaCodeContext(baseUrlClean, apiKey, query, repoName),
      fetchAthenaKnowledgeContext(baseUrlClean, apiKey, query),
      fetchAthenaMcpTools(baseUrlClean, apiKey),
    ]);

    return buildAthenaPromptSections([
      ["BASE PROMPT", basePrompt],
      ["RETRIEVED CODE CONTEXT", formatAthenaContextHits(codeHits)],
      ["RETRIEVED KNOWLEDGE CONTEXT", formatAthenaContextHits(knowledgeHits)],
      ["AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools available."],
    ]);
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isAthenaThinking || !selectedNode) return;

    const newUserMessage: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, newUserMessage];
    saveMessages(updatedMessages);
    setInputValue("");
    setIsAthenaThinking(true);

    try {
      let provider = "gemini";
      let model = "3.5";
      if (activeModel) {
        provider = activeModel.provider;
        model = activeModel.model;
      } else {
        const s = await window.system.getSettings();
        const chain = s?.["provider:chain"] || [];
        if (chain.length > 0) {
          provider = chain[0].provider;
          model = chain[0].model;
        }
      }

      const contextPrompt = `You are ATHENA, an AI assistant integrated into the Savant Olympus app.
The user is having a conversation with you regarding a Project Graph entity:
- Name: ${selectedNode.title}
- Node Type: ${(selectedNode.node_type || "").toUpperCase()}
- Node ID: ${selectedNode.node_id}
${selectedNode.content ? `- Docstring / Content: \n${selectedNode.content}\n` : ""}
${selectedNode.metadata ? `- Metadata: ${JSON.stringify(selectedNode.metadata)}\n` : ""}

Goal: Help the user analyze, explain, query, and refactor code related to this entity.

[CONVERSATION HISTORY]
${updatedMessages.slice(0, -1).map(msg => `${msg.sender === "user" ? "User" : "ATHENA"}: ${msg.text}`).join("\n")}

[NEW USER MESSAGE]
${textToSend}

Please analyze the project graph entity details, the context, and the history, then respond to the user's message.
Explain how it fits into the repository structure, its dependencies/relationships, and suggest code changes or architectural insights.

[INSTRUCTIONS FOR MCP USAGE]
You have access to a variety of Savant MCP tools. Use them to investigate code, query knowledge, or perform actions as needed. 
Always prefer using a tool if it can provide more accurate or deep information.
`;

      const responseText = await window.ipcRenderer.invoke("run-agent", {
        provider,
        model,
        prompt: await buildAthenaAugmentedPrompt(contextPrompt, `${selectedNode.title} ${textToSend} ${selectedNode.content || ""}`),
      });

      const newAiMessage: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: responseText || "No response received from the gateway.",
        timestamp: new Date().toISOString(),
      };

      saveMessages([...updatedMessages, newAiMessage]);
    } catch (error: any) {
      const errorMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "assistant",
        text: `Error calling ATHENA agent: ${error.message || "Unknown error"}. Make sure Savant Gateway is running.`,
        timestamp: new Date().toISOString(),
      };
      saveMessages([...updatedMessages, errorMsg]);
    } finally {
      setIsAthenaThinking(false);
    }
  };

  // D3 zoom reference
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // 1. Initial Load: Fetch main entities
  const loadMainEntities = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedNode(null);
    try {
      const res = await fetch(
        `${baseUrl}/api/graphify/main-entities?repo_id=${encodeURIComponent(repoId)}&workspace_id=${encodeURIComponent(
          repoName
        )}&limit=40`,
        {
          headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
        }
      );
      if (!res.ok) throw new Error("Failed to load codebase graph structure");
      const data = await res.json();

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
  }, [repoId, repoName, baseUrl, apiKey]);

  // 2. Fetch direct neighbors on select
  const expandNodeNeighbors = async (node: GraphNode) => {
    setIsExpanding(true);
    try {
      const res = await fetch(
        `${baseUrl}/api/graphify/neighbors?repo_id=${encodeURIComponent(repoId)}&workspace_id=${encodeURIComponent(
          repoName
        )}&node_id=${encodeURIComponent(node.node_id)}`,
        {
          headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
        }
      );
      if (!res.ok) throw new Error("Failed to expand neighbors");
      const data = await res.json();

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
      const res = await fetch(`${baseUrl}/api/graphify/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          "X-App-Name": "savant-olympus",
        },
        body: JSON.stringify({
          repo_id: repoId,
          workspace_id: repoName,
          query: searchQuery,
          limit: 10,
        }),
      });

      if (res.ok) {
        const results = await res.json();
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

    // Add main group for zoom/pan
    const mainGroup = svg.append("g").attr("class", "graph-content");

    // Configure zoom behaviour
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
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
      .data(["calls", "imports", "inherits", "depends_on"])
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
        d === "calls" ? "#00e5ff" : d === "imports" ? "#b388ff" : d === "inherits" ? "#81c784" : "#90a4ae"
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
      .attr("r", (d) => (d.id === selectedNode?.id ? 14 : 10))
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
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 border border-[var(--cp-border)] rounded text-[9px] font-mono text-[var(--cp-cyan)] animate-pulse">
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
            <span>File</span>
          </div>
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
              <Loader2 size={24} className="animate-spin mb-1.5 text-[var(--cp-cyan)]" />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                initializing_project_graph
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
              <div className="flex-1 flex flex-col min-h-0 space-y-3">
                <div className="flex-1 overflow-y-auto border border-[var(--cp-border)] bg-[var(--cp-bg-2)] rounded p-2 space-y-3 min-h-0 flex flex-col pr-1">
                  {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col justify-center items-center text-center p-4 space-y-4 my-auto">
                      <Sparkles className="w-8 h-8 text-[var(--cp-cyan)] animate-pulse" />
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider font-mono">ATHENA</h4>
                        <p className="text-[9px] text-muted-foreground max-w-[200px] leading-relaxed font-sans">
                          Ask ATHENA questions about this entity. ATHENA has full context of this node.
                        </p>
                      </div>

                      {/* Quick actions */}
                      <div className="w-full flex flex-col gap-1.5 pt-2">
                        <button
                          onClick={() => handleSendMessage(`Explain what the entity "${selectedNode.title}" does.`)}
                          className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                        >
                          🔍 Explain this entity
                        </button>
                        <button
                          onClick={() => handleSendMessage(`How does "${selectedNode.title}" relate to the rest of the codebase?`)}
                          className="w-full text-left py-1.5 px-2 bg-[var(--cp-bg-3)] hover:bg-[var(--cp-border)] border border-[var(--cp-border)] text-muted-foreground hover:text-foreground rounded transition-all text-[9px] cursor-pointer"
                        >
                          🕸️ How does it relate to others?
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 flex-1">
                      {messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex flex-col space-y-1 group relative ${
                            msg.sender === "user" ? "items-end" : "items-start"
                          }`}
                        >
                          <div className="flex items-center gap-2 text-[8px] text-muted-foreground opacity-60">
                            <span>{msg.sender === "user" ? "USER" : "ATHENA"}</span>
                            {/* Copy & Delete action buttons */}
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => navigator.clipboard.writeText(msg.text)}
                                title="Copy message text"
                                className="hover:text-[var(--cp-cyan)] cursor-pointer"
                              >
                                <Copy size={9} />
                              </button>
                              <button
                                onClick={() => {
                                  const newMessages = messages.filter((_, idx) => idx !== i);
                                  saveMessages(newMessages);
                                }}
                                title="Delete message"
                                className="hover:text-red-400 cursor-pointer"
                              >
                                <Trash size={9} />
                              </button>
                            </div>
                          </div>
                          <div
                            className={`p-2 rounded border max-w-full overflow-hidden font-mono text-[10px] leading-relaxed break-words text-foreground ${
                              msg.sender === "user"
                                ? "bg-[rgba(0,229,255,0.06)] border-[rgba(0,229,255,0.25)] text-right"
                                : "bg-[rgba(167,139,250,0.06)] border-[rgba(167,139,250,0.2)] text-left"
                            }`}
                          >
                            {msg.sender === "user" ? (
                              <span className="whitespace-pre-wrap">{msg.text}</span>
                            ) : (
                              <div className="prose prose-invert max-w-none text-[10px] leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0 [&>pre]:bg-[var(--cp-bg-1)] [&>pre]:p-1.5 [&>pre]:rounded [&>pre]:my-1.5 [&>pre]:border [&>pre]:border-[var(--cp-border)] [&>pre>code]:text-[9px] [&>pre]:overflow-x-auto [&>pre]:max-w-full [&>ul]:list-disc [&>ul]:pl-4 [&>ul]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol]:mb-2 [&_code]:break-all [&_code]:whitespace-pre-wrap font-sans font-medium text-foreground antialiased">
                                <ReactMarkdown>{msg.text}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isAthenaThinking && (
                        <div className="flex flex-col space-y-1 items-start">
                          <span className="text-[8px] text-[var(--cp-cyan)] uppercase tracking-wider animate-pulse">ATHENA IS THINKING...</span>
                          <div className="p-2 rounded border border-[var(--cp-border)] bg-[var(--cp-bg-3)] flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin text-[var(--cp-cyan)]" />
                            <span className="text-muted-foreground text-[10px] font-sans">Consulting Savant Gateway...</span>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage(inputValue);
                  }}
                  className="flex gap-2 shrink-0"
                >
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (inputValue.trim() && !isAthenaThinking) {
                          handleSendMessage(inputValue);
                        }
                      }
                    }}
                    placeholder="Ask ATHENA about this entity..."
                    disabled={isAthenaThinking}
                    rows={1}
                    className="flex-1 bg-[var(--cp-bg-0)] border border-[var(--cp-border)] px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-[var(--cp-cyan)] resize-none min-h-[32px] max-h-[120px] overflow-y-auto"
                  />
                  <button
                    type="submit"
                    disabled={isAthenaThinking || !inputValue.trim()}
                    className="px-4 py-1.5 bg-[var(--cp-cyan)] text-[var(--cp-bg-0)] font-bold text-xs uppercase hover:opacity-90 disabled:opacity-50 font-mono"
                  >
                    ASK
                  </button>
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      className="px-2 py-1.5 border border-red-500/20 text-red-400 hover:bg-red-950/20 text-xs font-mono"
                    >
                      CLEAR
                    </button>
                  )}
                </form>
              </div>
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
