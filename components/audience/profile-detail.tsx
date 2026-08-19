"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Lock, HeartPulse, Ban, Network, AlertTriangle, ChevronDown, User, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuppressionForm } from "@/components/consent/suppression-form";
import { formatDisplayName, nameNeedsTidy } from "@/lib/crm/display-name";
import { detectEmailTypo } from "@/lib/crm/email-typo";
import { Why } from "@/components/ui/why";

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

interface HyroxSensitive {
  nik: string | null;
  tglLahir: string | null;
  golDarah: string | null;
  kontakDarurat: string | null;
  noKontakDarurat: string | null;
}

interface NikDerived {
  valid: boolean;
  gender: "male" | "female" | null;
  birthDate: string | null;
  yearOutOfRange: boolean;
  provinceCode: string | null;
  provinceName: string | null;
  regencyCode: string | null;
  districtCode: string | null;
}

interface ProfileEnrichment {
  matchable: boolean;
  hyrox: {
    matched: boolean;
    rows: { eventName: string | null; kategori: string | null; namaTim: string | null; posisi: string | null; registeredAt: string | null }[];
    hasSensitive: boolean;
    sensitive: HyroxSensitive | null;
    nikDerived: NikDerived | null;
  };
  my20fit: { matched: boolean; isPlusMember: boolean | null; onboardingCompleted: boolean | null; createdAt: string | null };
  activity: { matched: boolean; firstSeenAt: string | null; lastActiveAt: string | null; pingCount: number | null };
}

interface ClassInfoT {
  resolved: boolean;
  name: string | null;
  scheduleDate: string | null;
  startTime: string | null;
  endTime: string | null;
  instructor: string | null;
}
interface MultiSourceRowT {
  label: string | null;
  status: string | null;
  extra: Record<string, unknown>;
  classInfo?: ClassInfoT;
}
interface MultiSourceResultT {
  key: string;
  label: string;
  matched: boolean;
  keyUsed: "email" | "phone" | null;
  count: number;
  rows: MultiSourceRowT[];
}
interface ProfileMultiSourceT {
  matchable: boolean;
  sources: MultiSourceResultT[];
}

interface ProfileClinicT {
  gated: boolean;
  matched: boolean;
  keyUsed: "email" | "phone" | null;
  patientCode: string | null;
  sensitive: {
    nik: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    address: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  } | null;
  counts: { bookings: number; visits: number; assessments: number; screenings: number; transactions: number } | null;
  latestBooking: { bookingCode: string | null; status: string | null; date: string | null } | null;
}

interface DobParseT {
  status: "empty" | "unparseable" | "parsed";
  raw: string | null;
  iso: string | null;
  ambiguousDayMonth: boolean;
  swapped: boolean;
  plausibility: "ok" | "future" | "too_old" | "too_young" | null;
}
interface ProfileImportT {
  matchable: boolean;
  matched: boolean;
  city: string | null;
  dob: DobParseT | null;
  age: number | null;
  umurSnapshot: string | null;
  rfmPaidOrder: string | null;
  programs: { key: string; label: string; value: string }[];
  clinicalWithheld: boolean;
}

interface MirrorPresenceT {
  hasHyrox: boolean;
  hasMy20fit: boolean;
  hasArena: boolean;
  hasGym: boolean;
  hasClinic: boolean;
}

