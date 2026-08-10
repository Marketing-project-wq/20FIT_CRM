import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SupabaseStatus = "reachable" | "error" | "unreachable";

/**
 * Liveness + Supabase reachability.
 *
 * Pings the GoTrue health endpoint with the anon key as `apikey` (without it
 * Supabase answers 401). Reports three distinct outcomes and whether the env is
 * configured. Deliberately leaks nothing: no keys, no values, no full URL, no
 * response body, no stack trace — at most an upstream HTTP status code.
 *
 *   supabase: "reachable"   → HTTP 200
 *             "error"       → connected but non-200 (status code only)
 *             "unreachable" → connection failed / timed out
 *   env:      "configured" | "missing"
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const env: "configured" | "missing" = url && anon ? "configured" : "missing";

  let supabase: SupabaseStatus = "unreachable";
  let status: number | undefined;

  if (env === "configured") {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: anon as string },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        supabase = "reachable";
      } else {
        supabase = "error";
        status = res.status; // status code only — never the response body
      }
    } catch {
      supabase = "unreachable"; // DNS/connect failure or timeout
    }
  }

  const ok = supabase === "reachable";
  return NextResponse.json(
    {
      ok,
      timestamp: new Date().toISOString(),
      env,
      supabase,
      ...(status !== undefined ? { status } : {}),
    },
    { status: ok ? 200 : 503 },
  );
}
