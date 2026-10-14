import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Agent Mail access token — how an AI agent (Claude Code via the MCP server at /api/mcp) proves WHO
 * it acts for. Stateless and signed: `am1.<payload>.<sig>` (both base64url, HMAC-SHA256 with
 * AGENT_MAIL_SECRET). The payload carries only the CRM user's id + email + issue time; the ROLE is
 * NOT in the token — it is re-read from crm_user_role on every call, so removing someone's role (or
 * demoting them) cuts their agents off immediately. Rotating AGENT_MAIL_SECRET revokes every token.
 */

export const AGENT_TOKEN_PREFIX = "am1";
/** Tokens expire 180 days after issue — long enough for a working setup, short enough to not linger. */
export const AGENT_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface AgentTokenPayload {
  userId: string;
  email: string;
  issuedAt: number; // epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function sign(payloadB64: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${AGENT_TOKEN_PREFIX}.${payloadB64}`).digest();
}

/** The server secret, or "" when unset (then no token can be issued or accepted — fail closed). */
export function agentMailSecret(): string {
  const s = process.env.AGENT_MAIL_SECRET ?? "";
  return s.length >= 32 ? s : "";
}

export function signAgentToken(payload: AgentTokenPayload, secret: string): string {
  if (!secret) throw new Error("AGENT_MAIL_SECRET not set");
  const json = JSON.stringify({ u: payload.userId, e: payload.email, i: payload.issuedAt });
  const p = b64url(Buffer.from(json, "utf8"));
  return `${AGENT_TOKEN_PREFIX}.${p}.${b64url(sign(p, secret))}`;
}

/** Verify signature (constant time) + expiry. Returns the payload or null — never throws. */
export function verifyAgentToken(token: string, secret: string, now = Date.now()): AgentTokenPayload | null {
  if (!secret || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3 || parts[0] !== AGENT_TOKEN_PREFIX) return null;
  const [, p, sig] = parts;
  let given: Buffer;
  try {
    given = fromB64url(sig);
  } catch {
    return null;
  }
  const expected = sign(p, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const obj = JSON.parse(fromB64url(p).toString("utf8")) as { u?: unknown; e?: unknown; i?: unknown };
    if (typeof obj.u !== "string" || typeof obj.e !== "string" || typeof obj.i !== "number") return null;
    if (obj.i > now + 60_000 || now - obj.i > AGENT_TOKEN_TTL_MS) return null;
    return { userId: obj.u, email: obj.e, issuedAt: obj.i };
  } catch {
    return null;
  }
}

/** Pull the token out of an `Authorization: Bearer …` header. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}
