import { describe, expect, it } from "vitest";
import { parseAthenaResponse } from "../lib/athenaFacts";

const liveTrace = [
  "Let me query GitLab.",
  "",
  '● get_user (MCP: gitlab) · user_id: "ashabbir"',
  '  └ {"id":9739830,"username":"ashabbir","name":"Azam Shabbir","state":...',
  "",
  '✗ get_user (MCP: gitlab) · user_id: "ahmed.shabbir"',
  "  └ MCP server 'gitlab': user not found",
  "",
  '● search (MCP: savant-knowledge) · Ahmed Shabbir · query: "Ahmed Shabb…',
  "  └ Output too large to read at once (66.6 KB). Saved to: /var/folders/q1/x...",
  "",
  "● Parse knowledge search results (shell)",
  "  │ cat",
  "  │ /var/folders/q1/out.txt",
  "  └ 8 lines…",
  "",
  '● list_user_merge_requests (MCP: gitlab) · username: "a_shabbir", role: "author"',
  "  └ []",
  "",
  '✗ savant-knowledge-get_node label: "kgn_1"',
  "  └ Tool 'savant-knowledge-get_node' does not exist.",
  "",
  "**6 nodes committed.**",
].join("\n");

describe("parseAthenaResponse", () => {
  it("extracts multi-line CLI trace blocks and keeps prose in the body", () => {
    const facts = parseAthenaResponse(liveTrace);
    expect(facts.body).toBe("Let me query GitLab.\n\n**6 nodes committed.**");
    expect(facts.calls).toHaveLength(6);
    expect(facts.mcpCalls).toBe(5);
    expect(facts.shellCalls).toBe(1);
    expect(facts.mcpServers).toBe(2);
    expect(facts.failed).toBe(2);
    expect(facts.sizeKb).toBe(66.6);
    const getNode = facts.calls.find((call) => call.tool === "get_node");
    expect(getNode?.server).toBe("savant-knowledge");
    expect(getNode?.status).toBe("error");
    expect(facts.calls.find((call) => call.isShell)?.resultCount).toBe(8);
    expect(facts.calls.find((call) => call.tool === "list_user_merge_requests")?.resultCount).toBe(0);
  });

  it("parses the same-line trace variant", () => {
    const facts = parseAthenaResponse('✗ list_jira_tickets (MCP: savant-workspace) · assignee: "ahmed" └ workspace_id is required.\n\nBased on the graph context provided:');
    expect(facts.calls[0]).toMatchObject({ server: "savant-workspace", tool: "list_jira_tickets", status: "error", args: 'assignee: "ahmed"' });
    expect(facts.body).toBe("Based on the graph context provided:");
  });

  it("parses the prefetch audit table and summary, skipping catalog-only matches", () => {
    const text = [
      "Answer.",
      "",
      "### Savant MCP Execution & Audit",
      "",
      "| MCP Server | Tool | When (UTC) | Why (Rationale) | How (Query / Params) | Result (Evidence) |",
      "| :--- | :--- | :--- | :--- | :--- | :--- |",
      '| `savant-knowledge` | `search` | now | Find nodes | `query="x"` | 3 graph node(s) retrieved: a, b |',
      '| `jira` | `jira.search` | now | External MCP tool matched from query intent terms | `query="x"` | Matched in active MCP catalog: ready |',
      "",
      "#### Execution Details",
      "- **`savant-knowledge` → `search`**: details",
      "",
      "### Savant MCP Summary",
      "- Persona: engineer",
      "- Savant Knowledge MCP: 3 references",
    ].join("\n");
    const facts = parseAthenaResponse(text);
    expect(facts.body).toBe("Answer.");
    expect(facts.calls).toHaveLength(1);
    expect(facts.calls[0]).toMatchObject({ server: "savant-knowledge", source: "prefetch", resultCount: 3 });
    expect(facts.summary).toEqual([
      { label: "Persona", value: "engineer" },
      { label: "Savant Knowledge MCP", value: "3 references" },
    ]);
  });

  it("returns no facts for plain responses", () => {
    const facts = parseAthenaResponse("## Result\n\n- item");
    expect(facts.calls).toHaveLength(0);
    expect(facts.score).toBe(0);
  });
});
