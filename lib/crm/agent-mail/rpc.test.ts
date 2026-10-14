import { describe, it, expect, vi } from "vitest";
import { handleRpcBody, type RpcDeps } from "./rpc";

class UserErr extends Error {}
const deps = (call: RpcDeps["call"] = async () => ({ ok: true, hello: "x" })): RpcDeps => ({
  serverInfo: { name: "agent-mail-20fit", version: "1.0.0" },
  instructions: "guide",
  tools: [{ name: "list_segments", description: "d", inputSchema: { type: "object" } }],
  call,
  isUserError: (e) => e instanceof UserErr,
});

describe("Agent Mail MCP JSON-RPC", () => {
  it("initialize echoes a supported protocol version and advertises tools", async () => {
    const r = (await handleRpcBody({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, deps())) as {
      result: { protocolVersion: string; capabilities: { tools: object }; instructions: string };
    };
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.capabilities.tools).toBeDefined();
    expect(r.result.instructions).toBe("guide");
  });
  it("falls back to the newest version for an unknown one", async () => {
    const r = (await handleRpcBody({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }, deps())) as {
      result: { protocolVersion: string };
    };
    expect(r.result.protocolVersion).toBe("2025-06-18");
  });
  it("a notification gets no response body", async () => {
    expect(await handleRpcBody({ jsonrpc: "2.0", method: "notifications/initialized" }, deps())).toBeNull();
  });
  it("tools/list returns the tools", async () => {
    const r = (await handleRpcBody({ jsonrpc: "2.0", id: "a", method: "tools/list" }, deps())) as { result: { tools: { name: string }[] } };
    expect(r.result.tools.map((t) => t.name)).toEqual(["list_segments"]);
  });
  it("tools/call wraps the result as text content; ok:false → isError", async () => {
    const good = (await handleRpcBody({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_segments", arguments: {} } }, deps())) as {
      result: { content: { text: string }[]; isError: boolean };
    };
    expect(JSON.parse(good.result.content[0].text)).toEqual({ ok: true, hello: "x" });
    expect(good.result.isError).toBe(false);
    const bad = (await handleRpcBody(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_segments" } },
      deps(async () => ({ ok: false, error: "denied" })),
    )) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
  });
  it("a user-facing tool error is shown verbatim; an unexpected one is hidden and reported", async () => {
    const onUnexpected = vi.fn();
    const user = (await handleRpcBody(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_segments" } },
      deps(async () => {
        throw new UserErr("consent_confirmed harus true");
      }),
    )) as { result: { content: { text: string }[]; isError: boolean } };
    expect(user.result.content[0].text).toBe("consent_confirmed harus true");
    const d = { ...deps(async () => { throw new Error("db password leaked in message"); }), onUnexpected };
    const boom = (await handleRpcBody({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "list_segments" } }, d)) as {
      result: { content: { text: string }[] };
    };
    expect(boom.result.content[0].text).not.toContain("password");
    expect(onUnexpected).toHaveBeenCalledOnce();
  });
  it("unknown tool / method → JSON-RPC errors; batches answer per request", async () => {
    const r = (await handleRpcBody(
      [
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope" } },
        { jsonrpc: "2.0", id: 2, method: "resources/list" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 3, method: "ping" },
      ],
      deps(),
    )) as { id: number; error?: { code: number }; result?: object }[];
    expect(r).toHaveLength(3);
    expect(r[0].error?.code).toBe(-32602);
    expect(r[1].error?.code).toBe(-32601);
    expect(r[2].result).toEqual({});
  });
});
