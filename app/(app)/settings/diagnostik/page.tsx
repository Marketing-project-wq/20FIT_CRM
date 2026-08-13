import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, CircleDashed, MinusCircle, ExternalLink } from "lucide-react";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { isPermitted, resolveGrant } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { computeVerificationStatus, type ScreenStatus, type VStatus } from "@/lib/crm/verification-status";
import { CoverageNotice } from "@/components/i18n/coverage-notice";
import { runReadLayerChecks, type CheckResult } from "@/lib/crm/diagnostic";
import { fetchAuditLog } from "@/lib/crm/audit-log";
import { logApiFailure } from "@/lib/crm/failure-log";
import { type AuditGapSummary } from "@/lib/crm/audit-gap";

export const metadata: Metadata = { title: "Diagnostik" };
export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }).format(d);
}

const STATUS_META: Record<VStatus, { tone: "green" | "amber" | "blue"; label: string; Icon: typeof CheckCircle2 }> = {
  proven: { tone: "green", label: "Terbukti", Icon: CheckCircle2 },
  unproven: { tone: "amber", label: "Belum terbukti", Icon: CircleDashed },
  not_auditable: { tone: "blue", label: "Tak dapat dibuktikan dari audit", Icon: MinusCircle },
};

export default async function DiagnostikPage() {
  const role = await getCurrentUserRole();
  if (!isPermitted(role, "audit.view")) {
    const decision = resolveGrant(role, "audit.view");
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Diagnostik</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Akses ditolak</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">
            {decision === "needs_scope"
              ? "unit_manager tanpa cakupan unit — akses ditolak (fail-closed)."
              : "Diagnostik hanya untuk super_admin dan crm_manager (gerbang audit.view)."}
          </p>
        </div>
      </div>
    );
  }

  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    userEmail = data.user?.email ?? null;
  } catch {
    userId = null;
  }

  const admin = createAdminClient();

  // Gather everything server-side. The checks call READ LAYERS (not routes), so this
  // writes NO audit rows for the screens it inspects (proven by diagnostic.test.ts).
  let statuses: ScreenStatus[] = [];
  let checks: CheckResult[] = [];
  let gap: AuditGapSummary | null = null;
  let sampleId: string | null = null;
  let gatherError = false;
  try {
    const [s, c, auditForGap, sample] = await Promise.all([
      computeVerificationStatus(admin),
      runReadLayerChecks(admin),
      fetchAuditLog(admin, { page: 1, pageSize: 1 }),
      admin.from("master_customer").select("customer_id").limit(1).maybeSingle(),
    ]);
    statuses = s;
    checks = c;
    gap = auditForGap.gap;
    sampleId = (sample.data as { customer_id: string } | null)?.customer_id ?? null;
  } catch (e) {
    logApiFailure("/settings/diagnostik", "gather_failed", { code: (e as { code?: string })?.code });
    gatherError = true;
  }

  // Opening the diagnostic returns individual rows (evidence times/actors), so it IS
  // audited — reusing list.viewed / crm_audit_log (NOT a new action), distinguished by
  // metadata.view='diagnostik'. If the audit write fails we refuse to serve (K-07),
  // exactly like every other audited read.
  let auditFailed = false;
  if (!gatherError) {
    const { error: auditError } = await admin.from("crm_audit_log").insert({
      actor_id: userId,
      actor_email: userEmail,
      action: "list.viewed",
      target_table: "crm_audit_log",
      summary: "Halaman diagnostik dibuka (status verifikasi terhitung).",
      metadata: { view: "diagnostik" },
    });
    if (auditError) {
      logApiFailure("/settings/diagnostik", "audit_write_failed", { code: auditError.code });
      auditFailed = true;
    }
  }

  const BackLink = () => (
    <Link href="/settings" className="inline-flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:text-ink">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Kembali ke settings
    </Link>
  );

  if (gatherError || auditFailed) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="tint-red rounded-card p-6">
          <Badge tone="red">Diagnostik ditolak</Badge>
          <p className="mt-2 font-body text-[14px] text-ink">
            {gatherError
              ? "Gagal menjalankan pemeriksaan lapisan baca — lihat log Railway (`gather_failed`)."
              : "Pembukaan ini gagal dicatat ke audit, jadi tidak disajikan (aturan K-07). Lihat log Railway (`audit_write_failed`)."}
          </p>
        </div>
      </div>
    );
  }

  const provenV6 = statuses.find((s) => s.key === "profile_detail")?.status === "proven";

  return (
    <div className="space-y-8">
      <CoverageNotice screen="diagnostik" />
      <BackLink />
      <header>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Diagnostik</h1>
        <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">
          Status verifikasi <strong>dihitung dari <span className="font-mono text-[13px]">crm_audit_log</span></strong>,
          bukan diketik ke dokumen — jadi ia tak bisa basi. Pemeriksaan lapisan baca dijalankan saat halaman ini
          dibuka, membuktikan query <span className="font-mono text-[13px]">supabase-js</span> benar-benar jalan
          (yang selama ini butuh terminal + <span className="font-mono text-[13px]">verify-live.mjs</span>).
        </p>
      </header>

      {/* 1. Status per rute — TIGA kategori */}
      <section className="space-y-3">
        <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">Status rute (dari audit)</h2>
        <div className="overflow-x-auto rounded-card border border-glass-border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-bold">Rute</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Bukti terakhir</th>
                <th className="px-4 py-3 font-bold">Oleh</th>
              </tr>
            </thead>
            <tbody className="font-body text-[13px] text-ink">
              {statuses.map((s) => {
                const m = STATUS_META[s.status];
                return (
                  <tr key={s.key} className="border-b border-glass-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{s.label}</div>
                      <div className="font-mono text-[11px] text-ink-faint">{s.route}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={m.tone} className="gap-1.5"><m.Icon className="h-3.5 w-3.5" /> {m.label}</Badge>
                      {s.status === "not_auditable" && (
                        <p className="mt-1 max-w-xs font-body text-[11px] leading-relaxed text-ink-soft">{s.onlyEvidence}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                      {s.status === "proven" ? `${fmt(s.lastAt)} (${s.count}×)` : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">
                      {s.status === "proven" ? (s.lastActor ?? "sistem") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="font-body text-[12px] leading-relaxed text-ink-soft">
          <strong>Belum terbukti</strong> ≠ <strong>tak dapat dibuktikan dari audit</strong>. Yang kedua (Dashboard,
          Quality) <em>sengaja</em> tak menulis audit (K-07): nol baris di sana adalah perilaku yang benar, bukan
          kekurangan bukti. Menyatukan keduanya membalik aturan Sprint 3E.
        </p>
      </section>

      {/* 2. Pemeriksaan lapisan baca */}
      <section className="space-y-3">
        <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">Pemeriksaan lapisan baca</h2>
        <p className="max-w-3xl font-body text-[12px] text-ink-soft">
          Memanggil fungsi lapisan baca yang sebenarnya (bukan route handler), jadi <strong>tidak menulis satu pun
          baris audit</strong> untuk rute yang diperiksa. LULUS = query <span className="font-mono">supabase-js</span> jalan.
        </p>
        <div className="overflow-x-auto rounded-card border border-glass-border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3 font-bold">Lapisan</th>
                <th className="px-4 py-3 font-bold">Hasil</th>
                <th className="px-4 py-3 text-right font-bold">Waktu</th>
              </tr>
            </thead>
            <tbody className="font-body text-[13px] text-ink">
              {checks.map((c) => (
                <tr key={c.layer} className="border-b border-glass-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-semibold">{c.name}</span>{" "}
                    <span className="font-mono text-[11px] text-ink-faint">{c.layer}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.ok ? (
                      <Badge tone="green" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> LULUS</Badge>
                    ) : (
                      <Badge tone="red" className="gap-1.5"><XCircle className="h-3.5 w-3.5" /> GAGAL {c.code ?? ""}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[12px] text-ink-soft">{c.ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Kesehatan gap */}
      <section className="space-y-2">
        <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">Kesehatan gap audit</h2>
        {gap && (
          <div className={`${gap.unexplained > 0 ? "tint-red" : gap.missing > 0 ? "tint-blue" : "tint-blue"} rounded-card p-4`}>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              Rentang id <span className="font-mono">{gap.minId}–{gap.maxId}</span> memuat{" "}
              <span className="font-mono">{gap.count}</span> baris.{" "}
              {gap.missing === 0 ? (
                <strong>Tak ada id hilang</strong>
              ) : (
                <>
                  <strong>{gap.missing}</strong> id hilang: <strong>{gap.knownLegit}</strong> sah (artefak uji),{" "}
                  <strong>{gap.unexplained}</strong> tak dikenal
                </>
              )}
              . Tiap id hilang = satu operasi teraudit yang gagal (barisnya tak pernah mendarat). Sequence tak pernah
              di-reset (K-21).
            </p>
          </div>
        )}
      </section>

      {/* 4. Langkah yang tetap butuh manusia — satu klik */}
      <section className="space-y-2">
        <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">Verifikasi manual — satu klik</h2>
        <div className="rounded-card border border-glass-border p-4">
          {provenV6 ? (
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              <strong>V-6 sudah terbukti</strong> — detail profil menulis <span className="font-mono">profile.viewed</span>{" "}
              di produksi. Tautan di bawah tetap tersedia untuk verifikasi ulang; muat ulang halaman ini setelah mengklik
              untuk melihat “Bukti terakhir” bergerak.
            </p>
          ) : (
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              <strong>V-6 belum terbukti.</strong> Klik satu tautan di bawah untuk membuka satu detail profil — bukan
              instruksi, satu klik. Lalu <strong>muat ulang halaman ini</strong>: V-6 berubah jadi terbukti, <em>atau</em>{" "}
              gap bertambah — dan itu justru jawaban yang dicari sejak Sprint 3K.
            </p>
          )}
          {sampleId ? (
            <Link
              href={`/audience/${sampleId}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-red px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
            >
              Buka satu detail profil <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <p className="mt-2 font-mono text-[12px] text-ink-faint">Tidak ada profil untuk ditautkan.</p>
          )}
        </div>
      </section>

      <p className="font-mono text-[11px] text-ink-faint">
        Baca saja · nol tulis ke data pelanggan/suppression/consent · pemeriksaan memakai lapisan baca (nol audit untuk
        rute yang diperiksa) · pembukaan halaman ini tercatat (list.viewed/crm_audit_log, view=diagnostik) · nol nama/telepon/email pelanggan.
      </p>
    </div>
  );
}
