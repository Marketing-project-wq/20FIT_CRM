import { NextResponse, type NextRequest } from "next/server";
import { bearerToken } from "@/lib/crm/agent-mail/token";
import { handleMcpPost } from "@/lib/crm/agent-mail/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Agent Mail MCP with the token in the URL: https://crm.20fit.id/api/mcp/<token>. Same server as
 * /api/mcp, for clients that can't send an Authorization header — a claude.ai custom connector takes
 * only a URL. That is the way in from Claude Code CLOUD sessions: their egress proxy blocks
 * crm.20fit.id, but connector traffic goes through Anthropic's servers (owner report 2026-10-15).
 * The URL is a secret like the token itself; a header token wins when both are present.
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return handleMcpPost(req, bearerToken(req.headers.get("authorization")) || decodeURIComponent(params.token));
}

export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
