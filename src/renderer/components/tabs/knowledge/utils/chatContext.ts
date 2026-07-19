import { KnowledgeChatContextSnapshot } from "../types";

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
