import { describe, expect, it, vi } from "vitest";
import {
  ATHENA_SYSTEM_DIRECTIVE,
  ATHENA_WORKSPACE,
  buildAthenaConversationPrompt,
  buildAthenaResearchQuery,
  ensureAthenaMcpSummary,
  requiresAthenaImpactAnalysis,
} from "../services/athenaService";

describe("Athena MCP orchestration", () => {
  it("requires abilities first and knowledge before research", () => {
    expect(ATHENA_SYSTEM_DIRECTIVE).toContain("first use Savant Abilities");
    expect(ATHENA_SYSTEM_DIRECTIVE).toContain("Savant Knowledge as the primary source");
    expect(ATHENA_SYSTEM_DIRECTIVE).toContain("Savant Research/Context");
    expect(ATHENA_SYSTEM_DIRECTIVE).toContain("Do not claim Savant MCP tools were unavailable");
  });

  it("expands change questions to cover upstream and downstream impact", () => {
    const query = buildAthenaResearchQuery("Refactor the authentication service");
    expect(requiresAthenaImpactAnalysis(query)).toBe(true);
    expect(query).toContain("upstream callers consumers");
    expect(query).toContain("downstream dependencies impact surface");
  });

  it("does not force impact research for an unrelated factual question", () => {
    const query = "What does this project represent?";
    expect(requiresAthenaImpactAnalysis(query)).toBe(false);
    expect(buildAthenaResearchQuery(query)).toBe(query);
  });

  it("appends the MCP receipt when the model omits it", () => {
    const prompt = `[BASE PROMPT]\nExplain this.\n\n[REQUIRED MCP SUMMARY]\n- Persona: architect\n- Savant Knowledge MCP: 4 references\n- Savant Research MCP: 3 references`;
    const response = ensureAthenaMcpSummary("A grounded answer.", prompt);
    expect(response).toContain("### Savant MCP Summary");
    expect(response).toContain("Persona: architect");
    expect(response).toContain("Savant Knowledge MCP: 4 references");
  });

  it("does not duplicate a summary already supplied by the model", () => {
    const response = "Answer\n\n### Savant MCP Summary\n- Persona: engineer";
    expect(ensureAthenaMcpSummary(response, "[REQUIRED MCP SUMMARY]\n- Persona: engineer")).toBe(response);
  });

  it("removes a false unavailable-tools disclaimer when MCP evidence exists", () => {
    const response = "Useful analysis.\n\nI could not call Savant Context or other MCP tools here because no Savant MCP tools are currently exposed in this session, so this is based on the code context and findings you provided.\n\nRefactor safely.";
    const result = ensureAthenaMcpSummary(response, "[REQUIRED MCP SUMMARY]\n- Persona: architect\n- Savant Abilities: used");
    expect(result).not.toContain("could not call Savant Context");
    expect(result).toContain("Useful analysis.");
    expect(result).toContain("Refactor safely.");
    expect(result).toContain("Savant MCP Summary");
  });

  it("pins selected context, keeps full history, exposes every MCP, and infers Jira use", async () => {
    const tools = Array.from({ length: 30 }, (_, index) => ({
      name: index === 0 ? "savant-workspace-create_task" : index === 1 ? "jira-search" : index === 2 ? "confluence-read-page" : `external-tool-${index}`,
      description: `Tool ${index}`,
    }));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/api/mcp/tools")) return { ok: true, json: async () => ({ tools }) } as Response;
      if (url.includes("/api/knowledge/graph")) return { ok: true, json: async () => ({ nodes: [] }) } as Response;
      if (url.includes("/api/context/search")) return { ok: true, json: async () => ({ results: [] }) } as Response;
      return { ok: false, json: async () => ({}) } as Response;
    });
    const history = Array.from({ length: 75 }, (_, index) => ({
      sender: index % 2 === 0 ? "user" as const : "assistant" as const,
      text: `historic-message-${index}`,
    }));

    const prompt = await buildAthenaConversationPrompt({
      context: {
        area: "Knowledge > Selected Node",
        repository: "savant-olympus",
        selected: { id: "component-42", name: "PinnedComponent" },
      },
      history,
      userMessage: "Create a Jira issue for this selected component",
      instructions: "Refactor the selected component.",
      baseUrl: "http://127.0.0.1:8090",
      apiKey: "test-key",
      repo: "savant-olympus",
    });

    expect(prompt.indexOf("SELECTED USER CONTEXT")).toBeLessThan(prompt.indexOf("COMPLETE CONVERSATION HISTORY"));
    expect(prompt).toContain("PinnedComponent");
    expect(prompt).toContain("historic-message-0");
    expect(prompt).toContain("historic-message-74");
    expect(prompt).toContain("jira-search");
    expect(prompt).toContain("confluence-read-page");
    expect(prompt).toContain("external-tool-29");
    expect(prompt).toContain(ATHENA_WORKSPACE.id);
    expect(prompt).toContain("Never ask permission before using an available Savant MCP tool");
    expect(prompt).toContain("REQUIRED MCP EXECUTION AUDIT");
    expect(prompt).toContain("savant-abilities");
    expect(prompt).toContain("savant-knowledge");
    expect(prompt).toContain("savant-context");
    expect(prompt).toContain("savant-workspace");
    expect(prompt).toContain("savant-reminders");
  });

  it("discovers tools from server-nested MCP tool endpoints and parses servers correctly", async () => {
    const { fetchAthenaMcpTools } = await import("../services/athenaService");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        servers: [
          { name: "workspace", tools: [{ name: "list_workspaces", description: "List all workspaces" }] },
          { name: "reminders", tools: [{ name: "list_reminders", description: "List all reminders" }] },
        ],
      }),
    } as Response);

    const tools = await fetchAthenaMcpTools("http://127.0.0.1:8090", "test-key");
    expect(tools.length).toBe(2);
    expect(tools.some((t) => t.name.includes("list_workspaces"))).toBe(true);
    expect(tools.some((t) => t.name.includes("list_reminders"))).toBe(true);
    expect(tools[0].server).toBe("workspace");
    expect(tools[1].server).toBe("reminders");
  });

  it("retrieves workspace tasks and reminders context", async () => {
    const { fetchAthenaWorkspaceContext, fetchAthenaRemindersContext } = await import("../services/athenaService");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/api/tasks")) {
        return {
          ok: true,
          json: async () => [
            { task_id: "tid-1", title: "Implement MCP Audit", status: "open", priority: "high" },
          ],
        } as Response;
      }
      if (url.includes("/api/reminders")) {
        return {
          ok: true,
          json: async () => [
            { reminder_id: "rem-1", title: "Review MCP Health", status: "active", due_date: "2026-09-21" },
          ],
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const ws = await fetchAthenaWorkspaceContext("http://127.0.0.1:8090", "test-key");
    expect(ws.tasks.length).toBe(1);
    expect(ws.tasks[0].title).toBe("Implement MCP Audit");

    const reminders = await fetchAthenaRemindersContext("http://127.0.0.1:8090", "test-key");
    expect(reminders.length).toBe(1);
    expect(reminders[0].title).toBe("Review MCP Health");
  });

  it("generates a comprehensive MCP execution audit detailing when, which MCP, why, how, and result", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/api/mcp/tools")) {
        return {
          ok: true,
          json: async () => ({
            servers: [
              { name: "workspace", tools: [{ name: "list_tasks", description: "Tasks" }] },
              { name: "context", tools: [{ name: "research", description: "Research" }] },
            ],
          }),
        } as Response;
      }
      if (url.includes("/api/knowledge/graph")) {
        return {
          ok: true,
          json: async () => ({
            nodes: [
              { node_id: "n1", title: "AuthManager", content: "Manages session auth", node_type: "service" },
            ],
          }),
        } as Response;
      }
      if (url.includes("/api/context/search")) {
        return {
          ok: true,
          json: async () => ({
            results: [
              { path: "src/auth/authManager.ts", content: "class AuthManager {}", title: "authManager.ts" },
            ],
          }),
        } as Response;
      }
      if (url.includes("/api/tasks")) {
        return {
          ok: true,
          json: async () => [
            { task_id: "tid-100", title: "Audit Authentication Service", status: "open" },
          ],
        } as Response;
      }
      if (url.includes("/api/reminders")) {
        return {
          ok: true,
          json: async () => [
            { reminder_id: "rem-10", title: "Security review due", status: "active" },
          ],
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const prompt = await buildAthenaConversationPrompt({
      context: {
        area: "Context > Detail Drawer",
        repository: "savant-olympus",
        selected: { id: "auth-module", name: "AuthModule" },
      },
      history: [],
      userMessage: "How does the authentication module connect to external providers?",
      instructions: "Inspect the authentication code.",
      baseUrl: "http://127.0.0.1:8090",
      apiKey: "test-key",
      repo: "savant-olympus",
    });

    // Check that multiple MCPs were utilized and included in prompt
    expect(prompt).toContain("SAVANT WORKSPACE MCP STATE & TASKS");
    expect(prompt).toContain("SAVANT REMINDERS MCP STATE");
    expect(prompt).toContain("PRIMARY SAVANT KNOWLEDGE MCP RESULTS");
    expect(prompt).toContain("SECONDARY SAVANT CONTEXT AND RESEARCH MCP RESULTS");
    expect(prompt).toContain("REQUIRED MCP EXECUTION AUDIT");

    // Check that audit table columns exist
    expect(prompt).toContain("| MCP Server | Tool | When (UTC) | Why (Rationale) | How (Query / Params) | Result (Evidence) |");
    expect(prompt).toContain("savant-abilities");
    expect(prompt).toContain("savant-knowledge");
    expect(prompt).toContain("savant-context");
    expect(prompt).toContain("savant-workspace");
    expect(prompt).toContain("savant-reminders");

    // Verify ensureAthenaMcpSummary appends the complete audit section
    const responseWithAudit = ensureAthenaMcpSummary("Here is the architectural answer.", prompt);
    expect(responseWithAudit).toContain("### Savant MCP Execution & Audit");
    expect(responseWithAudit).toContain("### Savant MCP Summary");
    expect(responseWithAudit).toContain("When (UTC)");
    expect(responseWithAudit).toContain("Why (Rationale)");
    expect(responseWithAudit).toContain("How (Query / Params)");
    expect(responseWithAudit).toContain("Result (Evidence)");
    expect(responseWithAudit).toContain("savant-workspace");
    expect(responseWithAudit).toContain("savant-reminders");
  });
});

