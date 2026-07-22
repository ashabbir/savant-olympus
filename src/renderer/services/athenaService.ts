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
  "For every request, first use Savant Abilities to select and load the best persona and rules for the question.",
  "Use Savant Knowledge as the primary source, then use Savant Research/Context when source-level evidence or clarification is needed.",
  "Use every other available Savant MCP tool when it is relevant to the task.",
  "When a request concerns change, dependencies, relationships, architecture, removal, or refactoring, investigate both upstream callers/consumers and downstream dependencies before answering.",
  "If code or project structure is needed, retrieve it first and ground your response in the retrieved source.",
  "Do not claim Savant MCP tools were unavailable when the prompt contains retrieved Savant Abilities, Knowledge, or Research results; those sections are MCP evidence gathered by Olympus before the model run.",
  "End with a concise MCP summary naming the resolved persona, MCP sources used, reference counts, and any upstream/downstream impact search performed.",
  "Always put Mermaid diagrams inside a fenced ```mermaid code block so chat and exported documents can render them visually.",
  "Keep all responses fast, concise, and minimal, avoiding long thought processes or reasoning.",
].join(" ")

const IMPACT_QUERY_PATTERN = /\b(change|modify|refactor|remove|delete|rename|move|migrate|impact|depend|relationship|architecture|upstream|downstream|caller|consumer|break)\w*\b/i

export function requiresAthenaImpactAnalysis(query: string) {
  return IMPACT_QUERY_PATTERN.test(query)
}

export function buildAthenaResearchQuery(query: string) {
  return requiresAthenaImpactAnalysis(query)
    ? `${query} upstream callers consumers downstream dependencies impact surface`
    : query
}

function selectAthenaPersona(query: string, personas: any[]) {
  const available = personas.map((entry) => String(entry?.id || entry?.name || entry || "").replace(/^persona\./, ""))
  const wanted = /security|threat|vulnerab|auth/i.test(query)
    ? "security"
    : /architect|design|depend|impact|relationship|upstream|downstream/i.test(query)
      ? "architect"
      : /research|compare|investigat|unknown/i.test(query)
        ? "researcher"
        : "engineer"
  return available.find((name) => name.toLowerCase() === wanted) || available.find((name) => name.toLowerCase() === "engineer") || wanted
}

export async function resolveAthenaAbility(baseUrl: string, apiKey: string, query: string, repo = "savant-olympus") {
  const service = createAbilitiesService(baseUrl, apiKey)
  let persona = "engineer"
  let prompt = "Engineer persona selected as the safe fallback."
  try {
    const personas = await service.listPersonas()
    persona = selectAthenaPersona(query, Array.isArray(personas) ? personas : [])
    const resolution = await service.resolve({
      persona,
      tags: ["athena", "knowledge", "research", requiresAthenaImpactAnalysis(query) ? "impact-analysis" : "reasoning"],
      repo_id: repo,
    })
    prompt = resolution?.prompt || resolution?.compiled_prompt || resolution?.content || prompt
  } catch (error) {
    console.warn("ATHENA ability resolution unavailable; using engineer fallback:", error)
  }
  return { persona, prompt }
}

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

export function ensureAthenaMcpSummary(response: string, augmentedPrompt: string) {
  const receipt = augmentedPrompt.match(/\[REQUIRED MCP SUMMARY\]\n([\s\S]*?)(?=\n\n\[|$)/)?.[1]?.trim()
  if (!receipt) return response
  const groundedResponse = response
    .replace(/(?:^|\n\n)(?:I (?:could not|couldn't) (?:call|use)|No) Savant (?:Context|MCP)[\s\S]*?(?:provided\.|session\.|available\.)(?=\n\n|$)/gi, "")
    .trim()
  if (/\bSavant MCP Summary\b/i.test(groundedResponse)) return groundedResponse
  return `${groundedResponse}\n\n### Savant MCP Summary\n${receipt}`
}

export async function fetchAthenaCodeContext(baseUrl: string, apiKey: string, query: string, repo?: string) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams({ q: trimmed })
  if (repo) params.set("repo", repo)

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/context/search?${params.toString()}`, {
    headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
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

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/knowledge/graph?slim=true&include_staged=false&_=${Date.now()}`, {
    headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
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
    headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
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
  const ability = await resolveAthenaAbility(context.baseUrl, context.apiKey, query, context.repo)
  // Knowledge is the primary evidence source. Research follows and expands to impact analysis when warranted.
  const knowledgeHits = await fetchAthenaKnowledgeContext(context.baseUrl, context.apiKey, query)
  const researchQuery = buildAthenaResearchQuery(query)
  const codeHits = await fetchAthenaCodeContext(context.baseUrl, context.apiKey, researchQuery, context.repo)
  const tools = await fetchAthenaMcpTools(context.baseUrl, context.apiKey)
  const impactSearched = requiresAthenaImpactAnalysis(query)

  return buildAthenaPromptSections([
    ["RESOLVED SAVANT ABILITIES", `Persona: ${ability.persona}\n${ability.prompt}`],
    ["BASE PROMPT", basePrompt],
    ["PRIMARY SAVANT KNOWLEDGE MCP RESULTS", formatAthenaContextHits(knowledgeHits)],
    ["SECONDARY SAVANT RESEARCH MCP RESULTS", formatAthenaContextHits(codeHits)],
    ["UPSTREAM AND DOWNSTREAM IMPACT SEARCH", impactSearched ? `Performed using research query: ${researchQuery}` : "Not required for this question."],
    ["ADDITIONAL AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No additional catalogued tools; Savant Abilities, Knowledge, and Research results above are available MCP evidence."],
    ["REQUIRED MCP SUMMARY", `- Persona: ${ability.persona}\n- Savant Abilities: used\n- Savant Knowledge MCP: ${knowledgeHits.length} references\n- Savant Research MCP: ${codeHits.length} references\n- Upstream/downstream impact search: ${impactSearched ? "performed" : "not required"}`],
  ])
}

export function serializeAthenaThreads(threads: AthenaThreadRecord[]) {
  return threads
}
import { createAbilitiesService } from "./abilitiesService"
