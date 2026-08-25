import { AppShell } from "@/components/shell/app-shell";
import { LangProvider } from "@/components/i18n/lang-provider";
import { TabBar, type TabDef } from "@/components/shell/tab-bar";
import { RoleGrantForm } from "@/components/settings/role-grant-form";
import { WhatsappPanel } from "@/components/settings/whatsapp-panel";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Dev-only FIXTURE preview of the 4-tab Settings hub (FINAL TUGAS 2) — no Supabase, no auth, no PII.
 * /dev/* is 404 in production. The audit + consent panels here are STATIC facsimiles (the real ones
 * fetch /api/*, which needs a session); the 20FIT Manager form and the WhatsApp panel are the REAL
 * components. All four tabs are stacked so one screenshot per width covers the whole hub at phone and
 * desktop sizes. The responsive table→cards pattern mirrors the real panels.
 */

const SETTINGS_TABS: TabDef[] = [
  { key: "log", label: "CRM Log", href: "/dev/preview-settings#log" },
  { key: "manager", label: "20FIT Manager", href: "/dev/preview-settings#manager" },
  { key: "consent", label: "Consent", href: "/dev/preview-settings#consent" },
  { key: "whatsapp", label: "WhatsApp Business API", href: "/dev/preview-settings#wa" },
];

const AUDIT_ROWS = [
  { t: "25 Agu 08:12", actor: "tifany@20fit.id", action: "campaign.sent", ret: "Kepatuhan", target: "crm_message_log" },
  { t: "25 Agu 07:48", actor: "tifany@20fit.id", action: "list.viewed", ret: "Operasional", target: "master_customer" },
  { t: "24 Agu 14:02", actor: "system:password-reset", action: "login.password_reset_requested", ret: "Operasional", target: "auth.users" },
];
const ROLE_ROWS: { email?: string; userId: string; role: string; granted: string }[] = [
  { email: "tifany@20fit.id", userId: "…", role: "super_admin", granted: "2026-08-11" },
  { email: "zidni@20fit.id", userId: "…", role: "super_admin", granted: "2026-08-11" },
  { email: "marketing@20fit.id", userId: "…", role: "super_admin", granted: "2026-08-12" },
  // Honest handling when an email genuinely can't be resolved (T-33): the uuid is shown WITH a tag, not
  // passed off as the answer. (Illustrative row — not a real member.)
  { userId: "61a71f7f-1840-4226-9747-2e0b0ec70ebe", role: "viewer", granted: "2026-08-25" },
];

function Ident({ email, userId }: { email?: string; userId: string }) {
  if (email) return <>{email}</>;
  return (
    <span className="text-ink-faint">
      {userId}
      <span className="ml-1.5 rounded-sm bg-glass px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        email tak teresolusi
      </span>
    </span>
  );
}

function SectionLabel({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-sm bg-glass px-3 py-2">
      <p className="font-display text-[13px] font-bold text-ink">{title}</p>
      <p className="font-body text-[12px] text-ink-soft">{note}</p>
    </div>
  );
}

