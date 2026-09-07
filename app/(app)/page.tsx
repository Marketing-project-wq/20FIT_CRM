import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canViewProfileList } from "@/lib/auth/roles";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchBodSnapshot } from "@/lib/crm/bod";
import { DirectorSummary } from "@/components/dashboard/director-summary";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * The Dashboard — ONE page, TWO layers, a stated boundary between them (K-64).
 *
 *   TOP — Ringkasan Direksi. The board summary that used to live at /bod. Five cards, read from ONE
 *   daily snapshot (crm_mirror_meta.dashboard_stats), carrying ONE timestamp that is the snapshot's
 *   own `refreshed_at` — never `now()` (K-63). Rendered here on the SERVER so the whole layer shares
 *   that single freshness; `nowMs={Date.now()}` is passed in ONLY to decide the staleness banner,
 *   never to stamp the numbers. This is why `fetchBodSnapshot` and `nowMs={Date.now()}` live in THIS
 *   file — the timestamp guard (lib/crm/bod-snapshot.test.ts) now scans this page and
 *   components/dashboard/director-summary.tsx, the two files that moved when /bod folded into here.
 *
 *   BOTTOM — Detail operasional. The rest of the dashboard (source table, candidates, event spread,
 *   contact coverage, customer tier, birthdays), loaded PROGRESSIVELY by the client with MIXED
 *   freshness — some figures computed on page load, some from the mirror snapshot — each part naming
 *   its own time.
 *
 * WHY THE BOUNDARY IS STATED, NOT IMPLIED (K-61 amended). The "one measurement time" promise is
 * per-SECTION, not per-page. The old failure this design fixes was never "a page has more than one
 * freshness" — it was "a page has several freshnesses and nothing says so". Pouring both layers into
 * one stream with no stated break would bring that failure straight back, on purpose this time. So
 * the two layers are separated by a visible rule AND a sentence that names the split.
 */
export default async function DashboardPage() {
  const role = await getCurrentUserRole();
  const { t, lang } = getServerDict();

  // Gated on profile.view_list, the same action /api/dashboard checks (so the operational blocks
  // would 403 anyway) and the same gate the old /bod page carried. A role that cannot see the
  // profile list sees neither layer — both are profile-derived aggregates.
  if (!canViewProfileList(role)) {
    return (
      <div>
        <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">{t.dashboard.title}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">{t.access.dashboardHidden}</p>
        </div>
      </div>
    );
  }

  // parseBodSnapshot throws when a key is missing — including a blob written by the old six-key
  // function (what a rollback leaves behind). The summary layer shows that failure rather than
  // zeros; the operational layer is independent of the snapshot, so it still renders below.
  let data;
  try {
    data = await fetchBodSnapshot(createAdminClient());
  } catch {
    data = null;
  }

  return (
    <div className="space-y-12">
      <header>
        <h1 className="font-display text-[30px] font-extrabold leading-none text-ink">{t.dashboard.title}</h1>
        <p className="mt-2 font-body text-[14px] text-ink-soft">{t.dashboard.subtitle}</p>
      </header>

      {/* ── TOP LAYER — Ringkasan Direksi (snapshot, ONE timestamp) ──────────────────────────── */}
      {data ? (
        <DirectorSummary data={data} t={t} lang={lang} nowMs={Date.now()} />
      ) : (
        <div>
          <h2 className="font-display text-[24px] font-extrabold leading-none text-ink">{t.bod.title}</h2>
          <div className="tint-red mt-6 rounded-card p-5">
            <p className="font-body text-[14px] leading-relaxed text-ink">{t.bod.snapshotMissing}</p>
          </div>
        </div>
      )}

      {/* ── STATED, VISIBLE BOUNDARY between the two layers (K-64) ───────────────────────────────
          A visible rule (the border) AND a sentence (layerBoundary) — because the boundary must be
          stated, not implied. Above is one daily snapshot under one timestamp; below is mixed
          freshness with a timestamp per section. */}
      <div className="border-t-4 border-glass-border pt-6">
        <p role="note" className="tint-amber rounded-sm px-4 py-3 font-body text-[13px] leading-relaxed">
          {t.dashboard.layerBoundary}
        </p>
      </div>

      {/* ── BOTTOM LAYER — Detail operasional (mixed freshness, its own timestamps) ──────────── */}
      <DashboardContent />
    </div>
  );
}
