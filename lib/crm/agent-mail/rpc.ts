/**
 * Agent Mail MCP — the JSON-RPC dispatcher (Model Context Protocol, Streamable HTTP, stateless JSON).
 * Pure: the tools and their executor are injected, so the protocol is unit-tested without Supabase
 * (rpc.test.ts). HTTP + auth live in app/api/mcp/route.ts.
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type RpcId = string | number | null;
export interface RpcRequest {
  jsonrpc?: string;
  id?: RpcId;
  method?: string;
  params?: Record<string, unknown>;
}

export interface RpcDeps {
  serverInfo: { name: string; title?: string; version: string };
  instructions: string;
  tools: { name: string; description: string; inputSchema: Record<string, unknown> }[];
  /** Run a tool. Throw `userError` (via isUserError) for a message the agent should see verbatim. */
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  isUserError: (e: unknown) => boolean;
  onUnexpected?: (tool: string, e: unknown) => void;
}

export const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
export const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Handle one JSON-RPC message. Returns null for a notification (nothing to send back). */
export async function handleRpc(msg: RpcRequest, deps: RpcDeps): Promise<object | null> {
  const id: RpcId = msg.id ?? null;
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isNotification ? null : rpcError(id, -32600, "Invalid Request");
  }

  switch (msg.method) {
    case "initialize": {
      const requested = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: deps.serverInfo,
        instructions: deps.instructions,
      });
    }
    case "ping":
      return isNotification ? null : rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: deps.tools });
    case "tools/call": {
      const name = typeof msg.params?.name === "string" ? msg.params.name : "";
      const rawArgs = msg.params?.arguments;
      const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, unknown>;
      if (!deps.tools.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await deps.call(name, args);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: out.ok === false });
      } catch (e) {
        if (!deps.isUserError(e)) deps.onUnexpected?.(name, e);
        const message = deps.isUserError(e) ? (e as Error).message : "Terjadi kesalahan di server CRM. Coba lagi.";
        return rpcResult(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      // notifications/initialized, notifications/cancelled, … — acknowledged, nothing to return.
      if (isNotification) return null;
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

/** A POST body (single message or batch) → the response body, or null when only notifications came. */
export async function handleRpcBody(body: unknown, deps: RpcDeps): Promise<object | object[] | null> {
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as unknown[];
  const out: object[] = [];
  for (const m of msgs) {
    const r = await handleRpc(m && typeof m === "object" ? (m as RpcRequest) : {}, deps);
    if (r) out.push(r);
  }
  if (out.length === 0) return null;
  return batch ? out : out[0];
}
