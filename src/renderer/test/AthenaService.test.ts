import { describe, expect, it } from "vitest";
import {
  ATHENA_SYSTEM_DIRECTIVE,
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
});
