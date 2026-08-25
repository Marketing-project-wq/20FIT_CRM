import { AppShell } from "@/components/shell/app-shell";
import { LangProvider } from "@/components/i18n/lang-provider";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { Badge } from "@/components/ui/badge";

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

const ROWS = [
  { name: "Andi Wijaya", phone: "62812••••8953", email: "a••@mail.com", city: "Jakarta", unit: "membership", ltv: "Rp 4.200.000" },
  { name: "Siti Rahmawati", phone: "62813••••1120", email: "s••@mail.com", city: "Bandung", unit: "event", ltv: "Rp 980.000" },
  { name: "Budi Santoso", phone: "—", email: "b••@mail.com", city: "Surabaya", unit: "arena", ltv: "Rp 0" },
];

function FixtureList() {
  return (
    <>
      {/* Wide: table. */}
      <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3 font-bold">Nama</th>
              <th className="px-4 py-3 font-bold">Telepon</th>
              <th className="px-4 py-3 font-bold">Email</th>
              <th className="px-4 py-3 font-bold">Kota</th>
              <th className="px-4 py-3 font-bold">Unit</th>
              <th className="px-4 py-3 text-right font-bold">LTV</th>
            </tr>
          </thead>
          <tbody className="font-body text-[14px] text-ink">
            {ROWS.map((r) => (
              <tr key={r.name} className="border-b border-glass-border last:border-0">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 font-mono text-[13px]">{r.phone}</td>
                <td className="px-4 py-3 font-mono text-[13px]">{r.email}</td>
                <td className="px-4 py-3">{r.city}</td>
                <td className="px-4 py-3">{r.unit}</td>
                <td className="px-4 py-3 text-right font-mono text-[13px]">{r.ltv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Narrow: cards. */}
      <div className="flex flex-col gap-2 md:hidden">
        {ROWS.map((r) => (
          <div key={r.name} className="rounded-card border border-glass-border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-body text-[14px] font-semibold text-ink">{r.name}</span>
              <span className="shrink-0 font-mono text-[12px] text-ink-soft">{r.ltv}</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-0.5 font-body text-[12px] text-ink-soft">
              <span className="font-mono">{r.phone} · {r.email}</span>
              <span>{r.city} · {r.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function PreviewTabs() {
  return (
    <LangProvider lang="id">
      <AppShell userEmail="marketing@20fit.id" activePath="/audience" showAllNav>
        <div className="flex flex-col gap-10">
          <section id="audience" className="flex flex-col gap-4">
            <div className="rounded-sm bg-glass px-3 py-2">
              <p className="font-display text-[13px] font-bold text-ink">Audience — tiga tab (Daftar · Unsubscribe · Kualitas)</p>
              <p className="font-body text-[12px] text-ink-soft">Kualitas + Unsubscribe pindah ke sini; tab menggulir di layar sempit.</p>
            </div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Audience</h1>
            <TabBar tabs={AUDIENCE_TABS} active="list" />
            <FixtureList />
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
