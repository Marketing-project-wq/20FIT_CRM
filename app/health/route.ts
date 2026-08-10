import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness + Supabase reachability. Uses the GoTrue health endpoint — the
 * lightest possible request, and one that never touches a customer table.
 * Deliberately leaks nothing: no keys, no full URL, no raw error text.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let supabase: "reachable" | "unreachable" = "unreachable";

  if (url && anon) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: anon },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      supabase = res.ok ? "reachable" : "unreachable";
    } catch {
      supabase = "unreachable";
    }
  }

  const ok = supabase === "reachable";
  return NextResponse.json(
    { ok, timestamp: new Date().toISOString(), supabase },
    { status: ok ? 200 : 503 },
  );
}
