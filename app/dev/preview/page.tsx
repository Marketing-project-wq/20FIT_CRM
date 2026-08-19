import { AppShell } from "@/components/shell/app-shell";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

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
const STALE_REFRESHED_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

const FIXTURE = {
  audienceSize: 82253,
  contactableMarketing: 82089,
  contactableService: 81760,
  lastProfileAt: "2026-07-31T00:00:00.000Z",
  importDob: 5467,
  importRfm: [
    { value: "New User", count: 74021 },
    { value: "-", count: 7058 },
    { value: "Campion user", count: 612 },
    { value: "Fitco User", count: 448 },
    { value: "Loyal", count: 114 },
  ],
  contactCoverage: { both: 80999, emailOnly: 638, phoneOnly: 616, neither: 0 },
  unitSpread: [
    { unit: "membership", profiles: 67828, source: "mirror" as const },
    { unit: "event", profiles: 18247, source: "mirror" as const },
    { unit: "arena", profiles: 2075, source: "mirror" as const },
    { unit: "clinic", profiles: 1014, source: "mirror" as const },
    { unit: "shop", profiles: 18, source: "live" as const },
    { unit: "gym", profiles: 2, source: "mirror" as const },
  ],
  eventRegistrations: [
    { product: "Mandiri RUNFEST 5K", registrations: 6759 },
    { product: "JHM 5K", registrations: 2648 },
    { product: "JHM 10K", registrations: 2216 },
    { product: "JHM HM", registrations: 1491 },
    { product: "IWHM 5K", registrations: 1244 },
    { product: "IWHM 10K", registrations: 1174 },
    { product: "Raya Run 5K", registrations: 1014 },
    { product: "Raya Run 10K", registrations: 996 },
    { product: "Mandiri RUNFEST 10K", registrations: 685 },
    { product: "Mandiri RUNFEST 2.7K", registrations: 415 },
    { product: "IWHM 21K", registrations: 411 },
    { product: "Sportfest v.02 Double", registrations: 79 },
    { product: "Sportfest v.02 Half", registrations: 71 },
    { product: "Sportfest v.02 Single", registrations: 70 },
    { product: "Sportfest v.02 Relay", registrations: 24 },
  ],
  liveSources: [
    { key: "my20fit", total: 919, inPool: 174, gap: 745 },
    { key: "hyrox", total: 505, inPool: 152, gap: 353 },
    { key: "arena", total: 996, inPool: 653, gap: 343 },
    { key: "gym", total: 10, inPool: 6, gap: 4 },
    { key: "clinic", total: 174, inPool: 123, gap: 51 },
  ],
  mirror: { refreshedAt: STALE_REFRESHED_AT, rowCount: 82253 },
};

export default function DevDashboardPreview() {
  return (
    <AppShell userEmail="marketing@20fit.id" activePath="/" showAllNav>
      <DashboardContent previewStats={FIXTURE} />
    </AppShell>
  );
}