export interface ApiResult {
  profile: Profile;
  canViewHealth: boolean;
  engagement: ProfileEngagement | null;
  enrichment: ProfileEnrichment | null;
  multiSource: ProfileMultiSourceT | null;
  clinic: ProfileClinicT | null;
  importData: ProfileImportT | null;
  /** The 5 source-presence flags from this profile's mirror row (Sprint 5B); null if unavailable.
   *  Used to build the consolidated "not connected to …" line and to stamp its freshness. It
   *  drives PRESENTATION only — a live-matched source always renders its block regardless. */
  mirror: MirrorPresenceT | null;
  mirrorRefreshedAt: string | null;
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

type TabId = "demografi" | "perilaku";

/** A count suffix shown in a tab label or a collapsible title. A zero is shown faint but NEVER
 *  hidden — an empty section/tab must read as "no data", not "no feature" (Sprint: tab restructure). */
function CountBadge({ n }: { n: number }) {
  return <span className={`font-mono text-[11px] ${n === 0 ? "text-ink-faint" : "text-ink-soft"}`}>· {nf.format(n)}</span>;
}

/**
 * One collapsible section = a glass card whose header is a native <summary> (keyboard-accessible,
 * no JS state — same approach as <Why>). The title carries a count so an empty section reads as a
 * closed row, never vanishes. `open` is the INITIAL state (open when it has content); the user can
 * toggle freely afterward. Max depth is two: TAB → this. No collapsible inside a collapsible.
 */
function Section({
  title,
  count,
  icon,
  open = true,
  span2 = false,
  children,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  open?: boolean;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className={`glass shadow-glass group rounded-card ${span2 ? "lg:col-span-2" : ""}`}>
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-6 marker:content-['']">
        <span className="flex items-center gap-2">
          {icon}
          <span className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">{title}</span>
          {count != null && <CountBadge n={count} />}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-6 pb-6">{children}</div>
    </details>
  );
}

/** Active tab: persisted in the URL (?tab=) so a link reopens on the same tab, EXCEPT in the dev
 *  preview (many profiles share one URL) where local state is used. All hooks run unconditionally. */
function useProfileTab(isPreview: boolean): [TabId, (t: TabId) => void] {
  const [local, setLocal] = useState<TabId>("demografi");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (isPreview) return [local, setLocal];
  const active: TabId = params.get("tab") === "perilaku" ? "perilaku" : "demografi";
  const set = (t: TabId) => {
    const p = new URLSearchParams(params.toString());
    p.set("tab", t);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return [active, set];
}

/**
 * The two-tab shell. Header stays OUTSIDE (always visible). Each tab label carries a count so an
 * empty tab reads without opening it — "Perilaku · 0" is the whole-profile-empty signal. Both
 * panels stay mounted (hidden), so collapsible open-state survives a tab switch; the tradeoff is
 * that a hidden tab's text is not part of a full-page copy (noted as a limitation). ARIA
 * tablist/tab/tabpanel + arrow-key navigation. Tabs are LAYOUT, never access control — the server
 * already withheld gated data before it reached here.
 */
function ProfileTabs({
  active,
  onTab,
  demografiCount,
  perilakuCount,
  demografi,
  perilaku,
}: {
  active: TabId;
  onTab: (t: TabId) => void;
  demografiCount: number;
  perilakuCount: number;
  demografi: React.ReactNode;
  perilaku: React.ReactNode;
}) {
  const tabs: { id: TabId; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "demografi", label: "Demografi", count: demografiCount, icon: <User className="h-4 w-4" aria-hidden /> },
    { id: "perilaku", label: "Perilaku", count: perilakuCount, icon: <Activity className="h-4 w-4" aria-hidden /> },
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
    onTab(tabs[next].id);
  };
  return (
    <div>
      <div role="tablist" aria-label="Bagian profil" onKeyDown={onKey} className="flex gap-1 border-b border-glass-border">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            id={`tab-${tb.id}`}
            aria-controls={`panel-${tb.id}`}
            aria-selected={active === tb.id}
            tabIndex={active === tb.id ? 0 : -1}
            onClick={() => onTab(tb.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-display text-[13px] font-bold uppercase tracking-wide transition-colors ${
              active === tb.id ? "border-red text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {tb.icon} {tb.label} <CountBadge n={tb.count} />
          </button>
        ))}
      </div>
      {/* `hidden` gives display:none for a11y; the grid class is applied ONLY when visible, because
          a Tailwind `grid` (display:grid) would otherwise override the `hidden` attribute. */}
      <div
        role="tabpanel"
        id="panel-demografi"
        aria-labelledby="tab-demografi"
        hidden={active !== "demografi"}
        className={active === "demografi" ? "mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2" : ""}
      >
        {demografi}
      </div>
      <div
        role="tabpanel"
        id="panel-perilaku"
        aria-labelledby="tab-perilaku"
        hidden={active !== "perilaku"}
        className={active === "perilaku" ? "mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2" : ""}
      >
        {perilaku}
      </div>
    </div>
  );
}

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
          title="last_seen_at = first_seen_at → cap waktu muat, bukan aktivitas"
        >
          tidak terekam
        </span>
      );
  }
}

function EcosystemSection({ engagement }: { engagement: ProfileEngagement | null }) {
  const count = engagement?.totalRows ?? 0;
  return (
    <Section title="Ekosistem 20FIT" count={count} icon={<Network className="h-4 w-4 text-ink-soft" aria-hidden />} open={count > 0} span2>
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
                <strong> belum terekam</strong> — itu bukan sama dengan “tidak aktif”.
              </p>
            </div>
          )}
          {/* Future-date defect kept, but as an inline line — K-28 caps the screen at ONE banner
              (the load-stamp one above), so this rarer note does not add a second tint box. */}
          {engagement.hasFutureAnomaly && (
            <p className="mt-2 font-body text-[12px] leading-relaxed text-red">
              Setidaknya satu baris punya <span className="font-mono">last_seen_at</span> di masa depan —
              cacat data, ditampilkan apa adanya.
            </p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="py-2 pr-4 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Unit</th>
                  <th className="py-2 pr-4 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Produk</th>
                  <th className="py-2 pr-4 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Jumlah</th>
                  <th className="py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Terakhir</th>
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

          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              “Terakhir” hanya menunjukkan tanggal bila baris membawa aktivitas nyata
              (<span className="font-mono">last_seen_at &gt; first_seen_at</span>) — di data ini hampir seluruhnya
              berasal dari <span className="font-mono">live_txn_sync</span> (Transaksi Arena / Transaksi Clinic).
              Selebihnya cap waktu muat, ditandai “tidak terekam”. Dibaca-saja, tanpa <span className="font-mono">raw_value</span> /
              NIK / data sensitif lain (Fase 0). Tautan ke profil lewat <span className="font-mono">customer_id</span>, bukan telepon/email.
            </p>
          </Why>
        </>
      )}
    </Section>
  );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-t border-glass-border py-3 first:border-t-0 first:pt-0">
      <span className="font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={mono ? "font-mono text-[13px] text-ink" : "font-body text-[14px] text-ink"}>{children}</span>
    </div>
  );
}

/** A matched/unmatched source row: matched shows a check + detail; unmatched reads a plain
 *  "no data for this profile" — NEVER a blank that reads as "never participated". */
function SourceLine({ label, matched, children }: { label: string; matched: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-glass-border py-3 first:border-t-0 first:pt-0">
      <span className="font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      {matched ? (
        <span className="font-body text-[14px] text-ink">{children}</span>
      ) : (
        <span className="font-body text-[13px] italic text-ink-faint">tidak ada data {label} untuk profil ini</span>
      )}
    </div>
  );
}

