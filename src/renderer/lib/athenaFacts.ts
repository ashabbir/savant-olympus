import { extractAthenaModelTag } from "./athenaModel"

export type AthenaCallStatus = "ok" | "error"
export type AthenaCallSource = "live" | "prefetch"

export interface AthenaToolCall {
  server: string
  tool: string
  status: AthenaCallStatus
  source: AthenaCallSource
  isShell: boolean
  args: string
  result: string
  /** Number of results returned, when it can be inferred */
  resultCount?: number
  /** Payload size in KB, when the tool reported an oversized output */
  sizeKb?: number
}

export interface AthenaServerGroup {
  server: string
  calls: AthenaToolCall[]
  ok: number
  failed: number
  results: number
}

export type AthenaQuality = "strong" | "fair" | "weak"

export interface AthenaFacts {
  body: string
  /** Provider/model/effort that produced the response, when tagged */
  model?: string
  calls: AthenaToolCall[]
  groups: AthenaServerGroup[]
  summary: Array<{ label: string; value: string }>
  mcpServers: number
  mcpCalls: number
  shellCalls: number
  ok: number
  failed: number
  results: number
  sizeKb: number
  score: number
  quality: AthenaQuality
}

const TRACE_START = /^([●✗])\s+(.*)$/
const TRACE_CONT = /^\s+([│└])\s?(.*)$/
const AUDIT_HEADING = /^#{2,4}\s+Savant MCP Execution & Audit\s*$/i
const SUMMARY_HEADING = /^#{2,4}\s+Savant MCP Summary\s*$/i
const ANY_HEADING = /^#{1,3}\s+\S/
const CATALOG_MATCH = /matched from query intent|Matched in active MCP catalog/i

function inferServerFromTool(tool: string) {
  const match = tool.match(/^(savant-[a-z]+)[-.](.+)$/i)
  // Untagged, non-Savant calls are the agent's built-in tools (Read, Grep, …), not MCP
  return match ? { server: match[1].toLowerCase(), tool: match[2] } : { server: "local", tool }
}

export function inferResultCount(result: string, status: AthenaCallStatus): Pick<AthenaToolCall, "resultCount" | "sizeKb"> {
  if (status === "error") return { resultCount: 0 }
  const text = result.trim()
  const size = text.match(/\(([\d.]+)\s*KB\)/i)
  if (size) return { sizeKb: Number(size[1]) }
  const lines = text.match(/^(\d+)\s+lines?…?/i)
  if (lines) return { resultCount: Number(lines[1]) }
  if (/^\[\s*\]$/.test(text)) return { resultCount: 0 }
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return { resultCount: parsed.length }
    } catch {
      /* truncated payload */
    }
  }
  const leading = text.match(/^(\d+)\s+(?:graph node|code reference|task|reminder|node|file|result|item|reference)/i)
  if (leading) return { resultCount: Number(leading[1]) }
  if (text.startsWith("{") || text.length > 0) return { resultCount: 1 }
  return {}
}

function parseTraceBlock(marker: string, header: string, continuation: string[]): AthenaToolCall {
  const status: AthenaCallStatus = marker === "✗" ? "error" : "ok"
  const resultLine = continuation.find((line) => line.startsWith("└"))
  const commandLines = continuation.filter((line) => line.startsWith("│")).map((line) => line.slice(1).trim())
  // Same-line variant: "● tool (MCP: x) · args └ result"
  let head = header
  let result = resultLine ? resultLine.slice(1).trim() : ""
  const inlineResult = head.indexOf(" └ ")
  if (inlineResult !== -1) {
    result = result || head.slice(inlineResult + 3).trim()
    head = head.slice(0, inlineResult)
  }
  const inlineCmd = head.indexOf(" │ ")
  if (inlineCmd !== -1) {
    commandLines.unshift(head.slice(inlineCmd + 3).trim())
    head = head.slice(0, inlineCmd)
  }

  const mcp = head.match(/^(.+?)\s+\(MCP:\s*([^)]+)\)\s*(?:·\s*(.*))?$/)
  const shell = head.match(/^(.+?)\s+\(shell\)\s*(?:·\s*(.*))?$/)
  let server: string
  let tool: string
  let args: string
  if (mcp) {
    server = mcp[2].trim().toLowerCase()
    tool = mcp[1].trim()
    args = (mcp[3] || "").trim()
  } else if (shell) {
    server = "shell"
    tool = shell[1].trim()
    args = commandLines.join(" ").trim()
  } else {
    const [name, ...rest] = head.split(/\s+/)
    const inferred = inferServerFromTool(name)
    server = inferred.server
    tool = inferred.tool
    args = rest.join(" ").replace(/^·\s*/, "").trim()
  }

  return {
    server,
    tool,
    status,
    source: "live",
    isShell: server === "shell" || server === "local",
    args,
    result,
    ...inferResultCount(result, status),
  }
}

