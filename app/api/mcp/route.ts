import { NextResponse, type NextRequest } from "next/server";
import { agentMailSecret, bearerToken, verifyAgentToken } from "@/lib/crm/agent-mail/token";
import { roleForUserId } from "@/lib/auth/role-for-user";
import { TOOLS, callTool, ToolError, type AgentContext } from "@/lib/crm/agent-mail/tools";
import { AGENT_MAIL_GUIDE, AGENT_MCP_NAME } from "@/lib/crm/agent-mail/guide";
import { handleRpcBody, rpcError } from "@/lib/crm/agent-mail/rpc";
import { logApiFailure } from "@/lib/crm/failure-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Agent Mail MCP server — Model Context Protocol over Streamable HTTP, stateless JSON responses (no
 * SSE stream, no session). Claude Code connects with:
 *   claude mcp add --transport http agent-mail-20fit https://crm.20fit.id/api/mcp \
 *     --header "Authorization: Bearer <token from Campaigns → Agent Mail>"
 *
 * NO CRM SESSION: this path is on the middleware's public allowlist (like the webhooks); the signed
 * agent token IS the authorization, and the user's role is re-read from crm_user_role on EVERY
 * request — a demoted or removed user's agents stop working at once. All tools run through the same
 * gates as the human composer (lib/crm/agent-mail/tools.ts). Protocol: lib/crm/agent-mail/rpc.ts.
 */

async function authenticate(req: NextRequest): Promise<AgentContext | NextResponse> {
  const secret = agentMailSecret();
  if (!secret) return NextResponse.json({ error: "agent_mail_not_configured" }, { status: 503 });
  const payload = verifyAgentToken(bearerToken(req.headers.get("authorization")) ?? "", secret);
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

export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
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

/** No server-initiated stream: this server only answers POSTs (allowed by the Streamable HTTP spec). */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
