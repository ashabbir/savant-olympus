import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersService } from "../services/usersService";

describe("UsersService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("preserves the server's bare-array domain assignment response", async () => {
    const domains = [{
      user_id: "guest",
      domain_node_id: "domain-1",
      domain_title: "Research",
      can_write: 1,
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(domains),
    }));

    const service = new UsersService("http://localhost:8090", "secret");

    await expect(service.listUserDomains("guest")).resolves.toEqual(domains);
  });
});
