export interface AthenaContextHit {
  path?: string
  repo?: string
  content?: string
  title?: string
  score?: number
}

export interface AthenaThreadMessage {
  id: string
  sender: "user" | "assistant"
  text: string
  timestamp: string
}

export interface AthenaThreadRecord {
  target_id: string
  messages: AthenaThreadMessage[]
  updated_at?: string
}

export const ATHENA_SYSTEM_DIRECTIVE = [
  "You are ATHENA inside Savant Olympus.",
  "Always use Savant Context, Savant Knowledge, and any available Savant MCP tools relevant to the task before answering.",
  "If code or project structure is needed, retrieve it first and ground your response in the retrieved source.",
  "If the task can benefit from a tool, mention the tool you used or would use and why.",
  "Keep all responses fast, concise, and minimal, avoiding long thought processes or reasoning.",
].join(" ")

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "")
}

export function formatAthenaContextHits(hits: AthenaContextHit[]) {
  if (!hits.length) return "No additional code context was retrieved."
  return hits
    .map((hit, index) => {
      const location = [hit.repo, hit.path].filter(Boolean).join(" / ")
      return `[#${index + 1}] ${location}\n${hit.content || ""}`
    })
    .join("\n\n")
}

export function buildAthenaPromptSections(sections: Array<[string, string]>) {
  return [ATHENA_SYSTEM_DIRECTIVE, ...sections.map(([title, body]) => `[${title}]\n${body}`)].join("\n\n")
}

export async function fetchAthenaCodeContext(baseUrl: string, apiKey: string, query: string, repo?: string) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({ q: trimmed })
  if (repo) params.set("repo", repo)

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/context/search?${params.toString()}`, {
    headers: { "X-API-Key": apiKey },
  })
  if (!res.ok) return []

  const data = await res.json()
  const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []
  return results.slice(0, 5).map((hit: AthenaContextHit) => ({
    path: hit.path || hit.title || "unknown",
    repo: hit.repo,
    content: hit.content || "",
    title: hit.title || hit.path || "unknown",
    score: hit.score,
  }))
}

export async function fetchAthenaKnowledgeContext(baseUrl: string, apiKey: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/knowledge/graph?limit=50&slim=true&include_staged=false&_=${Date.now()}`, {
    headers: { "X-API-Key": apiKey },
  })
  if (!res.ok) return []

  const data = await res.json()
  const nodes = Array.isArray(data?.nodes) ? data.nodes : []
  const q = trimmed.toLowerCase()

  return nodes
    .filter((node: any) => {
      const hay = [
        node.title,
        node.content,
        node.node_type,
        node.metadata?.source,
        node.metadata?.repo,
      ].filter(Boolean).join(" ").toLowerCase()
      return hay.includes(q) || q.split(/\s+/).some((part) => part.length > 2 && hay.includes(part))
    })
    .slice(0, 5)
    .map((node: any) => ({
      title: node.title || node.node_id || "unknown",
      path: node.metadata?.source || node.node_id || "unknown",
      repo: node.metadata?.repo,
      content: node.content || "",
    }))
}

export async function fetchAthenaMcpTools(baseUrl: string, apiKey: string) {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/mcp/tools?_=${Date.now()}`, {
    headers: { "X-API-Key": apiKey },
  })
  if (!res.ok) return []

  const data = await res.json()
  const tools = Array.isArray(data?.tools) ? data.tools : Array.isArray(data) ? data : []
  return tools.slice(0, 20).map((tool: any) => ({
    name: tool.name || "unknown",
    description: tool.description || "",
  }))
}

export async function buildAthenaAugmentedPrompt(
  basePrompt: string,
  query: string,
  context: { baseUrl: string; apiKey: string; repo?: string }
) {
  const [codeHits, knowledgeHits, tools] = await Promise.all([
    fetchAthenaCodeContext(context.baseUrl, context.apiKey, query, context.repo),
    fetchAthenaKnowledgeContext(context.baseUrl, context.apiKey, query),
    fetchAthenaMcpTools(context.baseUrl, context.apiKey),
  ])

  return buildAthenaPromptSections([
    ["BASE PROMPT", basePrompt],
    ["RETRIEVED CODE CONTEXT", formatAthenaContextHits(codeHits)],
    ["RETRIEVED KNOWLEDGE CONTEXT", formatAthenaContextHits(knowledgeHits)],
    ["AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools available."],
  ])
}

export function serializeAthenaThreads(threads: AthenaThreadRecord[]) {
  return threads
}
