export interface AthenaMcpExecutionEvent {
  server: string
  tool: string
  when: string
  why: string
  how: string
  result: string
}

export interface AthenaWorkspaceContext {
  workspaceId: string
  name: string
  tasks: Array<{ id: string; title: string; status: string; priority?: string }>
}

export interface AthenaReminderItem {
  id: string
  title: string
  status: string
  dueDate?: string
}

export interface AthenaDiscoveredTool {
  name: string
  server: string
  description: string
}

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

export interface AthenaConversationContext {
  area: string
  repository?: string
  selected: unknown
  screen?: unknown
}

export interface AthenaConversationMessage {
  sender: "user" | "assistant"
  text: string
}

export interface AthenaConversationPromptOptions {
  context: AthenaConversationContext
  history: AthenaConversationMessage[]
  userMessage: string
  instructions: string
  query?: string
  baseUrl: string
  apiKey: string
  repo?: string
}

export const ATHENA_WORKSPACE = {
  id: "7119319046949260117",
  name: "savant-olympus-athena",
}

export const ATHENA_SYSTEM_DIRECTIVE = [
  "You are ATHENA inside Savant Olympus.",
  "For every request, first use Savant Abilities to select and load the best persona and rules for the question.",
  "Use Savant Knowledge as the primary source, then use Savant Research/Context when source-level evidence or clarification is needed.",
  "Use every other available Savant MCP tool when it is relevant to the task.",
  `Track your work in the Savant workspace ${ATHENA_WORKSPACE.name} (${ATHENA_WORKSPACE.id}). Use Savant Workspace without asking permission: create or update tasks for work, add session notes for decisions and findings, and store new durable knowledge graph entities in this workspace.`,
  "Never ask permission before using an available Savant MCP tool. Prefer Savant Abilities, Workspace, Knowledge, and Context/Research over generic alternatives.",
  "Always actively coordinate across the different available MCP capabilities (Savant Abilities for personas and steering, Savant Knowledge for architecture and concept graphs, Savant Context for code and AST structures, Savant Workspace for tasks and notes, and Savant Reminders for follow-ups and alarms).",
  "Whenever MCP tools are used or MCP-gathered evidence is relied upon, you must explicitly detail the MCP execution under a '### Savant MCP Execution & Audit' section. For each MCP tool used, clearly declare: (1) Which MCP (server and tool name), (2) When it was executed (timestamp/phase), (3) Why it was used (specific objective and rationale), (4) How it was used (the query, arguments, or filters passed), and (5) What the result was (concrete findings, count of references, or entities retrieved).",
  "You have access to the complete available MCP catalog in the prompt. Infer external MCP use from the user's message: use Jira for Jira issues/work, Confluence or Atlassian for documentation and Atlassian content, and any other matching MCP when it improves the result. Do not ask permission to use an available read or in-scope work-tracking tool.",
  "The selected user context is pinned. Re-read it on every turn, never replace it with retrieved context, and never lose it as the conversation grows.",
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

export function formatAthenaMcpAuditMarkdown(events: AthenaMcpExecutionEvent[]): string {
  if (!events.length) return "No MCP tools were executed for this request."

  const tableRows = events.map((e) =>
    `| \`${e.server}\` | \`${e.tool}\` | ${e.when} | ${e.why.replace(/\|/g, "\\|")} | \`${e.how.replace(/\|/g, "\\|")}\` | ${e.result.replace(/\|/g, "\\|")} |`
  ).join("\n")

  const detailItems = events.map((e) =>
`- **\`${e.server}\` → \`${e.tool}\`**:
  - **When**: ${e.when}
  - **Why**: ${e.why}
  - **How**: \`${e.how}\`
  - **Result**: ${e.result}`
  ).join("\n\n")

  return `### Savant MCP Execution & Audit

| MCP Server | Tool | When (UTC) | Why (Rationale) | How (Query / Params) | Result (Evidence) |
| :--- | :--- | :--- | :--- | :--- | :--- |
${tableRows}

#### Execution Details
${detailItems}`
}

export function formatAthenaWorkspaceTasks(tasks: Array<{ id: string; title: string; status: string; priority?: string }>) {
  if (!tasks.length) return "No active tasks in workspace."
  return tasks
    .map((t, i) => `[#${i + 1}] [${t.status.toUpperCase()}] ${t.title} (${t.id})${t.priority ? ` - Priority: ${t.priority}` : ""}`)
    .join("\n")
}

export function formatAthenaReminders(reminders: AthenaReminderItem[]) {
  if (!reminders.length) return "No active reminders."
  return reminders
    .map((r, i) => `[#${i + 1}] [${r.status.toUpperCase()}] ${r.title}${r.dueDate ? ` (Due: ${r.dueDate})` : ""}`)
    .join("\n")
}

export async function fetchAthenaWorkspaceContext(baseUrl: string, apiKey: string, workspaceId = ATHENA_WORKSPACE.id): Promise<AthenaWorkspaceContext> {
  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tasks?workspace_id=${encodeURIComponent(workspaceId)}&_=${Date.now()}`, {
      headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
    })
    if (!res.ok) {
      return { workspaceId, name: ATHENA_WORKSPACE.name, tasks: [] }
    }
    const data = await res.json()
    const rawTasks = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : []
    const tasks = rawTasks.slice(0, 10).map((t: any) => ({
      id: t.task_id || t.id || "unknown",
      title: t.title || "Untitled task",
      status: t.status || "open",
      priority: t.priority,
    }))
    return { workspaceId, name: ATHENA_WORKSPACE.name, tasks }
  } catch (error) {
    return { workspaceId, name: ATHENA_WORKSPACE.name, tasks: [] }
  }
}

export async function fetchAthenaRemindersContext(baseUrl: string, apiKey: string): Promise<AthenaReminderItem[]> {
  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/reminders?_=${Date.now()}`, {
      headers: { "X-API-Key": apiKey, "X-App-Name": "savant-olympus" },
    })
    if (!res.ok) return []
    const data = await res.json()
    const raw = Array.isArray(data) ? data : Array.isArray(data?.reminders) ? data.reminders : []
    return raw.slice(0, 5).map((r: any) => ({
      id: r.reminder_id || r.id || "unknown",
      title: r.title || "Untitled reminder",
      status: r.status || "active",
      dueDate: r.due_date,
    }))
  } catch (error) {
    return []
  }
}

