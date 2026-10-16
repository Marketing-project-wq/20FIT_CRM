import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleWahaEvent } from "@/lib/partnership/engine";
import type { WahaMessageEvent } from "@/lib/partnership/waha";

export const dynamic = "force-dynamic";

/**
 * WAHA → CRM webhook for the partnership WhatsApp session. Public path (no CRM session); the only
 * authorization is the X-Partner-Secret header configured on the WAHA session (WAHA_WEBHOOK_SECRET).
 * Always answers 200 once authorized, so WAHA does not retry an event we already stored.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WAHA_WEBHOOK_SECRET || "";
  const got = Buffer.from(req.headers.get("x-partner-secret") ?? "");
  const want = Buffer.from(secret);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let ev: WahaMessageEvent;
  try {
    ev = (await req.json()) as WahaMessageEvent;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (ev.session && ev.session !== (process.env.WAHA_SESSION || "partnership")) return NextResponse.json({ ok: true, skipped: "other_session" });
  try {
    const r = await handleWahaEvent(ev);
    return NextResponse.json({ ok: true, result: r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
