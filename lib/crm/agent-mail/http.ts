import { NextResponse, type NextRequest } from "next/server";
import { agentMailSecret, verifyAgentToken } from "@/lib/crm/agent-mail/token";
import { roleForUserId } from "@/lib/auth/role-for-user";
import { TOOLS, callTool, ToolError, type AgentContext } from "@/lib/crm/agent-mail/tools";
import { AGENT_MAIL_GUIDE, AGENT_MCP_NAME } from "@/lib/crm/agent-mail/guide";
import { handleRpcBody, rpcError } from "@/lib/crm/agent-mail/rpc";
import { logApiFailure } from "@/lib/crm/failure-log";

/**
 * The Agent Mail MCP request handler, shared by app/api/mcp (token in the Authorization header) and
 * app/api/mcp/[token] (token in the URL path, for claude.ai custom connectors). See app/api/mcp/route.ts.
 */

async function authenticate(req: NextRequest, token: string): Promise<AgentContext | NextResponse> {
  const secret = agentMailSecret();
  if (!secret) return NextResponse.json({ error: "agent_mail_not_configured" }, { status: 503 });
  const payload = verifyAgentToken(token, secret);
  if (!payload) {
    return NextResponse.json(
      { error: "invalid_token", message: "Token Agent Mail tidak valid / kedaluwarsa. Buat token baru di crm.20fit.id/campaigns?tab=agent." },
      { status: 401 },
    );
  }
  const role = await roleForUserId(payload.userId);
  if (!role) return NextResponse.json({ error: "no_role", message: "Pemilik token tidak punya role CRM aktif." }, { status: 403 });
  return { userId: payload.userId, email: payload.email, role, servingHost: req.headers.get("host") ?? undefined };
}

/** One MCP request, authorized by `token` (from the header here, from the path in the twin route). */
export async function handleMcpPost(req: NextRequest, token: string) {
  const ctx = await authenticate(req, token);
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const out = await handleRpcBody(body, {
    serverInfo: { name: AGENT_MCP_NAME, title: "Agent Mail · 20FIT CRM", version: "1.0.0" },
    instructions: AGENT_MAIL_GUIDE,
    tools: TOOLS,
    call: (name, args) => callTool(ctx, name, args),
    isUserError: (e) => e instanceof ToolError,
    onUnexpected: (tool, e) => logApiFailure("/api/mcp", `tool_failed:${tool}`, { code: (e as { code?: string } | null)?.code ?? null }),
  });
  if (out === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