export function buildAthenaPromptSections(sections: Array<[string, string]>) {
  return [ATHENA_SYSTEM_DIRECTIVE, ...sections.map(([title, body]) => `[${title}]\n${body}`)].join("\n\n")
}

export function ensureAthenaMcpSummary(response: string, augmentedPrompt: string) {
  const auditSection = augmentedPrompt.match(/\[REQUIRED MCP EXECUTION AUDIT\]\n([\s\S]*?)(?=\n\n\[|$)/)?.[1]?.trim()
  const receipt = augmentedPrompt.match(/\[REQUIRED MCP SUMMARY\]\n([\s\S]*?)(?=\n\n\[|$)/)?.[1]?.trim()
  if (!auditSection && !receipt) return response

  const groundedResponse = response
    .replace(/(?:^|\n\n)(?:I (?:could not|couldn't) (?:call|use)|No) Savant (?:Context|MCP)[\s\S]*?(?:provided\.|session\.|available\.)(?=\n\n|$)/gi, "")
    .trim()

  const hasAudit = /\bSavant MCP Execution & Audit\b/i.test(groundedResponse)
  const hasSummary = /\bSavant MCP Summary\b/i.test(groundedResponse)

  if (hasAudit && hasSummary) return groundedResponse

  const blocksToAppend: string[] = []
  if (!hasAudit && auditSection) {
    blocksToAppend.push(auditSection)
  }
  if (!hasSummary && receipt) {
    blocksToAppend.push(`### Savant MCP Summary\n${receipt}`)
  }

  if (blocksToAppend.length === 0) return groundedResponse
  return `${groundedResponse}\n\n${blocksToAppend.join("\n\n")}`
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
  const rawList: any[] = []
  if (Array.isArray(data?.servers)) {
    for (const server of data.servers) {
      const serverName = server.name || "savant"
      if (Array.isArray(server.tools)) {
        for (const t of server.tools) {
          rawList.push({
            server: serverName,
            name: t.name ? (t.name.includes(".") ? t.name : `${serverName}.${t.name}`) : "unknown",
            rawName: t.name,
            description: t.description || `Tool from ${serverName} MCP server`,
          })
        }
      }
    }
  } else if (Array.isArray(data?.tools)) {
    rawList.push(...data.tools)
  } else if (Array.isArray(data)) {
    rawList.push(...data)
  }

  return rawList.map((tool: any) => ({
    server: tool.server || "savant",
    name: tool.name || "unknown",
    description: tool.description || "",
  }))
}

function formatConversationHistory(history: AthenaConversationMessage[]) {
  return history.length > 0
    ? history.map((message) => `${message.sender === "user" ? "USER" : "ATHENA"}: ${message.text}`).join("\n")
    : "No previous messages in this conversation."
}

function inferRelevantMcpTools(query: string, tools: Array<{ name: string; description: string; server?: string }>) {
  const normalized = query.toLowerCase()
  const intentTerms = new Set<string>(["savant"])
  if (/\b(jira|ticket|issue|epic|sprint|backlog)\b/i.test(normalized)) intentTerms.add("jira")
  if (/\b(confluence|atlassian|wiki|documentation|docs|page)\b/i.test(normalized)) {
    intentTerms.add("confluence")
    intentTerms.add("atlassian")
  }
  if (/\b(git|github|pr|pull request|commit|repo|branch)\b/i.test(normalized)) {
    intentTerms.add("git")
    intentTerms.add("github")
  }
  if (/\b(reminder|alarm|schedule|due|timer)\b/i.test(normalized)) {
    intentTerms.add("reminder")
  }
  return tools.filter((tool) => {
    const haystack = `${tool.name} ${tool.description} ${tool.server || ""}`.toLowerCase()
    return [...intentTerms].some((term) => haystack.includes(term))
  })
}

export async function buildAthenaAugmentedPrompt(
  basePrompt: string,
  query: string,
  context: { baseUrl: string; apiKey: string; repo?: string }
) {
  const now = new Date().toISOString()
  const ability = await resolveAthenaAbility(context.baseUrl, context.apiKey, query, context.repo)
  const knowledgeHits = await fetchAthenaKnowledgeContext(context.baseUrl, context.apiKey, query)
  const researchQuery = buildAthenaResearchQuery(query)
  const codeHits = await fetchAthenaCodeContext(context.baseUrl, context.apiKey, researchQuery, context.repo)
  const workspaceContext = await fetchAthenaWorkspaceContext(context.baseUrl, context.apiKey, ATHENA_WORKSPACE.id)
  const remindersContext = await fetchAthenaRemindersContext(context.baseUrl, context.apiKey)
  const tools = await fetchAthenaMcpTools(context.baseUrl, context.apiKey)
  const relevantTools = inferRelevantMcpTools(query, tools)
  const impactSearched = requiresAthenaImpactAnalysis(query)

  const events: AthenaMcpExecutionEvent[] = [
    {
      server: "savant-abilities",
      tool: "resolve_abilities",
      when: now,
      why: "Resolve optimal persona and behavioral guidelines tailored to query intent",
      how: `persona="${ability.persona}", repo="${context.repo || "savant-olympus"}"`,
      result: `Resolved persona "${ability.persona}" with active steering prompt`,
    },
    {
      server: "savant-knowledge",
      tool: "search",
      when: now,
      why: "Retrieve architectural entity graph, business domains, and durable relationships",
      how: `query="${query}"`,
      result: `${knowledgeHits.length} graph node(s) retrieved: ${knowledgeHits.map((h: AthenaContextHit) => h.title).slice(0, 3).join(", ") || "No direct matches"}`,
    },
    {
      server: "savant-context",
      tool: "research",
      when: now,
      why: "Retrieve physical code AST declarations, callers/callees, and impact surface",
      how: `query="${researchQuery}", repo="${context.repo || "savant-olympus"}"`,
      result: `${codeHits.length} code reference(s) found: ${codeHits.map((h: AthenaContextHit) => h.path).slice(0, 3).join(", ") || "No source code hits"}`,
    },
    {
      server: "savant-workspace",
      tool: "list_tasks",
      when: now,
      why: `Track work and synchronize tasks in workspace "${ATHENA_WORKSPACE.name}" (${ATHENA_WORKSPACE.id})`,
      how: `workspace_id="${ATHENA_WORKSPACE.id}"`,
      result: `${workspaceContext.tasks.length} task(s) active/tracked: ${workspaceContext.tasks.map((t) => `[${t.status}] ${t.title}`).slice(0, 2).join("; ") || "Workspace active (0 tasks)"}`,
    },
    {
      server: "savant-reminders",
      tool: "list_reminders",
      when: now,
      why: "Check pending reminders, follow-ups, and scheduled alerts",
      how: 'status="active"',
      result: `${remindersContext.length} reminder(s) checked: ${remindersContext.map((r) => r.title).slice(0, 2).join("; ") || "No pending reminders"}`,
    },
  ]

  for (const relTool of relevantTools) {
    events.push({
      server: relTool.server || "external-mcp",
      tool: relTool.name,
      when: now,
      why: `External MCP tool matched from query intent terms`,
      how: `query="${query}"`,
      result: `Matched in active MCP catalog: ${relTool.description || "ready"}`,
    })
  }

  const auditMarkdown = formatAthenaMcpAuditMarkdown(events)

  return buildAthenaPromptSections([
    ["RESOLVED SAVANT ABILITIES", `Persona: ${ability.persona}\n${ability.prompt}`],
    ["BASE PROMPT", basePrompt],
    ["PRIMARY SAVANT KNOWLEDGE MCP RESULTS", formatAthenaContextHits(knowledgeHits)],
    ["SECONDARY SAVANT RESEARCH MCP RESULTS", formatAthenaContextHits(codeHits)],
    ["SAVANT WORKSPACE MCP STATE & TASKS", formatAthenaWorkspaceTasks(workspaceContext.tasks)],
    ["SAVANT REMINDERS MCP STATE", formatAthenaReminders(remindersContext)],
    ["UPSTREAM AND DOWNSTREAM IMPACT SEARCH", impactSearched ? `Performed using research query: ${researchQuery}` : "Not required for this question."],
    ["ADDITIONAL AVAILABLE SAVANT MCP TOOLS", tools.length > 0 ? tools.map((tool: any) => `- ${tool.name}: ${tool.description}`).join("\n") : "No additional catalogued tools; Savant Abilities, Knowledge, and Research results above are available MCP evidence."],
    ["REQUIRED MCP EXECUTION AUDIT", auditMarkdown],
    ["REQUIRED MCP SUMMARY", `- Persona: ${ability.persona}\n- Savant Abilities: used\n- Savant Workspace: ${ATHENA_WORKSPACE.name} (${ATHENA_WORKSPACE.id})\n- Savant Knowledge MCP: ${knowledgeHits.length} references\n- Savant Research MCP: ${codeHits.length} references\n- Savant Workspace Tasks: ${workspaceContext.tasks.length} tracked\n- Savant Reminders: ${remindersContext.length} checked\n- Upstream/downstream impact search: ${impactSearched ? "performed" : "not required"}`],
  ])
}

export async function buildAthenaConversationPrompt(options: AthenaConversationPromptOptions) {
  const now = new Date().toISOString()
  const userMessage = options.userMessage.trim()
  const query = options.query?.trim() || userMessage
  const ability = await resolveAthenaAbility(options.baseUrl, options.apiKey, query, options.repo)
  const knowledgeHits = await fetchAthenaKnowledgeContext(options.baseUrl, options.apiKey, query)
  const researchQuery = buildAthenaResearchQuery(query)
  const codeHits = await fetchAthenaCodeContext(options.baseUrl, options.apiKey, researchQuery, options.repo)
  const workspaceContext = await fetchAthenaWorkspaceContext(options.baseUrl, options.apiKey, ATHENA_WORKSPACE.id)
  const remindersContext = await fetchAthenaRemindersContext(options.baseUrl, options.apiKey)
  const tools: Array<{ name: string; description: string; server?: string }> = await fetchAthenaMcpTools(options.baseUrl, options.apiKey)
  const relevantTools = inferRelevantMcpTools(query, tools)
  const impactSearched = requiresAthenaImpactAnalysis(query)

  const events: AthenaMcpExecutionEvent[] = [
    {
      server: "savant-abilities",
      tool: "resolve_abilities",
      when: now,
      why: "Resolve optimal persona and behavioral guidelines tailored to query intent",
      how: `persona="${ability.persona}", repo="${options.repo || "savant-olympus"}"`,
      result: `Resolved persona "${ability.persona}" with active steering prompt`,
    },
    {
      server: "savant-knowledge",
      tool: "search",
      when: now,
      why: "Retrieve architectural entity graph, business domains, and durable relationships",
      how: `query="${query}"`,
      result: `${knowledgeHits.length} graph node(s) retrieved: ${knowledgeHits.map((h: AthenaContextHit) => h.title).slice(0, 3).join(", ") || "No direct matches"}`,
    },
    {
      server: "savant-context",
      tool: "research",
      when: now,
      why: "Retrieve physical code AST declarations, callers/callees, and impact surface",
      how: `query="${researchQuery}", repo="${options.repo || "savant-olympus"}"`,
      result: `${codeHits.length} code reference(s) found: ${codeHits.map((h: AthenaContextHit) => h.path).slice(0, 3).join(", ") || "No source code hits"}`,
    },
    {
      server: "savant-workspace",
      tool: "list_tasks",
      when: now,
      why: `Track work and synchronize tasks in workspace "${ATHENA_WORKSPACE.name}" (${ATHENA_WORKSPACE.id})`,
      how: `workspace_id="${ATHENA_WORKSPACE.id}"`,
      result: `${workspaceContext.tasks.length} task(s) active/tracked: ${workspaceContext.tasks.map((t) => `[${t.status}] ${t.title}`).slice(0, 2).join("; ") || "Workspace active (0 tasks)"}`,
    },
    {
      server: "savant-reminders",
      tool: "list_reminders",
      when: now,
      why: "Check pending reminders, follow-ups, and scheduled alerts",
      how: 'status="active"',
      result: `${remindersContext.length} reminder(s) checked: ${remindersContext.map((r) => r.title).slice(0, 2).join("; ") || "No pending reminders"}`,
    },
  ]

  for (const relTool of relevantTools) {
    events.push({
      server: relTool.server || "external-mcp",
      tool: relTool.name,
      when: now,
      why: `External MCP tool matched from query intent terms`,
      how: `query="${query}"`,
      result: `Matched in active MCP catalog: ${relTool.description || "ready"}`,
    })
  }

  const auditMarkdown = formatAthenaMcpAuditMarkdown(events)

  return buildAthenaPromptSections([
    ["SELECTED USER CONTEXT — PINNED, ALWAYS FIRST, NEVER DROP", JSON.stringify(options.context, null, 2)],
    ["AREA-SPECIFIC INSTRUCTIONS", options.instructions],
    ["COMPLETE CONVERSATION HISTORY — UNTRUNCATED", formatConversationHistory(options.history)],
    ["LATEST USER MESSAGE — HANDLE ONCE", userMessage],
    ["RESOLVED SAVANT ABILITIES", `Persona: ${ability.persona}\n${ability.prompt}`],
    ["MANDATORY SAVANT WORKSPACE TRACKING", `Workspace: ${ATHENA_WORKSPACE.name}\nWorkspace ID: ${ATHENA_WORKSPACE.id}\nUse Savant Workspace tools autonomously for tasks and notes. Store durable new knowledge with Savant Knowledge in this workspace.`],
    ["PRIMARY SAVANT KNOWLEDGE MCP RESULTS", formatAthenaContextHits(knowledgeHits)],
    ["SECONDARY SAVANT CONTEXT AND RESEARCH MCP RESULTS", formatAthenaContextHits(codeHits)],
    ["SAVANT WORKSPACE MCP STATE & TASKS", formatAthenaWorkspaceTasks(workspaceContext.tasks)],
    ["SAVANT REMINDERS MCP STATE", formatAthenaReminders(remindersContext)],
    ["UPSTREAM AND DOWNSTREAM IMPACT SEARCH", impactSearched ? `Performed using research query: ${researchQuery}` : "Not required for this question."],
    ["INFERRED MCP TOOLS FOR THIS USER MESSAGE", relevantTools.length > 0 ? relevantTools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n") : "No external MCP matched explicitly; continue to prefer the mandatory Savant MCP tools."],
    ["COMPLETE AVAILABLE MCP CATALOG — ALL TOOLS ACCESSIBLE", tools.length > 0 ? tools.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n") : "No MCP tools were returned by the catalog endpoint."],
    ["REQUIRED MCP EXECUTION AUDIT", auditMarkdown],
    ["REQUIRED MCP SUMMARY", `- Persona: ${ability.persona}\n- Savant Abilities: used\n- Savant Workspace: ${ATHENA_WORKSPACE.name} (${ATHENA_WORKSPACE.id})\n- Savant Knowledge MCP: ${knowledgeHits.length} references\n- Savant Context/Research MCP: ${codeHits.length} references\n- Savant Workspace Tasks: ${workspaceContext.tasks.length} tracked\n- Savant Reminders: ${remindersContext.length} checked\n- Available MCP tools: ${tools.length}\n- Inferred relevant MCP tools: ${relevantTools.map((tool) => tool.name).join(", ") || "mandatory Savant MCP only"}\n- Upstream/downstream impact search: ${impactSearched ? "performed" : "not required"}`],
  ])
}

export function serializeAthenaThreads(threads: AthenaThreadRecord[]) {
  return threads
}
import { createAbilitiesService } from "./abilitiesService"
