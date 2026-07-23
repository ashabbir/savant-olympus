import { KnowledgeGraphIndex } from "../types";

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

export function buildKnowledgeDistanceMap(
  seeds: Set<string>,
  depth: number,
  adjacency: Record<string, string[]>,
) {
  const distances = new Map<string, number>();
  const queue = [...seeds];
  seeds.forEach((nodeId) => distances.set(nodeId, 0));
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    const nodeDepth = distances.get(nodeId)!;
    if (nodeDepth >= depth) continue;
    for (const neighborId of adjacency[nodeId] || []) {
      if (distances.has(neighborId)) continue;
      distances.set(neighborId, nodeDepth + 1);
      queue.push(neighborId);
    }
  }
  return distances;
}

function intersectNodeSets(sets: Set<string>[]) {
  if (sets.length === 0) return null;
  const [smallest, ...rest] = [...sets].sort((left, right) => left.size - right.size);
  return new Set([...smallest].filter((nodeId) => rest.every((set) => set.has(nodeId))));
}

export function deriveKnowledgeFilterState(
  focalsByType: Record<string, Set<string>>,
  depth: number,
  index: KnowledgeGraphIndex,
  nodes: any[],
  nodeTypes: string[],
) {
  const activeEntries = Object.entries(focalsByType).filter(([, bucket]) => bucket.size > 0);
  const reachByType = new Map(
    activeEntries.map(([nodeType, seeds]) => [
      nodeType,
      new Set(buildKnowledgeDistanceMap(seeds, depth, index.adjacency).keys()),
    ]),
  );
  const visibleIds = intersectNodeSets([...reachByType.values()]);
  const allowedByType = new Map<string, Set<string> | null>();
  nodeTypes.forEach((nodeType) => {
    allowedByType.set(
      nodeType,
      intersectNodeSets(
        activeEntries
          .filter(([activeType]) => activeType !== nodeType)
          .map(([activeType]) => reachByType.get(activeType)!),
      ),
    );
  });
  const visibleNodes = visibleIds
    ? nodes
        .filter((node) => visibleIds.has(node.node_id || node.id))
        .sort((left, right) =>
          (left.title || left.node_id).localeCompare(right.title || right.node_id),
        )
    : [];
  return { activeEntries, allowedByType, visibleIds, visibleNodes };
}

export function formatKnowledgePurgePreview(
  preview: { to_delete?: number },
  edgeCount: number,
  workspace: string,
) {
  return `I’m going to purge ${preview.to_delete || 0} nodes and ${edgeCount} edges.\n\n` +
    `This will delete exclusive nodes and unlink shared nodes for workspace "${workspace}".\n` +
    "Nodes without edges remain committed. Orphaned edges are not part of this purge.";
}

export function inferNodeDomainsFromIndex(nodeId: string, index: KnowledgeGraphIndex, maxDepth = 2) {
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

export function buildFilteredKnowledgeContextFromIndex(
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
  depth = 1,
) {
  return buildFilteredKnowledgeContextFromIndex(
    focalsByType,
    nodes,
    edges,
    depth,
    buildKnowledgeGraphIndex(nodes, edges),
  );
}

export function deriveKnowledgeVisibility(
  context: { nodes: any[]; edges: any[]; scopeId: string },
  showInsights: boolean,
) {
  const listedNodes = context.nodes;
  const visualNodes = showInsights
    ? listedNodes
    : listedNodes.filter((node) => node.node_type !== "insight");
  const visualNodeIds = new Set(visualNodes.map((node) => node.node_id || node.id));
  const visualEdges = context.edges.filter(
    (edge) => visualNodeIds.has(edge.source_id) && visualNodeIds.has(edge.target_id),
  );
  const insightCount = listedNodes.filter((node) => node.node_type === "insight").length;

  return {
    listedNodes,
    visualNodes,
    visualEdges,
    insightCount,
    hiddenInsightCount: showInsights ? 0 : insightCount,
  };
}
