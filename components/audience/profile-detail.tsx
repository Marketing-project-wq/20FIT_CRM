"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, HeartPulse, Ban, Network, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuppressionForm } from "@/components/consent/suppression-form";
import { formatDisplayName, nameNeedsTidy } from "@/lib/crm/display-name";
import { detectEmailTypo } from "@/lib/crm/email-typo";

interface Profile {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  first_unit: string | null;
  segment: string | null;
  lifetime_value: number | null;
  source: string | null;
  first_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_potential_duplicate: boolean | null;
  duplicate_reason: string | null;
  is_merged: boolean | null;
  notes: string | null;
  tags: string[] | null;
  masked: boolean;
}

type LastSeenClass = "real_activity" | "load_stamp" | "future_anomaly" | "missing";

interface EngagementRow {
  unit: string;
  product: string;
  engagementCount: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  source: string | null;
  lastSeenClass: LastSeenClass;
}

interface ProfileEngagement {
  rows: EngagementRow[];
  totalRows: number;
  units: string[];
  hasRealActivity: boolean;
  hasFutureAnomaly: boolean;
}

interface ApiResult {
  profile: Profile;
  canViewHealth: boolean;
  engagement: ProfileEngagement | null;
}

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }).format(d);
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  }).format(d);
}

function Empty() {
  return <span className="font-body text-[13px] italic text-ink-faint">belum terisi</span>;
}

const nf = new Intl.NumberFormat("id-ID");

/**
 * Render one ecosystem row's last_seen_at strictly by its classification (K-19). A load
 * stamp is shown as "tidak terekam" — never a date, never a bare em-dash that reads as
 * "no engagement". Only a real-activity row shows a date. A future date is an anomaly.
 */
function LastSeen({ row }: { row: EngagementRow }) {
  switch (row.lastSeenClass) {
    case "real_activity":
      return (
        <span className="font-mono text-[13px] text-ink">
          {formatDateOnly(row.lastSeenAt)}{" "}
          <span className="font-body text-[12px] italic text-ink-faint">· aktivitas nyata</span>
        </span>
      );
    case "future_anomaly":
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[13px] text-ink">
          <AlertTriangle className="h-3.5 w-3.5 text-red" aria-hidden />
          {formatDateOnly(row.lastSeenAt)}{" "}
          <span className="font-body text-[12px] italic text-red">· anomali: tanggal di masa depan</span>
        </span>
      );
    case "missing":
      return <span className="font-body text-[13px] italic text-ink-faint">tidak ada</span>;
    default: // load_stamp
      return (
        <span
          className="font-body text-[13px] italic text-ink-faint"
          title="last_seen_at = first_seen_at → cap waktu muat, bukan aktivitas (K-19)"
        >
          tidak terekam
        </span>
      );
  }
}

