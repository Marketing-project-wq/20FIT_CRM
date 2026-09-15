import { AppShell } from "@/components/shell/app-shell";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { ProfileDetail } from "@/components/audience/profile-detail";
import { LangProvider } from "@/components/i18n/lang-provider";
import { DevBanner } from "@/components/dev/dev-banner";
import { PROFILE_FIXTURES } from "./profile-fixtures";

export const dynamic = "force-dynamic";

/**
 * Dev-only VISUAL preview of the dashboard with FIXTURE data — no Supabase, no auth, no PII.
 * /dev/* is 404 in production (app/dev/layout.tsx). The fixture uses the real verified figures
 * (82,253 pool; unit spread 67,828 → 2; contact 80,999/638/616/0) so the render is realistic,
 * INCLUDING the hard cases this sprint is meant to expose visually:
 *   - gym = 2 profiles (does the sqrt-scale bar still make it visible?)
 *   - "neither" contact = 0 (measured zero shown, not dropped)
 *   - a mirror snapshot 3 days old (does the 24h staleness warning stand out?)
 */
const SUMMARY_FIXTURE: import("@/lib/crm/bod-snapshot").BodSnapshot = {
  measuredAt: new Date().toISOString(),
  reach: { emailable: 82213, whatsappable: 81679, poolTotal: 82830, everContacted: 126 },
  loads: [
    { at: "2026-04-20T11:28:33.232369Z", count: 81178 },
    { at: "2026-07-31T12:27:24.795538Z", count: 1075 },
    { at: "2026-08-27T13:39:03.523856Z", count: 577 },
  ],
  units: [
    { unit: "membership", people: 67828 },
    { unit: "event", people: 18247 },
    { unit: "arena", people: 2075 },
    { unit: "clinic", people: 1014 },
    { unit: "shop", people: 18 },
    { unit: "gym", people: 2 },
  ],
  health: { delivered: 120, bounced: 3, failed: 1, unsubscribed: 2, workflowQueued: 36 },
  notInCrmDistinct: 2799,
};

export default function DevDashboardPreview() {
  return (
    <AppShell userEmail="marketing@20fit.id" activePath="/" showAllNav>
      <DevBanner mode="fixture" />
      <div id="shot-full"><DashboardContent summary={SUMMARY_FIXTURE} /></div>

      {/* Profile detail fixtures (Sprint 5B TUGAS 3) — the same shape as /api/audience/[id], no
          Supabase, no PII. Each labelled so the screenshot names the case it exercises. */}
      <div className="mt-12 space-y-12 border-t border-glass-border pt-8">
        <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          Pratinjau detail profil — data fixture
        </p>
        {PROFILE_FIXTURES.map((f) => (
          <div key={f.data.profile.customer_id} className="space-y-3">
            <div className="rounded-sm bg-glass px-3 py-2">
              <p className="font-display text-[13px] font-bold text-ink">{f.label}</p>
              <p className="font-body text-[12px] text-ink-soft">{f.note}</p>
            </div>
            <LangProvider lang="id">
              <ProfileDetail id={f.data.profile.customer_id} canEditConsent={false} previewData={f.data} />
            </LangProvider>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
