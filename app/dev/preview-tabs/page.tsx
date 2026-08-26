import { AppShell } from "@/components/shell/app-shell";
import { LangProvider } from "@/components/i18n/lang-provider";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { Badge } from "@/components/ui/badge";
import { DevBanner } from "@/components/dev/dev-banner";
import { AudiencePool, type AudiencePoolPreview } from "@/components/audience/audience-pool";

export const dynamic = "force-dynamic";

/**
 * Dev-only FIXTURE preview of the consolidated tabbed screens (nav rebuild 11→7) — no Supabase, no
 * auth, no PII. /dev/* is 404 in production. Shows the two new tabbed shells (Audience: 3 tabs,
 * Templates: 2 tabs) and the responsive chrome (drawer sidebar below md), so the layout can be
 * screenshotted at phone and desktop widths without credentials. The panels are static placeholders
 * built with the SAME responsive table→cards pattern the real panels use.
 */

const AUDIENCE_TABS: TabDef[] = [
  { key: "list", label: "Daftar", href: "/dev/preview-tabs#list" },
  { key: "unsubscribe", label: "Unsubscribe", href: "/dev/preview-tabs#unsub" },
  { key: "quality", label: "Kualitas", href: "/dev/preview-tabs#quality" },
];
const TEMPLATE_TABS: TabDef[] = [
  { key: "template", label: "Template", href: "/dev/preview-tabs#tpl" },
  { key: "history", label: "Riwayat Kirim", href: "/dev/preview-tabs#hist" },
];

// Fixture rows in the SAME shape /api/audience returns, so the preview renders the REAL AudiencePool
// component (table + filters + search + quality banner), not a facsimile. `masked: true` exercises the
// contact-masking state; the empty phone + Rp 0 rows exercise the honest empty/zero display.
const AUDIENCE_PREVIEW: AudiencePoolPreview = {
  masked: true,
  total: 82253,
  rows: [
    { customer_id: "a1", full_name: "Andi Wijaya", phone: "62812••••8953", email: "a••@mail.com", city: "Jakarta", first_unit: "membership", segment: "Loyal", lifetime_value: 4200000, created_at: "2026-07-31T00:00:00Z" },
    { customer_id: "a2", full_name: "Siti Rahmawati", phone: "62813••••1120", email: "s••@mail.com", city: "Bandung", first_unit: "event", segment: null, lifetime_value: 980000, created_at: "2026-07-31T00:00:00Z" },
    { customer_id: "a3", full_name: "Budi Santoso", phone: null, email: "b••@mail.com", city: "Surabaya", first_unit: "arena", segment: "New User", lifetime_value: 0, created_at: "2026-07-31T00:00:00Z" },
  ],
};

export default function PreviewTabs() {
  return (
    <LangProvider lang="id">
      <AppShell userEmail="marketing@20fit.id" activePath="/audience" showAllNav>
        <DevBanner mode="fixture" />
        <div className="flex flex-col gap-10">
          <section id="audience" className="flex flex-col gap-4">
            <div className="rounded-sm bg-glass px-3 py-2">
              <p className="font-display text-[13px] font-bold text-ink">Audience — tiga tab (Daftar · Unsubscribe · Kualitas)</p>
              <p className="font-body text-[12px] text-ink-soft">Kualitas + Unsubscribe pindah ke sini; tab menggulir di layar sempit.</p>
            </div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Audience</h1>
            <TabBar tabs={AUDIENCE_TABS} active="list" />
            <AudiencePool preview={AUDIENCE_PREVIEW} />
          </section>

          <section id="templates" className="flex flex-col gap-4">
            <div className="rounded-sm bg-glass px-3 py-2">
              <p className="font-display text-[13px] font-bold text-ink">Templates — dua tab (Template · Riwayat Kirim)</p>
              <p className="font-body text-[12px] text-ink-soft">Riwayat Kirim (dulu Messages) jadi tab di sini.</p>
            </div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Templates</h1>
            <TabBar tabs={TEMPLATE_TABS} active="template" />
            <div className="flex items-center gap-2 rounded-card border border-dashed border-glass-border px-6 py-10">
              <Badge tone="neutral">Template</Badge>
              <span className="font-body text-[13px] text-ink-soft">Penyusun template (pratinjau).</span>
            </div>
          </section>
        </div>
      </AppShell>
    </LangProvider>
  );
}
