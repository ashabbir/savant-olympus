export function reportKnowledgeError(action: string, error: unknown) {
  console.error(`[KnowledgeView] ${action} failed:`, error);
  return error instanceof Error ? error.message : String(error);
}
