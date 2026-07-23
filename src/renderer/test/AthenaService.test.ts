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
  });
});
