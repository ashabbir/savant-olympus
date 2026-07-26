import { afterEach, describe, expect, it, vi } from "vitest";
import { AbilitiesService } from "../services/abilitiesService";

describe("AbilitiesService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads personas from the grouped ability assets endpoint", async () => {
    const personas = [{ id: "persona.engineer", type: "persona" }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ persona: personas, rule: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new AbilitiesService("http://localhost:8090", "secret");

    await expect(service.listPersonas()).resolves.toEqual(personas);
    expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/localhost:8090\/api\/abilities\/assets\?/);
  });
});