function stripTicks(cell: string) {
  return cell.trim().replace(/^`|`$/g, "").replace(/\\\|/g, "|")
}

function parseAuditTable(lines: string[]): AthenaToolCall[] {
  const calls: AthenaToolCall[] = []
  for (const line of lines) {
    if (!/^\s*\|/.test(line) || /^\s*\|\s*:?-{2,}/.test(line) || /MCP Server\s*\|/i.test(line)) continue
    const cells = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(stripTicks)
    if (cells.length < 6) continue
    const [server, tool, , why, how, result] = cells
    if (CATALOG_MATCH.test(why) || CATALOG_MATCH.test(result)) continue
    calls.push({
      server: server.toLowerCase(),
      tool,
      status: "ok",
      source: "prefetch",
      isShell: false,
      args: how,
      result,
      ...inferResultCount(result, "ok"),
    })
  }
  return calls
}

function parseSummary(lines: string[]) {
  return lines
    .map((line) => line.match(/^\s*[-*]\s+\**([^:*]+?)\**:\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ label: match[1].trim(), value: match[2].trim() }))
}

export function scoreAthenaFacts(input: { mcpServers: number; mcpCalls: number; ok: number; failed: number; results: number; sizeKb: number }) {
  if (input.mcpCalls === 0) return 0
  const successRate = input.ok / Math.max(1, input.ok + input.failed)
  const breadth = Math.min(input.mcpServers, 4) / 4
  const yieldScore = input.results > 0 || input.sizeKb > 0 ? Math.min(1, (input.results + input.sizeKb / 10) / 10) : 0
  return Math.round(successRate * 50 + breadth * 20 + yieldScore * 30)
}

export function qualityFor(score: number): AthenaQuality {
  if (score >= 70) return "strong"
  if (score >= 40) return "fair"
  return "weak"
}

export function parseAthenaResponse(rawText: string): AthenaFacts {
  const { text, model } = extractAthenaModelTag(rawText)
  const lines = text.split("\n")
  const bodyLines: string[] = []
  const calls: AthenaToolCall[] = []
  const auditLines: string[] = []
  const summaryLines: string[] = []
  let section: "body" | "audit" | "summary" = "body"

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (AUDIT_HEADING.test(line)) { section = "audit"; continue }
    if (SUMMARY_HEADING.test(line)) { section = "summary"; continue }
    if (section !== "body" && ANY_HEADING.test(line) && !/^#{4}/.test(line)) section = "body"

    const start = line.match(TRACE_START)
    if (start) {
      const continuation: string[] = []
      while (i + 1 < lines.length) {
        const next = lines[i + 1].match(TRACE_CONT)
        if (!next) break
        continuation.push(`${next[1]}${next[2]}`)
        i++
      }
      calls.push(parseTraceBlock(start[1], start[2], continuation))
      continue
    }

    if (section === "audit") auditLines.push(line)
    else if (section === "summary") summaryLines.push(line)
    else bodyLines.push(line)
  }

  calls.push(...parseAuditTable(auditLines))

  const groupMap = new Map<string, AthenaServerGroup>()
  for (const call of calls) {
    const group = groupMap.get(call.server) || { server: call.server, calls: [], ok: 0, failed: 0, results: 0 }
    group.calls.push(call)
    if (call.status === "ok") group.ok++
    else group.failed++
    group.results += call.resultCount || 0
    groupMap.set(call.server, group)
  }
  const groups = [...groupMap.values()].sort((a, b) => Number(a.calls[0].isShell) - Number(b.calls[0].isShell) || b.calls.length - a.calls.length)

  const mcpCallsList = calls.filter((call) => !call.isShell)
  const ok = mcpCallsList.filter((call) => call.status === "ok").length
  const failed = mcpCallsList.length - ok
  const results = mcpCallsList.reduce((sum, call) => sum + (call.resultCount || 0), 0)
  const sizeKb = Math.round(mcpCallsList.reduce((sum, call) => sum + (call.sizeKb || 0), 0) * 10) / 10
  const mcpServers = groups.filter((group) => !group.calls[0].isShell).length
  const stats = { mcpServers, mcpCalls: mcpCallsList.length, ok, failed, results, sizeKb }
  const score = scoreAthenaFacts(stats)

  return {
    body: bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    model,
    calls,
    groups,
    summary: parseSummary(summaryLines),
    shellCalls: calls.length - mcpCallsList.length,
    ...stats,
    score,
    quality: qualityFor(score),
  }
}
