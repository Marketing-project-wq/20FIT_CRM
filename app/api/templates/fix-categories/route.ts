import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";

const CATEGORY_FIXES: { match: string; category: string }[] = [
  { match: "The new 20FIT app is here", category: "notification" },
  { match: "ISS x JHR Participants", category: "event" },
  { match: "Your Sportfest photos will be deleted", category: "notification" },
  { match: "50% off at 20FIT Arena", category: "promo" },
  { match: "PLN Mobile Electric 5K", category: "event" },
  { match: "Track A · Adopsi aplikasi", category: "notification" },
  { match: "Track A · Aktifkan kembali aplikasi", category: "notification" },
  { match: "Track A · Ajakan ke Arena", category: "promo" },
  { match: "Everything 20FIT, All in One Place", category: "newsletter" },
];

export async function POST() {
  try {
    const role = await getCurrentUserRole();
    if (grantFor(role, "workflow.create") === "deny") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const admin = createAdminClient();
    const results: { template: string; category: string; updated: number }[] = [];

    for (const fix of CATEGORY_FIXES) {
      const { data, error } = await admin
        .from("crm_message_template")
        .update({ category: fix.category })
        .or(`display_name.ilike.%${fix.match}%,name.ilike.%${fix.match}%`)
        .eq("is_active", true)
        .in("category", ["other"])
        .select("id");

      if (error) {
        results.push({ template: fix.match, category: fix.category, updated: -1 });
        console.error(`Failed to update ${fix.match}:`, error);
      } else {
        results.push({ template: fix.match, category: fix.category, updated: data?.length ?? 0 });
      }
    }

    const { data: archived, error: archErr } = await admin
      .from("crm_message_template")
      .update({ status: "archived" })
      .eq("template_key", "__uji_internal__")
      .eq("is_active", true)
      .select("id");

    return NextResponse.json({
      success: true,
      categoryFixes: results,
      archived: archErr ? { error: archErr.message } : { count: archived?.length ?? 0 },
    });
  } catch (err) {
    console.error("fix-categories error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
