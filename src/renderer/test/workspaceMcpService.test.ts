import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMcpService } from "../services/workspaceMcpService";

class FakeEventSource {
  static current: FakeEventSource | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(public url: string) {
    FakeEventSource.current = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }

  emit(type: string, data: string) {
    this.listeners.get(type)?.({ data } as MessageEvent);
  }
}

describe("WorkspaceMcpService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    FakeEventSource.current = null;
  });

  it("normalizes workspace MCP health", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: "ok", port: 8123 }),
    }));
    const service = new WorkspaceMcpService("http://localhost:8090", "secret");
    await expect(service.getHealth()).resolves.toEqual({
      online: true,
      port: 8123,
      raw: { status: "ok", port: 8123 },
    });
  });

  it("encapsulates the SSE initialize and tools/call handshake", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ ok: true, port: 8123 }) })
      .mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", FakeEventSource as any);
    const service = new WorkspaceMcpService("http://localhost:8090", "secret");

    const resultPromise = service.runTool("list_tasks", { status: "todo" }, "session one");
    await vi.waitFor(() => expect(FakeEventSource.current).not.toBeNull());
    const source = FakeEventSource.current!;
    expect(source.url).toContain("http://localhost:8123/sse?api_key=secret&session_id=session%20one");

    source.emit("endpoint", "/messages/abc");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    source.emit("message", JSON.stringify({ id: 2, result: {} }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    source.emit("message", JSON.stringify({ id: 1, result: { tasks: [] } }));

    await expect(resultPromise).resolves.toEqual({ tasks: [] });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_tasks", arguments: { status: "todo" } },
    });
    expect(source.close).toHaveBeenCalled();
  });
});
