import { AppShell } from "@/components/shell/app-shell";
import { LangProvider } from "@/components/i18n/lang-provider";
import { CampaignFlow } from "@/app/(app)/campaigns/campaign-flow";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import { Badge } from "@/components/ui/badge";

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

export default function PreviewCampaign() {
  return (
    <LangProvider lang="id">
      <AppShell userEmail="marketing@20fit.id" activePath="/campaigns" showAllNav>
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
        </div>
      </AppShell>
    </LangProvider>
  );
}
