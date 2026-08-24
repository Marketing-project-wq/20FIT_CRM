import { AppShell } from "@/components/shell/app-shell";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { ProfileDetail } from "@/components/audience/profile-detail";
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
const STALE_REFRESHED_AT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

const FIXTURE = {
  audienceSize: 82253,
  // Real crm_contactable_counts() output (verified 2026-08-24): pool == marketing == service ==
  // 82,253, suppression 0. Equal on all three, so the summary card shows its collapsed phrase — the
  // ACTUAL production state. (The earlier 82,089 / 81,760 here were stale hand-made fixture values,
  // never produced by any calculation; they made the preview exercise the wrong card branch.)
  contactableMarketing: 82253,
  contactableService: 82253,
  lastProfileAt: "2026-07-31T00:00:00.000Z",
  importDob: 5467,
  // Cermin RFM (dashboard_stats.rfm) expanded against the closed vocabulary — the real production
  // shape: "Campion user" is 0 (1 in staging, 0 matched into the mirror) and MUST still appear.
  importRfm: [
    { value: "New User", count: 74021 },
    { value: "Potensial user", count: 6837 },
    { value: "-", count: 1332 },
    { value: "Loyal user", count: 63 },
    { value: "Campion user", count: 0 },
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
  // Candidates NOT yet in the pool (snapshot) — deduped total + per-source (verified dashboard_stats
  // 2026-08-24). Different population from liveSources above (labelled distinctly on screen).
  candidates: {
    total: 2799,
    bySource: [
      { source: "event_transaction", count: 1887 },
      { source: "my20fit_buyers", count: 543 },
      { source: "rc_ticket_invites", count: 329 },
      { source: "uob_users", count: 16 },
      { source: "clinic_bookings", count: 16 },
      { source: "arena_bookings", count: 4 },
      { source: "rc_participants", count: 4 },
    ],
  },
  fitco: { matched: 67653, unmatched: 7260 },
  mirror: { refreshedAt: STALE_REFRESHED_AT, rowCount: 82253 },
};

/** Labelled wrapper so each screenshot names the case it exercises. */
function Case({ id, title, note, children }: { id?: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <div id={id} className="space-y-3 border-t border-glass-border pt-8">
      <div className="rounded-sm bg-glass px-3 py-2">
        <p className="font-display text-[13px] font-bold text-ink">{title}</p>
        <p className="font-body text-[12px] text-ink-soft">{note}</p>
      </div>
      {children}
    </div>
  );
}

export default function DevDashboardPreview() {
  return (
    <AppShell userEmail="marketing@20fit.id" activePath="/" showAllNav>
      <div id="shot-full"><DashboardContent previewStats={FIXTURE} /></div>

      {/* Progressive-load states (TUGAS 4) — the three cases the sprint asks to see: everything
          still computing, the cheap block already in while the rest load, and one section failed. */}
      <div className="mt-12 space-y-12">
        <Case
          id="shot-skeleton"
          title="Muat — skeleton penuh"
          note="Semua blok masih menghitung. Skeleton berbentuk seperti isinya (balok angka, batang). 'Workflow aktif' tetap '—' (nilai nyata, K-08), tak ikut berkedip."
        >
          <DashboardContent previewStatus={{ immediate: "loading", contactable: "loading", mirror: "loading", events: "loading", sources: "loading" }} />
        </Case>

        <Case
          id="shot-partial"
          title="Muat — sebagian sudah terisi"
          note="Blok murah (ukuran pool, kesegaran, cakupan, tgl lahir) sudah tampil; 'bisa dihubungi' (RPC), unit, event, dan sumber masih menyusul di tempatnya sendiri — halaman tak melompat."
        >
          <DashboardContent previewStats={FIXTURE} previewStatus={{ immediate: "ready", contactable: "loading", mirror: "loading", events: "loading", sources: "loading" }} />
        </Case>

        <Case
          id="shot-failed"
          title="Muat — satu bagian gagal (blok snapshot / precompute)"
          note="Blok mirror (precompute) gagal — mis. blok dashboard_stats absen, pembaca fail-hard melempar. Ia tertangkap di batas blok: sebaran unit, RFM, dan kartu kandidat masing-masing menampilkan keadaan gagalnya sendiri + tombol coba lagi; pool, bisa dihubungi, cakupan, event tetap tampil normal. BUKAN halaman kosong, BUKAN nol palsu."
        >
          <DashboardContent previewStats={FIXTURE} previewStatus={{ immediate: "ready", contactable: "ready", mirror: "error", events: "ready", sources: "ready" }} />
        </Case>
      </div>

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
            <ProfileDetail id={f.data.profile.customer_id} canEditConsent={false} previewData={f.data} />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