function EcosystemSection({ engagement }: { engagement: ProfileEngagement | null }) {
  return (
    <section className="glass shadow-glass p-6 lg:col-span-2">
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-ink-soft" aria-hidden />
        <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Ekosistem 20FIT</h2>
      </div>

      {engagement === null ? (
        <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
          <Badge tone="amber">Gagal dimuat</Badge>
          <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
            Data ekosistem gagal dimuat untuk profil ini. Sisa profil tetap tampil — bagian ini
            dibaca terpisah dan tidak menahan pembukaan profil.
          </p>
        </div>
      ) : engagement.totalRows === 0 ? (
        <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
          <Badge tone="neutral">Tidak muncul di ekosistem</Badge>
          <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
            Profil ini tidak punya satu pun baris di <span className="font-mono text-[12px]">customer_engagement</span>
            {" "}(arena, clinic, event, gym, membership, shop). Ini kosong yang jujur — bukan “tidak aktif”,
            melainkan tidak tercatat di sumber ekosistem mana pun.
          </p>
        </div>
      ) : (
        <>
          {/* When NO row carries a real activity date, say so up front — not "inactive". */}
          {!engagement.hasRealActivity && (
            <div className="tint-blue mt-4 rounded-sm px-3 py-2">
              <p className="font-body text-[12px] leading-relaxed text-ink">
                Semua {nf.format(engagement.totalRows)} titik ekosistem profil ini <strong>cap waktu muat</strong>
                {" "}(<span className="font-mono">last_seen_at = first_seen_at</span>). Riwayat aktivitasnya
                <strong> belum terekam</strong> — itu bukan sama dengan “tidak aktif” (K-19).
              </p>
            </div>
          )}
          {engagement.hasFutureAnomaly && (
            <div className="tint-red mt-3 rounded-sm px-3 py-2">
              <p className="font-body text-[12px] leading-relaxed text-ink">
                Setidaknya satu baris punya <span className="font-mono">last_seen_at</span> di masa depan —
                cacat data, ditampilkan apa adanya (K-20).
              </p>
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="py-2 pr-4 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Unit</th>
                  <th className="py-2 pr-4 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Produk</th>
                  <th className="py-2 pr-4 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Jumlah</th>
                  <th className="py-2 font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {engagement.rows.map((r, i) => (
                  <tr key={`${r.unit}-${r.product}-${i}`} className="border-b border-glass-border/60">
                    <td className="py-2.5 pr-4 font-body text-[13px] text-ink">{r.unit}</td>
                    <td className="py-2.5 pr-4 font-body text-[13px] text-ink">{r.product}</td>
                    <td className="py-2.5 pr-4 font-mono text-[13px] text-ink">
                      {r.engagementCount != null ? nf.format(r.engagementCount) : "—"}
                    </td>
                    <td className="py-2.5"><LastSeen row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 font-body text-[12px] leading-relaxed text-ink-soft">
            “Terakhir” hanya menunjukkan tanggal bila baris membawa aktivitas nyata
            (<span className="font-mono">last_seen_at &gt; first_seen_at</span>) — di data ini hampir seluruhnya
            berasal dari <span className="font-mono">live_txn_sync</span> (Transaksi Arena / Transaksi Clinic).
            Selebihnya cap waktu muat, ditandai “tidak terekam”. Dibaca-saja, tanpa <span className="font-mono">raw_value</span> /
            NIK / data sensitif lain (Fase 0). Tautan ke profil lewat <span className="font-mono">customer_id</span>, bukan telepon/email.
          </p>
        </>
      )}
    </section>
  );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-t border-glass-border py-3 first:border-t-0 first:pt-0">
      <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-ink" : "font-body text-[14px] text-ink"}>{children}</span>
    </div>
  );
}

export function ProfileDetail({ id, canEditConsent }: { id: string; canEditConsent: boolean }) {
  const [data, setData] = useState<ApiResult | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [suppressOpen, setSuppressOpen] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/audience/${id}`, { signal: ac.signal, cache: "no-store" });
        if (res.status === 404) {
          setState("not_found");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        setData((await res.json()) as ApiResult);
        setState("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState("error");
      }
    })();
    return () => ac.abort();
  }, [id]);

  const BackLink = () => (
    <Link
      href="/audience"
      className="inline-flex items-center gap-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Kembali ke audience
    </Link>
  );

  if (state === "loading") {
    return (
      <div className="space-y-6">
        <BackLink />
        <p className="font-body text-[14px] text-ink-soft">Memuat profil…</p>
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="neutral">Tidak ditemukan</Badge>
          <p className="max-w-md font-body text-[14px] text-ink-soft">Profil tidak ditemukan.</p>
        </div>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">Gagal</Badge>
          <p className="max-w-md font-body text-[14px] text-ink-soft">Profil gagal dimuat.</p>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const emailTypo = detectEmailTypo(p.masked ? null : p.email);

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            {formatDisplayName(p.full_name) ?? "Tanpa nama"}
          </h1>
          {/* Original name kept visible when tidying changed it — search still runs over the
              SOURCE column (search-read.ts), so the raw name stays findable. */}
          {nameNeedsTidy(p.full_name) && (
            <p className="mt-1 font-body text-[12px] text-ink-faint">
              Nama asli (dari sumber): <span className="font-mono">{p.full_name}</span>
            </p>
          )}
          <p className="mt-2 font-mono text-[12px] text-ink-faint">{p.customer_id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.masked && (
            <Badge tone="amber" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> Kontak disamarkan</Badge>
          )}
          {p.is_merged ? <Badge tone="neutral">Sudah di-merge</Badge> : null}
          {p.is_potential_duplicate ? <Badge tone="amber">Kemungkinan duplikat</Badge> : null}
          {/* Write entry point — only for roles that may edit consent, and only when a
              real (unmasked) identity exists to suppress. The API re-checks the gate. */}
          {canEditConsent && !p.masked && (p.phone || p.email) && (
            <Button size="sm" variant="outline" onClick={() => setSuppressOpen(true)}>
              <Ban className="h-3.5 w-3.5" /> Catat permintaan berhenti
            </Button>
          )}
        </div>
      </header>

      {canEditConsent && (
        <SuppressionForm
          mode="profile"
          open={suppressOpen}
          onOpenChange={setSuppressOpen}
          customerId={p.customer_id}
          phone={p.masked ? null : p.phone}
          email={p.masked ? null : p.email}
          personName={p.full_name}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Kontak */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Kontak</h2>
          <div className="mt-4">
            <Field label="Telepon" mono>{p.phone ? p.phone : <Empty />}</Field>
            <Field label="Email" mono>
              {p.email ? p.email : <Empty />}
              {/* Typo FLAG only — never an auto-fix. Runs on the real email, so it is shown
                  only to roles that see it unmasked (a masked role can't correct it anyway). */}
              {!p.masked && emailTypo.suspect && (
                <span className="mt-1 flex items-center gap-1.5">
                  <Badge tone="amber" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Mungkin salah ketik
                  </Badge>
                  <span className="font-body text-[12px] text-ink-soft">
                    saran: <span className="font-mono text-ink">{emailTypo.suggestion}</span>{" "}
                    ({emailTypo.confidence === "high" ? "keyakinan tinggi" : "keyakinan sedang"}) — perlu konfirmasi manusia, tidak diperbaiki otomatis
                  </span>
                </span>
              )}
            </Field>
            <Field label="Kota">{p.city ? p.city : <Empty />}</Field>
          </div>
        </section>

        {/* Atribut */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Atribut</h2>
          <div className="mt-4">
            <Field label="Unit pertama">{p.first_unit ? p.first_unit : <Empty />}</Field>
            <Field label="Segment">
              {p.segment ? <Badge tone="neutral">{p.segment}</Badge> : <span className="font-body text-[13px] italic text-ink-faint">(tanpa segment)</span>}
            </Field>
            <Field label="Lifetime value" mono>
              {p.lifetime_value != null ? (p.lifetime_value > 0 ? idr.format(p.lifetime_value) : <span className="text-ink-faint">Rp 0</span>) : <Empty />}
            </Field>
            <Field label="Sumber" mono>{p.source ? p.source : <Empty />}</Field>
          </div>
        </section>

        {/* Jejak waktu — first_seen_at is only real for live_txn_ingest rows; for
            everything else it is a batch-load stamp, so the label is source-aware and
            never says a bare "pertama terlihat". See docs/KOLOM-WAKTU.md. */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Jejak waktu</h2>
          <div className="mt-4">
            <Field label="Dibuat (cap waktu muat batch)" mono>{formatTs(p.created_at)}</Field>
            {p.source === "live_txn_ingest" ? (
              <Field label="Pertama terlihat" mono>
                {formatTs(p.first_seen_at)}{" "}
                <span className="font-body text-[12px] italic text-ink-faint">· dari transaksi (nyata)</span>
              </Field>
            ) : (
              <Field label="First-seen" mono>
                {formatTs(p.first_seen_at)}{" "}
                <span className="font-body text-[12px] italic text-ink-faint">
                  · cap waktu muat, BUKAN “pertama terlihat”
                </span>
              </Field>
            )}
            <Field label="Diperbarui" mono>{formatTs(p.updated_at)}</Field>
            {/* last_activity_at sengaja TIDAK ditampilkan (artefak impor, aturan sejak 3A). */}
          </div>
          <p className="mt-3 font-body text-[12px] leading-relaxed text-ink-soft">
            “First-seen” hanya bermakna pada baris <span className="font-mono">live_txn_ingest</span>;
            untuk <span className="font-mono">20fit_data_import</span> (98,7% pool) ia sama dengan waktu
            muat. Segmentasi berbasis recency tidak bisa jujur dengan data ini —{" "}
            <span className="font-mono">docs/KOLOM-WAKTU.md</span>.
          </p>
        </section>

        {/* Kurasi & duplikat */}
        <section className="glass shadow-glass p-6">
          <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Kurasi & duplikat</h2>
          <div className="mt-4">
            <Field label="Catatan">{p.notes ? p.notes : <Empty />}</Field>
            <Field label="Tag">
              {p.tags && p.tags.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">{p.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span>
              ) : <Empty />}
            </Field>
            <Field label="Alasan duplikat">{p.duplicate_reason ? p.duplicate_reason : <Empty />}</Field>
          </div>
        </section>

        {/* Ekosistem 20FIT — read-only over customer_engagement, keyed by customer_id.
            No second audit row (profile.viewed above already covers this view). */}
        <EcosystemSection engagement={data.engagement} />

        {/* Health flags — structural gate, but no source exists. */}
        {data.canViewHealth && (
          <section className="glass shadow-glass p-6 lg:col-span-2">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-ink-soft" aria-hidden />
              <h2 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">Health flags</h2>
            </div>
            <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
              <Badge tone="neutral">Tidak ada sumber data</Badge>
              <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
                <span className="font-mono text-[12px]">master_customer</span> tidak memiliki kolom kesehatan
                apa pun. Satu-satunya sumber (<span className="font-mono text-[12px]">clinic_*</span>) di luar
                lingkup dan masih RLS OFF. Ini <strong>bukan</strong> “sehat” dan bukan nol terukur — memang
                belum ada sumbernya. Gerbang <span className="font-mono text-[12px]">profile.view_health</span>
                {" "}dipertahankan agar tetap benar begitu sumbernya ada.
              </p>
            </div>
          </section>
        )}
      </div>

      <p className="font-mono text-[11px] text-ink-faint">
        Baca saja · nol tombol edit/hapus/merge · pembukaan profil ini tercatat (profile.viewed) · kontak disamarkan di server untuk peran tanpa izin kontak.
      </p>
    </div>
  );
}
