import { NextResponse } from "next/server";
import { qrPng } from "@/lib/partnership/waha";
import { partnerActor } from "../../_auth";

export const dynamic = "force-dynamic";

/** QR image for linking the partnership WhatsApp number (session-gated proxy; the WAHA key stays server-side). */
export async function GET() {
  const a = await partnerActor();
  if (!a.canAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const r = await qrPng();
    if (!r.ok) return NextResponse.json({ error: `waha ${r.status}` }, { status: 502 });
    return new NextResponse(r.body, { headers: { "content-type": r.headers.get("content-type") ?? "image/png", "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
