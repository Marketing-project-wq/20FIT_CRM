import { NextResponse } from "next/server";
import { authUrl, googleConfigured } from "@/lib/partnership/google";
import { partnerActor } from "../../_auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const a = await partnerActor();
  if (!a.canAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!googleConfigured()) return NextResponse.redirect(new URL("/partnership?tab=pengaturan&google=belum_dikonfigurasi", process.env.NEXT_PUBLIC_APP_URL || "https://crm.20fit.id"));
  return NextResponse.redirect(await authUrl());
}