/** Show a date as-is (source string) — used for the stored tgl_lahir which may be swapped. */
function rawDate(v: string | null): string {
  if (!v) return "—";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

const multiKeyLabel = (k: "email" | "phone" | null) =>
  k === "email" ? "cocok via email" : k === "phone" ? "cocok via telepon (format, keyakinan lebih rendah)" : "";

/** "HH:MM" from a stored "HH:MM:SS" time string. */
function hhmm(v: string | null): string | null {
  if (!v) return null;
  return v.length >= 5 ? v.slice(0, 5) : v;
}

/**
 * A class-booking source (arena/gym kelas, TUGAS 4). Summary first: class NAME + attendance count,
 * grouped by name. Bookings whose class name could not be resolved (865 of 2.869 arena, measured)
 * are NOT hidden and NOT guessed — grouped into one honest "nama kelas tak ditemukan" line that
 * still shows the codes. "Lihat detail" expands date/time/instructor/status per booking — the full
 * history stays folded until asked for (the screen was just simplified; don't refill it).
 */
function ClassSourceLine({ s }: { s: MultiSourceResultT }) {
  const [open, setOpen] = useState(false);

  const named = new Map<string, number>();
  const unresolved: MultiSourceRowT[] = [];
  for (const r of s.rows) {
    if (r.classInfo?.resolved && r.classInfo.name) {
      named.set(r.classInfo.name, (named.get(r.classInfo.name) ?? 0) + 1);
    } else {
      unresolved.push(r);
    }
  }
  const namedList = Array.from(named.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <SourceLine label={s.label} matched>
      <span>
        {nf.format(s.count)} kehadiran
        <span className="font-mono text-[12px] text-ink-faint"> · {multiKeyLabel(s.keyUsed)}</span>
      </span>

      {/* Summary: class name × attendance. */}
      {namedList.map(([name, count]) => (
        <span key={name} className="block font-body text-[13px] text-ink-soft">
          {name} <span className="text-ink-faint">· {nf.format(count)}×</span>
        </span>
      ))}
      {unresolved.length > 0 && (
        <span className="block font-body text-[13px] text-ink-faint italic">
          Nama kelas tak ditemukan · {nf.format(unresolved.length)}
          <span className="not-italic"> (kode: {unresolved.slice(0, 3).map((r) => r.label ?? "—").join(", ")}{unresolved.length > 3 ? "…" : ""})</span>
        </span>
      )}

      {/* Detail behind a toggle — date, time, instructor, status per booking. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 inline-block font-display text-[11px] font-semibold uppercase tracking-wide text-ink-soft underline hover:text-ink"
      >
        {open ? "Sembunyikan detail" : `Lihat detail (${nf.format(s.rows.length)} booking)`}
      </button>
      {open && (
        <span className="mt-1 block space-y-1">
          {s.rows.map((r, i) => {
            const ci = r.classInfo;
            const time = ci ? [hhmm(ci.startTime), hhmm(ci.endTime)].filter(Boolean).join("–") : "";
            return (
              <span key={i} className="block font-body text-[12px] text-ink-soft">
                <span className="text-ink">{ci?.resolved && ci.name ? ci.name : <span className="italic text-ink-faint">nama kelas tak ditemukan</span>}</span>
                <span className="font-mono text-[11px] text-ink-faint">
                  {" · "}{r.label ?? "—"}
                  {ci?.scheduleDate ? ` · ${formatDateOnly(ci.scheduleDate)}` : ""}
                  {time ? ` · ${time}` : ""}
                  {ci?.instructor ? ` · ${ci.instructor}` : ""}
                  {r.status ? ` · ${r.status}` : ""}
                </span>
              </span>
            );
          })}
        </span>
      )}
    </SourceLine>
  );
}

/** Matched arena/gym sub-sources, each as one line (Sprint 5B). Class-booking sources get the
 *  name-resolving summary + detail toggle (TUGAS 4); the rest keep the plain code line. */
function MultiGroupLines({ rows }: { rows: MultiSourceResultT[] }) {
  return (
    <>
      {rows.map((s) =>
        s.rows.some((r) => r.classInfo) ? (
          <ClassSourceLine key={s.key} s={s} />
        ) : (
          <SourceLine key={s.key} label={s.label} matched>
            <span>
              {nf.format(s.count)} baris
              <span className="font-mono text-[12px] text-ink-faint"> · {multiKeyLabel(s.keyUsed)}</span>
            </span>
            {s.rows.slice(0, 3).map((r, i) => (
              <span key={i} className="block font-body text-[13px] text-ink-soft">
                {r.label ?? "—"}{r.status ? ` · ${r.status}` : ""}
              </span>
            ))}
          </SourceLine>
        ),
      )}
    </>
  );
}

/** my20fit membership line + its real-activity line (recency), when either matched. */
function My20fitLines({ enrichment }: { enrichment: ProfileEnrichment }) {
  return (
    <>
      {enrichment.my20fit.matched && (
        <SourceLine label="my20fit" matched>
          {enrichment.my20fit.isPlusMember ? "Plus member" : "Pengguna"}{enrichment.my20fit.onboardingCompleted ? " · onboarding selesai" : ""}
        </SourceLine>
      )}
      {enrichment.activity.matched && (
        <SourceLine label="Aktivitas nyata (my20fit)" matched>
          {enrichment.activity.pingCount != null ? `${nf.format(enrichment.activity.pingCount)} kunjungan` : ""}
          {enrichment.activity.lastActiveAt ? (
            <span className="font-mono text-[12px] text-ink-faint"> · terakhir aktif {formatDateOnly(enrichment.activity.lastActiveAt)}</span>
          ) : null}
        </SourceLine>
      )}
    </>
  );
}

/** Hyrox participation line + (view_health only) the sensitive identity sub-block with NIK
 *  provenance. Unchanged logic from the old EnrichmentSection — only its wrapper moved. */
function HyroxLines({ enrichment, canViewHealth }: { enrichment: ProfileEnrichment; canViewHealth: boolean }) {
  return (
    <>
      <SourceLine label="Hyrox" matched>
        {enrichment.hyrox.rows.map((r, i) => (
          <span key={i} className="block">
            {r.eventName ?? "—"}{r.kategori ? ` · ${r.kategori}` : ""}{r.namaTim ? ` · tim ${r.namaTim}` : ""}
            {r.registeredAt ? <span className="font-mono text-[12px] text-ink-faint"> · daftar {formatDateOnly(r.registeredAt)}</span> : null}
          </span>
        ))}
      </SourceLine>

      {enrichment.hyrox.hasSensitive && canViewHealth && enrichment.hyrox.sensitive && (
        <div className="mt-2 rounded-sm border border-glass-border/70 p-4">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-ink-soft" aria-hidden />
            <h3 className="font-display text-[12px] font-semibold uppercase tracking-wide text-ink">Field identitas Hyrox (sensitif)</h3>
          </div>
          <div className="mt-3">
            <Field label="NIK" mono>{enrichment.hyrox.sensitive.nik ?? <Empty />}</Field>
            <Field label="Golongan darah" mono>{enrichment.hyrox.sensitive.golDarah ?? <Empty />}</Field>
            <Field label="Kontak darurat" mono>
              {[enrichment.hyrox.sensitive.kontakDarurat, enrichment.hyrox.sensitive.noKontakDarurat].filter(Boolean).join(" · ") || <Empty />}
            </Field>

            {enrichment.hyrox.nikDerived?.valid && enrichment.hyrox.nikDerived.gender && (
              <Field label="Gender (dari NIK)">
                {enrichment.hyrox.nikDerived.gender === "female" ? "Perempuan" : "Laki-laki"}
              </Field>
            )}

            <Field label="Tanggal lahir" mono>
              {(() => {
                const stored = enrichment.hyrox.sensitive.tglLahir;
                const derived = enrichment.hyrox.nikDerived?.valid ? enrichment.hyrox.nikDerived.birthDate : null;
                const storedShort = stored ? rawDate(stored) : null;
                const disagree = storedShort && derived && storedShort !== derived;
                if (!stored && !derived) return <Empty />;
                if (disagree) {
                  return (
                    <span className="flex flex-col gap-0.5">
                      <span>tersimpan: {storedShort}</span>
                      <span>dari NIK: {derived}</span>
                      <span className="font-body text-[11px] not-italic text-amber">
                        berbeda — kemungkinan hari-bulan tertukar saat impor (321 baris, pola T-16); NIK lebih dipercaya
                      </span>
                    </span>
                  );
                }
                return <span>{derived ?? storedShort}{derived ? <span className="font-body text-[11px] text-ink-faint"> · dari NIK</span> : null}</span>;
              })()}
            </Field>
            {enrichment.hyrox.nikDerived?.yearOutOfRange && (
              <p className="font-body text-[11px] text-amber">Tahun lahir dari NIK di luar rentang wajar — ditandai, tidak dipaksakan.</p>
            )}

            {enrichment.hyrox.nikDerived?.valid && (
              <Field label="Provinsi pendaftaran KTP (dari NIK)">
                {enrichment.hyrox.nikDerived.provinceName
                  ? enrichment.hyrox.nikDerived.provinceName
                  : <span className="font-mono">kode {enrichment.hyrox.nikDerived.provinceCode} (referensi wilayah belum tersedia)</span>}
                <span className="font-body text-[11px] text-ink-faint"> · tempat KTP diterbitkan, bukan domisili sekarang</span>
              </Field>
            )}
          </div>
        </div>
      )}
      {enrichment.hyrox.hasSensitive && !canViewHealth && (
        <p className="font-body text-[12px] italic text-ink-faint">
          Field identitas sensitif (NIK dll.) ada tapi digerbangi — butuh peran <span className="font-mono">profile.view_health</span>.
        </p>
      )}
    </>
  );
}

/** Clinic identity + engagement counts + latest booking (view_health only). No clinical content. */
function ClinicLines({ clinic }: { clinic: ProfileClinicT }) {
  const keyLabel = clinic.keyUsed === "phone" ? "cocok via telepon" : clinic.keyUsed === "email" ? "cocok via email" : "";
  return (
    <div className="space-y-4 border-t border-glass-border pt-3">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-ink-soft" aria-hidden />
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">Klinik (sensitif — profile.view_health)</h3>
      </div>
      <p className="font-mono text-[12px] text-ink-faint">Pasien {clinic.patientCode ?? "—"} · {keyLabel}</p>
      {clinic.sensitive && (
        <div className="tint-red rounded-sm p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="NIK" mono>{clinic.sensitive.nik ?? <Empty />}</Field>
            <Field label="Tanggal lahir" mono>{clinic.sensitive.dateOfBirth ? formatDateOnly(clinic.sensitive.dateOfBirth) : <Empty />}</Field>
            <Field label="Jenis kelamin">{clinic.sensitive.gender ?? <Empty />}</Field>
            <Field label="Alamat">{clinic.sensitive.address ?? <Empty />}</Field>
            <Field label="Kontak darurat">
              {[clinic.sensitive.emergencyContactName, clinic.sensitive.emergencyContactPhone].filter(Boolean).join(" · ") || <Empty />}
            </Field>
          </div>
        </div>
      )}
      {clinic.counts && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Booking", clinic.counts.bookings],
            ["Kunjungan", clinic.counts.visits],
            ["Assessment", clinic.counts.assessments],
            ["Skrining", clinic.counts.screenings],
            ["Transaksi", clinic.counts.transactions],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-sm border border-glass-border p-3 text-center">
              <div className="font-display text-[22px] font-black leading-none text-ink">{nf.format(n as number)}</div>
              <div className="mt-1 font-display text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
            </div>
          ))}
        </div>
      )}
      {clinic.latestBooking && (clinic.latestBooking.bookingCode || clinic.latestBooking.date) && (
        <p className="font-body text-[13px] text-ink-soft">
          Booking terakhir: <span className="font-mono text-[12px]">{clinic.latestBooking.bookingCode ?? "—"}</span>
          {clinic.latestBooking.status ? ` · ${clinic.latestBooking.status}` : ""}
          {clinic.latestBooking.date ? ` · ${formatDateOnly(clinic.latestBooking.date)}` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * Consolidated "other 20FIT sources" (Sprint 5B, K-28). The three old sections (Hyrox/my20fit,
 * arena/gym, clinic) were mostly "no data for this profile" blocks. Here every source WITH content
 * renders its block; every source WITHOUT content collapses into ONE "not connected to …" line,
 * stamped with the mirror's freshness (the line reflects the mirror snapshot, so its age is shown).
 * The mirror decides only the summary line — a live-matched source ALWAYS renders its block, so a
 * stale snapshot can never hide a real connection. Matching-method + gating notes moved to <Why>.
 */
function OtherSourcesSection({
  enrichment,
  multiSource,
  clinic,
  canViewHealth,
  mirror,
  mirrorRefreshedAt,
}: {
  enrichment: ProfileEnrichment | null;
  multiSource: ProfileMultiSourceT | null;
  clinic: ProfileClinicT | null;
  canViewHealth: boolean;
  mirror: MirrorPresenceT | null;
  mirrorRefreshedAt: string | null;
}) {
  const loadFailed = enrichment === null || multiSource === null;

  const arenaRows = (multiSource?.sources ?? []).filter((s) => s.key.startsWith("arena") && s.matched);
  const gymRows = (multiSource?.sources ?? []).filter((s) => s.key.startsWith("gym") && s.matched);

  const groups = [
    { key: "hyrox", label: "Hyrox", live: !!enrichment?.hyrox.matched, mirror: mirror?.hasHyrox, gated: false },
    { key: "my20fit", label: "my20fit", live: !!(enrichment?.my20fit.matched || enrichment?.activity.matched), mirror: mirror?.hasMy20fit, gated: false },
    { key: "arena", label: "arena", live: arenaRows.length > 0, mirror: mirror?.hasArena, gated: false },
    { key: "gym", label: "gym", live: gymRows.length > 0, mirror: mirror?.hasGym, gated: false },
    { key: "clinic", label: "klinik", live: !!(clinic?.gated && clinic.matched), mirror: mirror?.hasClinic, gated: true },
  ];

  // A source is named as "not connected" only when the snapshot marks it absent AND we are not
  // showing a live block for it. Clinic absence is only knowable to a view_health caller (others
  // never fetched it), so it is dropped from the line for them.
  const absent = groups.filter((g) => {
    if (g.gated && !canViewHealth) return false;
    const mirrorAbsent = mirror ? g.mirror === false : !g.live;
    return mirrorAbsent && !g.live;
  });

  const anyBlock = groups.some((g) => g.live);
  const liveCount = groups.filter((g) => g.live).length;
  const matchable = (enrichment?.matchable ?? false) || (multiSource?.matchable ?? false);

  return (
    <Section
      title="Sumber lain 20FIT"
      count={liveCount}
      icon={<Network className="h-4 w-4 text-ink-soft" aria-hidden />}
      open={anyBlock}
      span2
    >
      {loadFailed && (
        <p className="mt-3 font-body text-[12px] text-ink-soft">
          <Badge tone="amber">Sebagian gagal dimuat</Badge>{" "}
          Satu atau lebih sumber gagal dimuat; yang berhasil tetap tampil di bawah.
        </p>
      )}

      {!matchable && !anyBlock ? (
        <p className="mt-4 font-body text-[13px] italic text-ink-faint">
          Profil ini tak punya email atau telepon untuk dicocokkan ke sumber lain.
        </p>
      ) : !anyBlock ? (
        /* No live block at all — the profile is NOT connected to ANY other 20FIT source. The
           5-second test for THIS screen: that emptiness must READ as the headline, not hide as a
           faint footnote. So it gets the prominent empty-state (same weight as the Ekosistem
           empty), naming every absent source at once, stamped with the mirror snapshot it came
           from — a stale snapshot can never hide a real block, because a real block would make
           anyBlock true and take the branch below instead. */
        <div className="mt-4 space-y-3">
          <div className="rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
            <Badge tone="neutral">Tidak tersambung ke sumber lain</Badge>
            <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
              Profil ini <strong>tidak tersambung</strong> ke sumber 20FIT lain mana pun
              {absent.length > 0 ? <> — {absent.map((a) => a.label).join(", ")}</> : null}. Ini kosong
              yang jujur: tak ada kunci (email/telepon) yang cocok ke sumber itu, bukan “belum aktif”.
              {mirrorRefreshedAt && (
                <span className="mt-1 block font-body text-[11px] text-ink-faint">
                  Dari penanda kehadiran cermin per {formatTs(mirrorRefreshedAt)} — “tidak tersambung” berasal dari snapshot ini, bukan pemeriksaan langsung.
                </span>
              )}
            </p>
          </div>
          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              Dicocokkan lewat <strong>email ternormalisasi</strong> dulu, lalu telepon (arena/gym/klinik) — nol
              cocok-nama-saja. “Tidak tersambung” berarti tak ada kunci yang cocok ATAU profil memang tak ada di
              sumber itu. Dibaca &amp; digabung saat tampil, nol tulis, nol salin ke{" "}
              <span className="font-mono">master_customer</span>. Sumber klinis digerbangi{" "}
              <span className="font-mono">profile.view_health</span> dan hanya membawa identitas + volume keterlibatan +
              booking terakhir — isi klinis (diagnosa, hasil, obat) sengaja tidak dibawa.
            </p>
          </Why>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {enrichment?.hyrox.matched && <HyroxLines enrichment={enrichment} canViewHealth={canViewHealth} />}
          {enrichment && (enrichment.my20fit.matched || enrichment.activity.matched) && <My20fitLines enrichment={enrichment} />}
          {arenaRows.length > 0 && <MultiGroupLines rows={arenaRows} />}
          {gymRows.length > 0 && <MultiGroupLines rows={gymRows} />}
          {clinic?.gated && clinic.matched && <ClinicLines clinic={clinic} />}

          {absent.length > 0 && (
            <p className="border-t border-glass-border pt-3 font-body text-[13px] text-ink-soft">
              <span className="italic text-ink-faint">Tidak tersambung ke: {absent.map((a) => a.label).join(", ")}.</span>
              {mirrorRefreshedAt && (
                <span className="font-body text-[11px] text-ink-faint"> · penanda kehadiran cermin per {formatTs(mirrorRefreshedAt)}</span>
              )}
            </p>
          )}

          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              Dicocokkan lewat <strong>email ternormalisasi</strong> dulu, lalu telepon (arena/gym/klinik) — nol
              cocok-nama-saja. “Tidak tersambung” berarti tak ada kunci yang cocok ATAU profil memang tak ada di
              sumber itu. Dibaca &amp; digabung saat tampil, nol tulis, nol salin ke{" "}
              <span className="font-mono">master_customer</span>. Sumber klinis digerbangi{" "}
              <span className="font-mono">profile.view_health</span> dan hanya membawa identitas + volume keterlibatan +
              booking terakhir — isi klinis (diagnosa, hasil, obat) sengaja tidak dibawa.
            </p>
          </Why>
        </div>
      )}
    </Section>
  );
}


/** DOB plausibility → short human note. */
function dobPlausibilityNote(p: DobParseT["plausibility"]): string | null {
  switch (p) {
    case "future": return "tanggal di masa depan — mustahil, ditandai";
    case "too_old": return "umur > 100 — kemungkinan salah, ditandai";
    case "too_young": return "umur < 10 — kemungkinan salah, ditandai";
    default: return null;
  }
}

/**
 * Data impor 20FIT (staging_20fit_data, Sprint 3Y). Ungated marketing demographic — birth date,
 * age (COMPUTED from the date, never the stale Umur snapshot), city, RFM, program participation.
 * Birth-date PROVENANCE is explicit; when a NIK-derived date (gated) also exists and DISAGREES,
 * BOTH are shown with their source — never a silent pick (same rule as Sprint 3S). Clinic-patient
 * program flags are server-omitted for non-view_health callers.
 */
function ImportSection({
  importData,
  nikDob,
  canViewHealth,
}: {
  importData: ProfileImportT | null;
  nikDob: string | null;
  canViewHealth: boolean;
}) {
  const imp = importData;
  const count =
    imp && imp.matched
      ? imp.programs.length + (imp.dob && imp.dob.status === "parsed" ? 1 : 0) + (imp.city ? 1 : 0)
      : 0;
  return (
    <Section
      title="Data impor 20FIT"
      count={count}
      icon={<Network className="h-4 w-4 text-ink-soft" aria-hidden />}
      open={!!imp?.matched}
      span2
    >
      {importData === null ? (
        <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
          <Badge tone="amber">Gagal dimuat</Badge>
          <p className="mx-auto mt-2 max-w-xl font-body text-[13px] text-ink-soft">Data impor gagal dimuat. Sisa profil tetap tampil.</p>
        </div>
      ) : !importData.matchable ? (
        <p className="mt-4 font-body text-[13px] italic text-ink-faint">Profil ini tak punya email untuk dicocokkan ke data impor.</p>
      ) : !importData.matched ? (
        <p className="mt-4 font-body text-[13px] italic text-ink-faint">Profil ini tidak ada di data impor <span className="font-mono">staging_20fit_data</span>.</p>
      ) : (
        <div className="mt-2">
          {/* Birth date + provenance. */}
          <Field label="Tanggal lahir (data impor)" mono>
            {(() => {
              const d = importData.dob;
              if (!d || d.status === "empty") return <Empty />;
              if (d.status === "unparseable") {
                return (
                  <span className="flex flex-col gap-0.5">
                    <span>{d.raw ?? "—"}</span>
                    <span className="font-body text-[11px] not-italic text-amber">format tak dikenal — ditandai, tidak diurai</span>
                  </span>
                );
              }
              const stagingIso = d.iso;
              const disagree = canViewHealth && nikDob && stagingIso && nikDob !== stagingIso;
              const plaus = dobPlausibilityNote(d.plausibility);
              return (
                <span className="flex flex-col gap-0.5">
                  <span>
                    {stagingIso}
                    {importData.age != null ? <span className="font-body text-[12px] text-ink-faint"> · umur {importData.age} th (dihitung)</span> : null}
                    <span className="font-body text-[11px] text-ink-faint"> · dari data impor 20FIT</span>
                  </span>
                  {disagree && (
                    <>
                      <span>dari NIK Hyrox: {nikDob}</span>
                      <span className="font-body text-[11px] not-italic text-amber">
                        dua sumber berbeda — ditampilkan keduanya beserta asalnya, tidak dipilih diam-diam
                      </span>
                    </>
                  )}
                  {d.ambiguousDayMonth && (
                    <span className="font-body text-[11px] not-italic text-amber">
                      hari &amp; bulan sama-sama ≤ 12 — urutan tak bisa dipastikan; ditandai, tidak ditebak
                    </span>
                  )}
                  {d.swapped && (
                    <span className="font-body text-[11px] not-italic text-amber">
                      tersimpan hari-dulu (bulan &gt; 12) — dibaca ulang dengan benar &amp; ditandai
                    </span>
                  )}
                  {plaus && <span className="font-body text-[11px] not-italic text-amber">{plaus}</span>}
                </span>
              );
            })()}
          </Field>

          <Field label="Kota (data impor)">{importData.city ? importData.city : <Empty />}</Field>

          <Field label="RFM (per paid order)">
            {importData.rfmPaidOrder && importData.rfmPaidOrder !== "-" ? (
              <Badge tone="neutral">{importData.rfmPaidOrder}</Badge>
            ) : (
              <span className="font-body text-[13px] italic text-ink-faint">{importData.rfmPaidOrder === "-" ? "− (tanpa bucket)" : "belum terisi"}</span>
            )}
          </Field>

          <Field label="Program yang diikuti">
            {importData.programs.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {importData.programs.map((p) => <Badge key={p.key} tone="neutral">{p.label}</Badge>)}
              </span>
            ) : (
              <span className="font-body text-[13px] italic text-ink-faint">tidak tercatat ikut program apa pun di data impor</span>
            )}
          </Field>

          {importData.clinicalWithheld && (
            <p className="mt-2 font-body text-[11px] italic text-ink-faint">
              Program klinik (pasien 20FIT Clinic) disembunyikan — butuh <span className="font-mono">profile.view_health</span> (menandai pasien = status kesehatan).
            </p>
          )}
          <Why>
            <div className="space-y-1 text-[11px] leading-relaxed text-ink-soft">
              {importData.umurSnapshot && (
                <p>
                  Kolom <span className="font-mono">Umur</span> ({importData.umurSnapshot}) adalah snapshot 20 Apr 2026 yang sudah basi —
                  dipakai hanya sebagai pemeriksa silang tahun, bukan umur yang ditampilkan.
                </p>
              )}
              <p>
                Dari <span className="font-mono">staging_20fit_data</span> (impor yang sama dengan master), dicocokkan lewat{" "}
                <strong>email ternormalisasi</strong> — bukan nama. Nol tulis, nol salin: dibaca &amp; digabung saat tampil.
              </p>
            </div>
          </Why>
        </div>
      )}
    </Section>
  );
}


export function ProfileDetail({
  id,
  canEditConsent,
  previewData,
}: {
  id: string;
  canEditConsent: boolean;
  /** Dev-only fixture (app/dev/preview). When set, ProfileDetail renders it directly and skips the
   *  fetch — no Supabase, no auth, no PII. Same shape as the API so the render is realistic. */
  previewData?: ApiResult;
}) {
  const [data, setData] = useState<ApiResult | null>(previewData ?? null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">(
    previewData ? "ready" : "loading",
  );
  const [suppressOpen, setSuppressOpen] = useState(false);
  const [tab, setTab] = useProfileTab(!!previewData);

  useEffect(() => {
    if (previewData) return; // dev preview: no fetch
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
  }, [id, previewData]);

  const BackLink = () => (
    <Link
      href="/audience"
      className="inline-flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
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

  // Counts for the tab labels + collapsible titles. Perilaku's count is the whole-profile-empty
  // signal: it is 0 exactly when there is no behavioural data at all.
  const contactFilled = [p.phone, p.email, p.city].filter(Boolean).length;
  const kurasiFilled = [p.notes, p.tags && p.tags.length > 0 ? "x" : null, p.duplicate_reason].filter(Boolean).length;
  const imp = data.importData;
  const importCount =
    imp && imp.matched
      ? imp.programs.length + (imp.dob && imp.dob.status === "parsed" ? 1 : 0) + (imp.city ? 1 : 0)
      : 0;
  const ms = data.multiSource?.sources ?? [];
  const liveSourceCount = [
    data.enrichment?.hyrox.matched,
    data.enrichment?.my20fit.matched || data.enrichment?.activity.matched,
    ms.some((s) => s.key.startsWith("arena") && s.matched),
    ms.some((s) => s.key.startsWith("gym") && s.matched),
    data.clinic?.gated && data.clinic.matched,
  ].filter(Boolean).length;
  const attrFilled = [p.first_unit, p.segment, p.lifetime_value != null ? "x" : null, p.source].filter(Boolean).length;
  const demografiCount = contactFilled + attrFilled + importCount;
  const perilakuCount = (data.engagement?.totalRows ?? 0) + liveSourceCount;

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

      {/* Two tabs. Demografi first: for the CS flow (someone calls, staff opens their profile),
          identity + contact is what's needed first. Row METADATA (Jejak waktu, Kurasi & duplikat)
          lives here too, as CLOSED collapsibles — it is about the record, not participation, so it
          fits Demografi better than Perilaku (which is strictly what the person did), but it is
          secondary to the person, so it stays folded. */}
      <ProfileTabs
        active={tab}
        onTab={setTab}
        demografiCount={demografiCount}
        perilakuCount={perilakuCount}
        demografi={
          <>
            <Section title="Kontak" count={contactFilled} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />}>
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
            </Section>

            <Section title="Atribut" count={attrFilled} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />}>
              <Field label="Unit pertama">{p.first_unit ? p.first_unit : <Empty />}</Field>
              <Field label="Segment">
                {p.segment ? <Badge tone="neutral">{p.segment}</Badge> : <span className="font-body text-[13px] italic text-ink-faint">(tanpa segment)</span>}
              </Field>
              <Field label="Lifetime value" mono>
                {p.lifetime_value != null ? (p.lifetime_value > 0 ? idr.format(p.lifetime_value) : <span className="text-ink-faint">Rp 0</span>) : <Empty />}
              </Field>
              <Field label="Sumber" mono>{p.source ? p.source : <Empty />}</Field>
            </Section>

            {/* Data impor 20FIT — carries the birth date + city master_customer lost, the identity a
                CS agent needs. Provenance vs the NIK-derived date is shown, not silently reconciled. */}
            <ImportSection
              importData={data.importData}
              nikDob={data.enrichment?.hyrox.nikDerived?.valid ? data.enrichment.hyrox.nikDerived.birthDate : null}
              canViewHealth={data.canViewHealth}
            />

            {/* Row metadata — closed by default (secondary to the person). */}
            <Section title="Jejak waktu" icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />} open={false}>
              <Field label="Dibuat (cap waktu muat batch)" mono>{formatTs(p.created_at)}</Field>
              {p.source === "live_txn_ingest" ? (
                <Field label="Pertama terlihat" mono>
                  {formatTs(p.first_seen_at)}{" "}
                  <span className="font-body text-[12px] italic text-ink-faint">· dari transaksi (nyata)</span>
                </Field>
              ) : (
                <Field label="First-seen" mono>
                  {formatTs(p.first_seen_at)}{" "}
                  <span className="font-body text-[12px] italic text-ink-faint">· cap waktu muat, BUKAN “pertama terlihat”</span>
                </Field>
              )}
              <Field label="Diperbarui" mono>{formatTs(p.updated_at)}</Field>
              <Why>
                <p className="text-[12px] leading-relaxed text-ink-soft">
                  “First-seen” hanya bermakna pada baris <span className="font-mono">live_txn_ingest</span>;
                  untuk <span className="font-mono">20fit_data_import</span> (98,7% pool) ia sama dengan waktu
                  muat. Segmentasi berbasis recency tidak bisa jujur dengan data ini.
                </p>
              </Why>
            </Section>

            <Section title="Kurasi & duplikat" count={kurasiFilled} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />} open={false}>
              <Field label="Catatan">{p.notes ? p.notes : <Empty />}</Field>
              <Field label="Tag">
                {p.tags && p.tags.length > 0 ? (
                  <span className="flex flex-wrap gap-1.5">{p.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span>
                ) : <Empty />}
              </Field>
              <Field label="Alasan duplikat">{p.duplicate_reason ? p.duplicate_reason : <Empty />}</Field>
            </Section>
          </>
        }
        perilaku={
          <>
            {/* Ekosistem 20FIT — read-only over customer_engagement, keyed by customer_id. */}
            <EcosystemSection engagement={data.engagement} />

            {/* Sumber lain 20FIT — Hyrox/my20fit/arena/gym/klinik in ONE section. Present sources
                render a block; absent ones collapse into one line stamped with the mirror's
                freshness. Sensitive Hyrox + clinic stay view_health-gated (server withholds them). */}
            <OtherSourcesSection
              enrichment={data.enrichment}
              multiSource={data.multiSource}
              clinic={data.clinic}
              canViewHealth={data.canViewHealth}
              mirror={data.mirror}
              mirrorRefreshedAt={data.mirrorRefreshedAt}
            />

            {/* Health flags — structural gate, but no source exists. */}
            {data.canViewHealth && (
              <Section title="Health flags" icon={<HeartPulse className="h-4 w-4 text-ink-soft" aria-hidden />} open={false} span2>
                <div className="rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
                  <Badge tone="neutral">Tidak ada sumber data</Badge>
                  <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
                    <span className="font-mono text-[12px]">master_customer</span> tidak memiliki kolom kesehatan
                    apa pun. Satu-satunya sumber (<span className="font-mono text-[12px]">clinic_*</span>) di luar
                    lingkup dan masih RLS OFF. Ini <strong>bukan</strong> “sehat” dan bukan nol terukur — memang
                    belum ada sumbernya. Gerbang <span className="font-mono text-[12px]">profile.view_health</span>
                    {" "}dipertahankan agar tetap benar begitu sumbernya ada.
                  </p>
                </div>
              </Section>
            )}
          </>
        }
      />

      <p className="font-mono text-[11px] text-ink-faint">
        Baca saja · nol tombol edit/hapus/merge · pembukaan profil ini tercatat sekali (profile.viewed) — pindah tab bukan pembacaan baru · kontak & data sensitif ditahan di server untuk peran tanpa izin (tab hanya tata letak).
      </p>
    </div>
  );
}
