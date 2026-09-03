import { AppShell } from "@/components/shell/app-shell";
import { LangProvider } from "@/components/i18n/lang-provider";
import { CampaignFlow } from "@/app/(app)/campaigns/campaign-flow";
import { DeliveriesTab } from "@/app/(app)/campaigns/deliveries-tab";
import type { DeliveryRow } from "@/lib/crm/deliveries";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import { Badge } from "@/components/ui/badge";
import { DevBanner } from "@/components/dev/dev-banner";

export const dynamic = "force-dynamic";

/**
 * Dev-only FIXTURE for the Campaigns rebuild (nav rebuild) — no Supabase, no auth, no PII. /dev/* is
 * 404 in production. Two things a screenshot needs to show:
 *   1. the ONE-title, THREE-ordered-step flow with gating (step 2/3 locked until step 1 has a result);
 *   2. the regrouped filters (Demografi / Kontak / Perilaku) with the AI shortcut collapsed on top and
 *      honesty notes behind "Why?". Both are the REAL components with fixture data.
 */

const SEGMENTS = [
  { id: "s1", name: "Peserta RUNFEST punya email", requiresClinical: false },
  { id: "s2", name: "Member gym aktif", requiresClinical: false },
];
const TEMPLATES = [
  {
    key: "welcome",
    name: "Sambutan RUNFEST",
    subject: "Terima kasih sudah ikut {{event_name}}!",
    body: "Halo {{first_name}},\n\nTerima kasih sudah berlari bersama kami.\n\nBerhenti berlangganan: {{unsubscribe_url}}",
  },
];

// Delivery History fixtures — one of every state + both origins, to show the renamed markers and the
// segment+date default name ("gmail test · 31 Agu 2026" instead of "Unnamed"/an ISO timestamp).
const DELIVERIES: DeliveryRow[] = [
  { kind: "scheduled", id: "d1", runId: null, label: "gmail test · 31 Agu 2026", ownerName: "gmail test", source: "manual", templateKey: "welcome", recipientCount: 36, failedCount: 0, state: "upcoming", time: "2026-09-02T02:00:00Z", cancellable: true, lastError: null },
  { kind: "scheduled", id: "d2", runId: null, label: "Peserta RUNFEST · 30 Agu 2026", ownerName: "Peserta RUNFEST punya email", source: "manual", templateKey: "welcome", recipientCount: 11546, failedCount: 0, state: "overdue", time: "2026-08-30T06:00:00Z", cancellable: true, lastError: null },
  { kind: "run", id: "d3", runId: "r3", label: "Member gym aktif · 29 Agu 2026", ownerName: "Member gym aktif", source: "manual", templateKey: "welcome", recipientCount: 812, failedCount: 3, state: "running", time: "2026-08-31T01:00:00Z", cancellable: false, lastError: null },
  { kind: "run", id: "d4", runId: "r4", label: "Reaktivasi app · 28 Agu 2026", ownerName: "Alur reaktivasi", source: "auto", templateKey: "reactivate", recipientCount: 1500, failedCount: 0, state: "done", time: "2026-08-28T03:00:00Z", cancellable: false, lastError: null },
  { kind: "run", id: "d5", runId: "r5", label: "Broadcast Sept #1", ownerName: "Semua member", source: "manual", templateKey: "welcome", recipientCount: 240, failedCount: 12, state: "stopped", time: "2026-08-27T04:00:00Z", cancellable: false, lastError: "bounce keras > 5% (auto-stop reputasi domain)" },
  // d3 above is the T-46 shape: a run still SENDING (deferred by the daily ceiling) that already has
  // failures. Its status stays resumable on purpose; the failure count must still show on the row.
  // The two states added with T-42, so the markers are visible here before they occur in production.
  { kind: "run", id: "d6", runId: "r6", label: "Ajakan tiket · 26 Agu 2026", ownerName: "Peserta event", source: "manual", templateKey: "welcome", recipientCount: 18243, failedCount: 18119, state: "partial", time: "2026-08-26T07:00:00Z", cancellable: false, lastError: null },
  { kind: "run", id: "d7", runId: "r7", label: "Promo akhir pekan · 25 Agu 2026", ownerName: "Member gym aktif", source: "manual", templateKey: "welcome", recipientCount: 640, failedCount: 640, state: "failed", time: "2026-08-25T09:00:00Z", cancellable: false, lastError: "stopped_consecutive_failures failed_total=640 top_cause=provider_throttled" },
];

export default function PreviewCampaign() {
  return (
    <LangProvider lang="id">
      <AppShell userEmail="marketing@20fit.id" activePath="/campaigns" showAllNav>
        <DevBanner mode="fixture" />
        <div className="flex flex-col gap-8">
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Campaigns</h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">
              Satu layar, satu judul, tiga langkah berurutan: 1 Siapa · 2 Pesan · 3 Kirim.
            </p>
          </div>

          <div className="rounded-sm bg-glass px-3 py-2">
            <p className="font-display text-[13px] font-bold text-ink">Bagian 1 — alur tiga langkah (langkah 2 & 3 terkunci sampai langkah 1 punya hasil)</p>
          </div>
          <CampaignFlow
            segments={SEGMENTS}
            templates={TEMPLATES}
            realSend={false}
            builder={{ cityFillPct: 7.03, cityFilled: 5782, total: 82253, canViewHealth: true, canBuild: true }}
          />

          <div className="rounded-sm bg-glass px-3 py-2">
            <p className="font-display text-[13px] font-bold text-ink">Bagian 2 — kriteria bertingkat (Demografi · Kontak · Perilaku), asisten AI opsional di atas, catatan kejujuran di “Kenapa?”</p>
            <p className="font-body text-[12px] text-ink-soft">Komponen bersama yang sama dipasang di langkah 1 “Buat segmen baru”.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">Embedded</Badge>
            <span className="font-body text-[12px] text-ink-soft">SegmentBuilder tanpa judul kedua (embedded), grup menurut pertanyaan.</span>
          </div>
          <SegmentBuilder embedded cityFillPct={7.03} cityFilled={5782} total={82253} canViewHealth />

          <div className="rounded-sm bg-glass px-3 py-2" id="deliveries-anchor">
            <p className="font-display text-[13px] font-bold text-ink">Bagian 3 — Riwayat Pengiriman: penanda status &amp; asal yang dibaca orang awam, nama kampanye bawaan dari segmen + tanggal</p>
          </div>
          <DeliveriesTab deliveries={DELIVERIES} detail={null} detailRequested={false} />
        </div>
      </AppShell>
    </LangProvider>
  );
}
