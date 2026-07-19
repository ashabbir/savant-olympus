import { validateKnowledgeImportPayload } from "./graphUtils";
export { buildAuthHeaders } from "@/services/httpClient";
import { buildAuthHeaders } from "@/services/httpClient";

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
