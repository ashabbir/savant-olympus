import { KnowledgeChatContextSnapshot } from "../types";

export interface KnowledgeChatPayload {
  nodes: any[];
  edges: any[];
  selectedNodes: any[];
  distances: Map<string, number>;
  nodeTypes: Record<string, number>;
  depth: number;
  isFiltered: boolean;
}

export function selectKnowledgeAthenaPersona(query: string, personas: any[]): string {
  const normalized = personas
    .map((persona) => String(persona?.id || persona?.name || persona || "").replace(/^persona\./, ""))
    .filter(Boolean);
  const text = query.toLowerCase();
  const preferences = /security|vulnerab|threat|auth|permission/.test(text)
    ? ["security", "engineer"]
    : /product|customer|business|strategy|requirement/.test(text)
      ? ["product", "analyst", "architect", "engineer"]
      : /architecture|design|dependency|service|system/.test(text)
        ? ["architect", "engineer"]
        : ["engineer", "analyst"];
  return preferences.find((candidate) => normalized.some((persona) => persona.includes(candidate)))
    || normalized[0]
    || "engineer";
}

export function buildKnowledgeChatPayload({
  rawNodes,
  rawEdges,
  adjacency,
  selectedNodeIds,
  depth,
  filteredContext,
  showInsights,
}: {
  rawNodes: any[];
  rawEdges: any[];
  adjacency: Record<string, string[]>;
  selectedNodeIds: string[];
  depth: number;
  filteredContext?: { nodes: any[]; edges: any[] } | null;
  showInsights: boolean;
}): KnowledgeChatPayload {
  const roots = new Set(selectedNodeIds.filter(Boolean));
  const distances = new Map<string, number>();

  if (filteredContext) {
    filteredContext.nodes.forEach((node) => distances.set(node.node_id || node.id, 0));
  } else {
    const queue = Array.from(roots).map((nodeId) => ({ nodeId, distance: 0 }));
    queue.forEach(({ nodeId }) => distances.set(nodeId, 0));
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.distance >= depth) continue;
      for (const neighborId of adjacency[current.nodeId] || []) {
        if (distances.has(neighborId)) continue;
        distances.set(neighborId, current.distance + 1);
        queue.push({ nodeId: neighborId, distance: current.distance + 1 });
      }
    }
  }

  const sourceNodes = filteredContext?.nodes || rawNodes.filter((node) => distances.has(node.node_id || node.id));
  const nodes = sourceNodes.filter((node) => showInsights || node.node_type !== "insight");
  const visibleNodeIds = new Set(nodes.map((node) => node.node_id || node.id));
  const sourceEdges = filteredContext?.edges || rawEdges;
  const edges = sourceEdges.filter(
    (edge) => visibleNodeIds.has(edge.source_id) && visibleNodeIds.has(edge.target_id),
  );
  const selectedNodes = nodes.filter((node) => roots.has(node.node_id || node.id));
  const nodeTypes = nodes.reduce<Record<string, number>>((counts, node) => {
    const type = node.node_type || "unknown";
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  return { nodes, edges, selectedNodes, distances, nodeTypes, depth, isFiltered: Boolean(filteredContext) };
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