export default function PreviewSettings() {
  return (
    <LangProvider lang="id">
      <AppShell userEmail="marketing@20fit.id" activePath="/settings" showAllNav>
        <div className="flex flex-col gap-8">
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Settings</h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">
              Empat tab: CRM Log · 20FIT Manager · Consent · WhatsApp Business API.
            </p>
          </div>
          <TabBar tabs={SETTINGS_TABS} active="log" />

          {/* ── CRM Log ─────────────────────────────────────────── */}
          <section id="log" className="flex flex-col gap-3">
            <SectionLabel title="Tab 1 — CRM Log (audit)" note="Jejak siapa-melakukan-apa. Banner celah id = jejak operasi audit yang gagal." />
            <div className="tint-blue rounded-card p-4">
              <p className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">6 baris audit hilang (celah id)</p>
              <p className="mt-1 font-body text-[12px] text-ink-soft">id 1–239 · 233 ada · 6 hilang (4, 37, 38, 39, 179, 187) — semua tergolong benign (rollback baca).</p>
            </div>
            {/* Wide: table */}
            <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-bold">Waktu</th>
                    <th className="px-4 py-3 font-bold">Aktor</th>
                    <th className="px-4 py-3 font-bold">Aksi</th>
                    <th className="px-4 py-3 font-bold">Retensi</th>
                    <th className="px-4 py-3 font-bold">Target</th>
                  </tr>
                </thead>
                <tbody className="font-body text-[13px] text-ink">
                  {AUDIT_ROWS.map((r) => (
                    <tr key={r.t} className="border-b border-glass-border last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{r.t}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{r.actor}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{r.action}</td>
                      <td className="px-4 py-3"><Badge tone={r.ret === "Kepatuhan" ? "green" : "neutral"}>{r.ret}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-soft">{r.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Narrow: cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {AUDIT_ROWS.map((r) => (
                <div key={r.t} className="rounded-card border border-glass-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[12px] text-ink">{r.action}</span>
                    <Badge tone={r.ret === "Kepatuhan" ? "green" : "neutral"}>{r.ret}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">{r.t} · {r.actor}</p>
                  <p className="font-mono text-[11px] text-ink-faint">{r.target}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── 20FIT Manager ───────────────────────────────────── */}
          <section id="manager" className="flex flex-col gap-3">
            <SectionLabel title="Tab 2 — 20FIT Manager (peran)" note="Email (bukan UUID), hanya anggota crm_user_role. Tambah/ubah/cabut = khusus Super Admin, ber-audit." />
            {/* Wide: table */}
            <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-bold">Pengguna</th>
                    <th className="px-4 py-3 font-bold">Peran</th>
                    <th className="px-4 py-3 font-bold">Diberikan</th>
                  </tr>
                </thead>
                <tbody className="font-body text-[14px] text-ink">
                  {ROLE_ROWS.map((r) => (
                    <tr key={r.userId + r.granted} className="border-b border-glass-border last:border-0">
                      <td className="px-4 py-3 font-mono text-[13px]"><Ident email={r.email} userId={r.userId} /></td>
                      <td className="px-4 py-3"><Badge tone="neutral">{r.role}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{r.granted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Narrow: cards */}
            <div className="flex flex-col gap-2 md:hidden">
              {ROLE_ROWS.map((r) => (
                <div key={r.userId + r.granted} className="rounded-card border border-glass-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-all font-mono text-[13px] text-ink"><Ident email={r.email} userId={r.userId} /></span>
                    <Badge tone="neutral">{r.role}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-ink-faint">Diberikan: {r.granted}</p>
                </div>
              ))}
            </div>
            {/* The REAL management form (add/change/revoke). */}
            <RoleGrantForm />
          </section>

          {/* ── Consent ─────────────────────────────────────────── */}
          <section id="consent" className="flex flex-col gap-3">
            <SectionLabel title="Tab 3 — Consent (arsip baca-saja)" note="Arsip dasar consent (crm_consent). Semua catatan kejujuran dipertahankan; consent bukan gerbang (K-36)." />
            <div className="tint-blue rounded-card p-4">
              <p className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">Makna-nol & backfilled</p>
              <p className="mt-1 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
                Sebagian besar baris consent di-backfill dari status langganan, bukan persetujuan eksplisit. “basis” bersifat provisional. Baca-saja — suppression (unsubscribe) yang menjadi gerbang kirim, bukan tabel ini.
              </p>
            </div>
          </section>

          {/* ── WhatsApp Business API ────────────────────────────── */}
          <section id="wa" className="flex flex-col gap-3">
            <SectionLabel title="Tab 4 — WhatsApp Business API" note="Status koneksi (baca kehadiran kredensial, bukan nilainya). Semua kredensial di Railway." />
            <WhatsappPanel />
          </section>
        </div>
      </AppShell>
    </LangProvider>
  );
}
