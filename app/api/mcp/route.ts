import { NextResponse, type NextRequest } from "next/server";
import { bearerToken } from "@/lib/crm/agent-mail/token";
import { handleMcpPost } from "@/lib/crm/agent-mail/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Agent Mail MCP server — Model Context Protocol over Streamable HTTP, stateless JSON responses (no
 * SSE stream, no session). Claude Code connects with:
 *   claude mcp add --transport http agent-mail-20fit https://crm.20fit.id/api/mcp \
 *     --header "Authorization: Bearer <token from Campaigns → Agent Mail>"
 *
 * Twin route: /api/mcp/<token> (app/api/mcp/[token]/route.ts) — same server, token in the URL, for
 * clients that cannot send a header (a claude.ai custom connector; Claude Code CLOUD sessions block
 * crm.20fit.id at their egress proxy but connector traffic goes through Anthropic's servers).
 *
 * NO CRM SESSION: this path is on the middleware's public allowlist (like the webhooks); the signed
 * agent token IS the authorization, and the user's role is re-read from crm_user_role on EVERY
 * request — a demoted or removed user's agents stop working at once. All tools run through the same
 * gates as the human composer (lib/crm/agent-mail/tools.ts). Protocol: lib/crm/agent-mail/rpc.ts.
 */

export async function POST(req: NextRequest) {
  return handleMcpPost(req, bearerToken(req.headers.get("authorization")) ?? "");
}

/** No server-initiated stream: this server only answers POSTs (allowed by the Streamable HTTP spec). */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
