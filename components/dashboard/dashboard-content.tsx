"use client";

import { useEffect, useState } from "react";
import { StatCard } from "./stat-card";

interface DashboardStats {
  audienceSize: number;
  contactableMarketing: number;
  contactableService: number;
  lastProfileAt: string | null;
  importDob: number;
  importRfm: { value: string; count: number }[];
}

function todayWIB(): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

const DASH = "—"; // "no source": this figure has nothing to measure
const LOADING = "…";

/**
 * Dashboard body. The numbers come from /api/dashboard (server-side, role-gated) —
 * the client never queries the database directly.
 *
 * THE ONE RULE THIS SCREEN ENFORCES:
 *   `0`  = "measured, and the answer is zero"   (Bisa dihubungi — a legal fact)
 *   `—`  = "no source to measure yet"           (Workflow aktif — no table exists)
 * They are never swapped. A `0` for something with no source is a lie that looks like
 * data. So "Workflow aktif" is a hard `—` regardless of load state, and the sourced
 * cards fall back to `—` (not `0`) whenever the role is not permitted or the load fails.
 */
export function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { signal: ac.signal, cache: "no-store" });
        if (res.status === 403 || res.status === 401) {
          setState("denied");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        setStats((await res.json()) as DashboardStats);
        setState("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setState("error");
      }
    })();
    return () => ac.abort();
  }, []);

  // Sourced cards: show the real value only when ready; loading -> …, otherwise -> —.
  const sourced = (value: string): string =>
    state === "ready" ? value : state === "loading" ? LOADING : DASH;

  const audienceValue = sourced(stats ? formatCount(stats.audienceSize) : DASH);
  // Both "Bisa dihubungi" figures are DERIVED from the contactability rule over crm_consent +
  // crm_suppression (via a head:true inner-embed count). Marketing and service are separate
  // permissions and shown separately (Migrasi 11). Denied/error -> — like the other cards.
  const contactableMarketingValue = sourced(stats ? formatCount(stats.contactableMarketing) : DASH);
  const contactableServiceValue = sourced(stats ? formatCount(stats.contactableService) : DASH);
  const freshnessValue = sourced(stats ? formatDate(stats.lastProfileAt) : DASH);
  // staging_20fit_data (Sprint 3Y): birth date exists where master_customer had none.
  const importDobValue = sourced(stats ? formatCount(stats.importDob) : DASH);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            Dashboard
          </h1>
          <p className="mt-2 font-body text-[14px] text-ink-soft">Audience Data &amp; CRM 20FIT</p>
        </div>
        <p className="font-mono text-[12px] text-ink-faint">{todayWIB()} · WIB</p>
      </header>

      {state === "denied" && (
        <p className="font-body text-[13px] text-ink-soft">
          Angka disembunyikan: peran Anda tidak berizin melihat daftar profil (fail-closed).
        </p>
      )}
      {state === "error" && (
        <p className="font-body text-[13px] text-ink-soft">
          Angka gagal dimuat. Kartu menampilkan “—” alih-alih menebak.
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total is always shown next to the contactable count (PRD §18.8). */}
        <StatCard
          label="Ukuran audiens"
          value={audienceValue}
          hint="master_customer (baca saja)"
        />
        {/* DERIVED (not hardcoded): active MARKETING consent AND not suppressed, counted via
            a head:true inner-embed of crm_consent (no rows pulled → the backfill can't
            truncate it). */}
        <StatCard
          label="Bisa dihubungi · marketing"
          value={contactableMarketingValue}
          hint="consent marketing aktif − suppression"
        />
        {/* Service (transactional) contact — the permission CS uses to phone customers. A
            DIFFERENT permission from marketing, shown separately (Migrasi 11). */}
        <StatCard
          label="Bisa dihubungi · layanan"
          value={contactableServiceValue}
          hint="consent transactional aktif − suppression (untuk CS/operasional)"
        />
        {/* Hard em-dash: there is no workflow table at all. A 0 here would read as
            "checked, none active" — but it has never been checked, because there is
            nothing to check. */}
        <StatCard label="Workflow aktif" value={DASH} hint="belum ada tabel workflow" />
        {/* Replaces the old "Profil baru · 7 hari": that window reads 0 forever because
            master_customer arrived as TWO batch loads (created_at is a single instant per
            source: 20fit_data_import 2026-04-20, live_txn_ingest 2026-07-31), not a live
            feed. This date is the last BATCH LOAD, not a lagging pipeline — the correction
            matters: "pipeline 11 days late" would send someone hunting a feed that never
            existed. See the /quality finding. */}
        <StatCard
          label="Profil terakhir bertambah"
          value={freshnessValue}
          hint="tanggal muatan batch terakhir (2 muatan: 20 Apr & 31 Jul 2026) — bukan feed berkelanjutan"
        />
        {/* Sprint 3Y: staging_20fit_data carries a birth date master_customer never got. This
            is a SOURCE count (rows with a DOB); the distinct match to profiles (~5.439, 98,6%
            email) is a dated artifact noted in the hint, not a live claim. */}
        <StatCard
          label="Tanggal lahir · data impor"
          value={importDobValue}
          hint="baris staging_20fit_data punya tgl lahir (master_customer: 0) · ~98,6% cocok ke profil (12 Agu 2026)"
        />
      </section>

      {/* RFM spread (staging_20fit_data "per paid order"). A distribution, not a single KPI —
          shown as a small breakdown. 0 = measured zero (K-08); the stored misspelling
          "Campion user" is kept verbatim (not "corrected" to Champion). */}
      {state === "ready" && stats && stats.importRfm.length > 0 && (
        <section>
          <h2 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink-soft">
            Sebaran RFM · data impor 20FIT
          </h2>
          <p className="mt-1 font-body text-[12px] text-ink-faint">
            Dari <span className="font-mono">staging_20fit_data.&quot;RFM per paid order&quot;</span>. “−” = tanpa bucket
            (bukan kosong). Ejaan tersimpan dipertahankan apa adanya. <span className="font-mono">RFM per revenue</span> 0% terisi.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.importRfm.map((r) => (
              <div key={r.value} className="glass rounded-card p-4">
                <div className="font-display text-[26px] font-black leading-none text-ink">{formatCount(r.count)}</div>
                <div className="mt-1 font-display text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                  {r.value === "-" ? "− (tanpa bucket)" : r.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
