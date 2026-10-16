import { NextResponse, type NextRequest } from "next/server";
import { handleCallback } from "@/lib/partnership/google";
import { logActivity } from "@/lib/partnership/repo";
import { partnerActor } from "../../_auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://crm.20fit.id";
  const a = await partnerActor();
  if (!a.canAdmin) return NextResponse.redirect(new URL("/partnership?tab=pengaturan&google=ditolak", base));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!code) return NextResponse.redirect(new URL(`/partnership?tab=pengaturan&google=${encodeURIComponent(req.nextUrl.searchParams.get("error") ?? "batal")}`, base));
  try {
    const email = await handleCallback(code, state, a.email);
    await logActivity(null, "google", `Google tersambung: ${email}`, {}, a.email ?? "?");
    return NextResponse.redirect(new URL("/partnership?tab=pengaturan&google=ok", base));
  } catch (e) {
    return NextResponse.redirect(new URL(`/partnership?tab=pengaturan&google=${encodeURIComponent((e as Error).message.slice(0, 80))}`, base));
  }
}
