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
import {
  pickBirthDate,
  pickGender,
  normalizeGender,
  demographicProvenance,
  type DobSource,
  type GenderSource,
} from "@/lib/crm/demographic-pick";
import { Why } from "@/components/ui/why";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Dict } from "@/lib/i18n";

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
  /** Identity values — present for a canSeeContact caller (K-31). */
  sensitive: {
    nik: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    address: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  } | null;
  /** Clinical involvement — present ONLY for a canViewHealth caller (being a patient = health). */
  clinical: {
    patientCode: string | null;
    counts: { bookings: number; visits: number; assessments: number; screenings: number; transactions: number } | null;
    latestBooking: { bookingCode: string | null; status: string | null; date: string | null } | null;
  } | null;
}

interface ProfileDemographicT {
  gated: boolean;
  gender: string | null;
  genderSource: string | null;
  dateOfBirth: string | null;
  dateOfBirthSource: string | null;
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
  /** Medical gate (profile.view_health): blood type + clinical involvement. */
  canViewHealth: boolean;
  /** Identity gate (profile.view_contact, K-31): NIK/DOB/gender/province/address/emergency. */
  canSeeContact: boolean;
  engagement: ProfileEngagement | null;
  enrichment: ProfileEnrichment | null;
  multiSource: ProfileMultiSourceT | null;
  clinic: ProfileClinicT | null;
  importData: ProfileImportT | null;
  /** Staff-entered demographic (crm_profile_demographic) — chain's last-resort DOB/gender. */
  demographic: ProfileDemographicT | null;
  /** Server-decided provenance label for CLINIC-sourced identity — "klinik" for a view_health
   *  caller, coarsened to "sumber ekosistem" otherwise so membership never leaks (T-21). */
  clinicSourceLabel: string;
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
  const { t } = useI18n();
  return <span className="font-body text-[13px] italic text-ink-faint">{t.profile.warn.emptyField}</span>;
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
  const { t } = useI18n();
  const tabs: { id: TabId; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "demografi", label: t.profile.tabDemografi, count: demografiCount, icon: <User className="h-4 w-4" aria-hidden /> },
    { id: "perilaku", label: t.profile.tabPerilaku, count: perilakuCount, icon: <Activity className="h-4 w-4" aria-hidden /> },
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
      <div role="tablist" aria-label={t.profile.tabsAria} onKeyDown={onKey} className="flex gap-1 border-b border-glass-border">
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
  const { t } = useI18n();
  switch (row.lastSeenClass) {
    case "real_activity":
      return (
        <span className="font-mono text-[13px] text-ink">
          {formatDateOnly(row.lastSeenAt)}{" "}
          <span className="font-body text-[12px] italic text-ink-faint">· {t.profile.lsReal}</span>
        </span>
      );
    case "future_anomaly":
      return (
        <span className="inline-flex items-center gap-1 font-mono text-[13px] text-ink">
          <AlertTriangle className="h-3.5 w-3.5 text-red" aria-hidden />
          {formatDateOnly(row.lastSeenAt)}{" "}
          <span className="font-body text-[12px] italic text-red">· {t.profile.lsFuture}</span>
        </span>
      );
    case "missing":
      return <span className="font-body text-[13px] italic text-ink-faint">{t.profile.lsMissing}</span>;
    default: // load_stamp
      return (
        <span className="font-body text-[13px] italic text-ink-faint" title={t.profile.lsLoadStampTitle}>
          {t.profile.lsLoadStamp}
        </span>
      );
  }
}

function EcosystemSection({ engagement }: { engagement: ProfileEngagement | null }) {
  const { t } = useI18n();
  const P = t.profile;
  const count = engagement?.totalRows ?? 0;
  return (
    <Section title={P.secEcosystem} count={count} icon={<Network className="h-4 w-4 text-ink-soft" aria-hidden />} open={count > 0} span2>
      {engagement === null ? (
        <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
          <Badge tone="amber">{P.loadFailBadge}</Badge>
          <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
            {P.warn.ecoLoadFail}
          </p>
        </div>
      ) : engagement.totalRows === 0 ? (
        <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
          <Badge tone="neutral">{P.ecoEmptyBadge}</Badge>
          <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
            {P.warn.ecoEmptyA}<span className="font-mono text-[12px]">customer_engagement</span>{P.warn.ecoEmptyB}
          </p>
        </div>
      ) : (
        <>
          {/* When NO row carries a real activity date, say so up front — not "inactive". */}
          {!engagement.hasRealActivity && (
            <div className="tint-blue mt-4 rounded-sm px-3 py-2">
              <p className="font-body text-[12px] leading-relaxed text-ink">
                {P.warn.allLoadA}{nf.format(engagement.totalRows)}{P.warn.allLoadB}<strong>{P.warn.allLoadStrong1}</strong>
                {" ("}<span className="font-mono">last_seen_at = first_seen_at</span>{P.warn.allLoadC}
                <strong>{P.warn.allLoadStrong2}</strong>{P.warn.allLoadD}
              </p>
            </div>
          )}
          {/* Future-date defect kept, but as an inline line — K-28 caps the screen at ONE banner
              (the load-stamp one above), so this rarer note does not add a second tint box. */}
          {engagement.hasFutureAnomaly && (
            <p className="mt-2 font-body text-[12px] leading-relaxed text-red">
              {P.warn.futureA}<span className="font-mono">last_seen_at</span>{P.warn.futureB}
            </p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border">
                  <th className="py-2 pr-4 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{P.ecoColUnit}</th>
                  <th className="py-2 pr-4 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{P.ecoColProduct}</th>
                  <th className="py-2 pr-4 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{P.ecoColCount}</th>
                  <th className="py-2 font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{P.ecoColLast}</th>
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
              {P.warn.ecoWhyA}<span className="font-mono">last_seen_at &gt; first_seen_at</span>{P.warn.ecoWhyB}
              <span className="font-mono">live_txn_sync</span>{P.warn.ecoWhyC}<span className="font-mono">raw_value</span>
              {P.warn.ecoWhyD}<span className="font-mono">customer_id</span>{P.warn.ecoWhyE}
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
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1 border-t border-glass-border py-3 first:border-t-0 first:pt-0">
      <span className="font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</span>
      {matched ? (
        <span className="font-body text-[14px] text-ink">{children}</span>
      ) : (
        <span className="font-body text-[13px] italic text-ink-faint">{t.profile.warn.sourceNoData}</span>
      )}
    </div>
  );
}

const multiKeyLabel = (k: "email" | "phone" | null, P: Dict["profile"]) =>
  k === "email" ? P.keyEmail : k === "phone" ? P.keyPhone : "";

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
  const { t } = useI18n();
  const P = t.profile;
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
        {nf.format(s.count)}{P.attendanceSuffix}
        <span className="font-mono text-[12px] text-ink-faint"> · {multiKeyLabel(s.keyUsed, P)}</span>
      </span>

      {/* Summary: class name × attendance. */}
      {namedList.map(([name, count]) => (
        <span key={name} className="block font-body text-[13px] text-ink-soft">
          {name} <span className="text-ink-faint">· {nf.format(count)}×</span>
        </span>
      ))}
      {unresolved.length > 0 && (
        <span className="block font-body text-[13px] text-ink-faint italic">
          {P.classNotFound} · {nf.format(unresolved.length)}
          <span className="not-italic">{P.classCodesPrefix}{unresolved.slice(0, 3).map((r) => r.label ?? "—").join(", ")}{unresolved.length > 3 ? "…" : ""})</span>
        </span>
      )}

      {/* Detail behind a toggle — date, time, instructor, status per booking. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 inline-block font-display text-[11px] font-semibold uppercase tracking-wide text-ink-soft underline hover:text-ink"
      >
        {open ? P.hideDetail : `${P.showDetailA}${nf.format(s.rows.length)}${P.showDetailB}`}
      </button>
      {open && (
        <span className="mt-1 block space-y-1">
          {s.rows.map((r, i) => {
            const ci = r.classInfo;
            const time = ci ? [hhmm(ci.startTime), hhmm(ci.endTime)].filter(Boolean).join("–") : "";
            return (
              <span key={i} className="block font-body text-[12px] text-ink-soft">
                <span className="text-ink">{ci?.resolved && ci.name ? ci.name : <span className="italic text-ink-faint">{P.classNotFound}</span>}</span>
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
  const { t } = useI18n();
  const P = t.profile;
  return (
    <>
      {rows.map((s) =>
        s.rows.some((r) => r.classInfo) ? (
          <ClassSourceLine key={s.key} s={s} />
        ) : (
          <SourceLine key={s.key} label={s.label} matched>
            <span>
              {nf.format(s.count)}{P.rowsSuffix}
              <span className="font-mono text-[12px] text-ink-faint"> · {multiKeyLabel(s.keyUsed, P)}</span>
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
  const { t } = useI18n();
  const P = t.profile;
  return (
    <>
      {enrichment.my20fit.matched && (
        <SourceLine label="my20fit" matched>
          {enrichment.my20fit.isPlusMember ? P.my20Plus : P.my20User}{enrichment.my20fit.onboardingCompleted ? P.my20Onboard : ""}
        </SourceLine>
      )}
      {enrichment.activity.matched && (
        <SourceLine label={P.activityLabel} matched>
          {enrichment.activity.pingCount != null ? `${nf.format(enrichment.activity.pingCount)}${P.activityVisitsSuffix}` : ""}
          {enrichment.activity.lastActiveAt ? (
            <span className="font-mono text-[12px] text-ink-faint">{P.activityLastActivePrefix}{formatDateOnly(enrichment.activity.lastActiveAt)}</span>
          ) : null}
        </SourceLine>
      )}
    </>
  );
}

/** Hyrox EVENT participation (behaviour) — Perilaku. The NIK / gender / DOB / province / emergency
 *  identity fields moved to the Identitas section (Demografi) — they answer "who", not "what did
 *  they do". Only golongan darah stays here: it is MEDICAL, so it remains behind view_health (it
 *  does NOT move to Demografi, and it is NOT covered by the proposed view_contact gate). */
function HyroxLines({ enrichment, canViewHealth }: { enrichment: ProfileEnrichment; canViewHealth: boolean }) {
  const { t } = useI18n();
  const P = t.profile;
  const golDarah = enrichment.hyrox.sensitive?.golDarah ?? null;
  return (
    <>
      <SourceLine label={P.hyroxLabel} matched>
        {enrichment.hyrox.rows.map((r, i) => (
          <span key={i} className="block">
            {r.eventName ?? "—"}{r.kategori ? ` · ${r.kategori}` : ""}{r.namaTim ? `${P.teamPrefix}${r.namaTim}` : ""}
            {r.registeredAt ? <span className="font-mono text-[12px] text-ink-faint">{P.registerPrefix}{formatDateOnly(r.registeredAt)}</span> : null}
          </span>
        ))}
      </SourceLine>
      {canViewHealth && golDarah && (
        <SourceLine label={P.bloodLabel} matched>
          <span className="font-mono">{golDarah}</span>
        </SourceLine>
      )}
    </>
  );
}

/** Clinic ENGAGEMENT (behaviour) — Perilaku: patient code + visit/booking counts + latest booking.
 *  The clinic IDENTITY fields (NIK/DOB/gender/address/emergency) moved to the Identitas section
 *  (Demografi). Still view_health-gated (clinical volume is health context). No clinical content
 *  (diagnoses/results/meds) — those stay out entirely. */
function ClinicLines({ clinic }: { clinic: ProfileClinicT }) {
  const { t } = useI18n();
  const P = t.profile;
  const inv = clinic.clinical;
  if (!inv) return null; // involvement is view_health-only; nothing to render without it.
  const keyLabel = clinic.keyUsed === "phone" ? P.keyPhonePlain : clinic.keyUsed === "email" ? P.keyEmail : "";
  return (
    <div className="space-y-4 border-t border-glass-border pt-3">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-ink-soft" aria-hidden />
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">{P.clinicTitle}</h3>
      </div>
      <p className="font-mono text-[12px] text-ink-faint">{P.clinicPatientPrefix}{inv.patientCode ?? "—"} · {keyLabel}</p>
      {inv.counts && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            [P.clinicBooking, inv.counts.bookings],
            [P.clinicVisit, inv.counts.visits],
            [P.clinicAssessment, inv.counts.assessments],
            [P.clinicScreening, inv.counts.screenings],
            [P.clinicTransaction, inv.counts.transactions],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-sm border border-glass-border p-3 text-center">
              <div className="font-display text-[22px] font-black leading-none text-ink">{nf.format(n as number)}</div>
              <div className="mt-1 font-display text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
            </div>
          ))}
        </div>
      )}
      {inv.latestBooking && (inv.latestBooking.bookingCode || inv.latestBooking.date) && (
        <p className="font-body text-[13px] text-ink-soft">
          {P.clinicLatestBooking}<span className="font-mono text-[12px]">{inv.latestBooking.bookingCode ?? "—"}</span>
          {inv.latestBooking.status ? ` · ${inv.latestBooking.status}` : ""}
          {inv.latestBooking.date ? ` · ${formatDateOnly(inv.latestBooking.date)}` : ""}
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
  const { t } = useI18n();
  const P = t.profile;
  const loadFailed = enrichment === null || multiSource === null;

  const arenaRows = (multiSource?.sources ?? []).filter((s) => s.key.startsWith("arena") && s.matched);
  const gymRows = (multiSource?.sources ?? []).filter((s) => s.key.startsWith("gym") && s.matched);

  const groups = [
    { key: "hyrox", label: "Hyrox", live: !!enrichment?.hyrox.matched, mirror: mirror?.hasHyrox, gated: false },
    { key: "my20fit", label: "my20fit", live: !!(enrichment?.my20fit.matched || enrichment?.activity.matched), mirror: mirror?.hasMy20fit, gated: false },
    { key: "arena", label: "arena", live: arenaRows.length > 0, mirror: mirror?.hasArena, gated: false },
    { key: "gym", label: "gym", live: gymRows.length > 0, mirror: mirror?.hasGym, gated: false },
    { key: "clinic", label: P.groupClinic, live: !!(clinic?.clinical && clinic.matched), mirror: mirror?.hasClinic, gated: true },
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
      title={P.secOtherSources}
      count={liveCount}
      icon={<Network className="h-4 w-4 text-ink-soft" aria-hidden />}
      open={anyBlock}
      span2
    >
      {loadFailed && (
        <p className="mt-3 font-body text-[12px] text-ink-soft">
          <Badge tone="amber">{P.srcLoadFailBadge}</Badge>{" "}
          {P.warn.sourcesLoadFail}
        </p>
      )}

      {!matchable && !anyBlock ? (
        <p className="mt-4 font-body text-[13px] italic text-ink-faint">
          {P.warn.unmatchableSources}
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
            <Badge tone="neutral">{P.notConnectedBadge}</Badge>
            <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
              {P.warn.notConnectedFullA}<strong>{P.warn.notConnectedFullStrong}</strong>{P.warn.notConnectedFullB}
              {absent.length > 0 ? <> — {absent.map((a) => a.label).join(", ")}</> : null}{P.warn.notConnectedFullC}
              {mirrorRefreshedAt && (
                <span className="mt-1 block font-body text-[11px] text-ink-faint">
                  {P.warn.notConnectedSnapshotPrefix}{formatTs(mirrorRefreshedAt)}{P.warn.notConnectedSnapshotSuffix}
                </span>
              )}
            </p>
          </div>
          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {P.warn.sourcesWhyA}<strong>{P.warn.sourcesWhyStrong}</strong>{P.warn.sourcesWhyB}
              <span className="font-mono">master_customer</span>{P.warn.sourcesWhyC}
              <span className="font-mono">profile.view_health</span>{P.warn.sourcesWhyD}
            </p>
          </Why>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          {enrichment?.hyrox.matched && <HyroxLines enrichment={enrichment} canViewHealth={canViewHealth} />}
          {enrichment && (enrichment.my20fit.matched || enrichment.activity.matched) && <My20fitLines enrichment={enrichment} />}
          {arenaRows.length > 0 && <MultiGroupLines rows={arenaRows} />}
          {gymRows.length > 0 && <MultiGroupLines rows={gymRows} />}
          {clinic?.clinical && clinic.matched && <ClinicLines clinic={clinic} />}

          {absent.length > 0 && (
            <p className="border-t border-glass-border pt-3 font-body text-[13px] text-ink-soft">
              <span className="italic text-ink-faint">{P.warn.notConnectedLinePrefix}{absent.map((a) => a.label).join(", ")}.</span>
              {mirrorRefreshedAt && (
                <span className="font-body text-[11px] text-ink-faint">{P.mirrorStampPrefix}{formatTs(mirrorRefreshedAt)}</span>
              )}
            </p>
          )}

          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {P.warn.sourcesWhyA}<strong>{P.warn.sourcesWhyStrong}</strong>{P.warn.sourcesWhyB}
              <span className="font-mono">master_customer</span>{P.warn.sourcesWhyC}
              <span className="font-mono">profile.view_health</span>{P.warn.sourcesWhyD}
            </p>
          </Why>
        </div>
      )}
    </Section>
  );
}


/** First 10 chars if they are a yyyy-mm-dd date (drops any time part); null otherwise. */
function toIsoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s));
  return m ? m[1] : null;
}

// Provenance labels come from the dictionary (P). The CLINIC entry is deliberately NOT a fixed
// label — a clinic label is coarsened per the caller's medical gate (T-21), so it is supplied at
// render time by the server-decided `clinicSourceLabel`, never hardcoded.
/** Provenance label for a DOB source, using the server-coarsened clinic label for "clinic". */
function dobSourceLabel(s: DobSource, clinicLabel: string, P: Dict["profile"]): string {
  if (s === "clinic") return clinicLabel;
  const map: Record<Exclude<DobSource, "clinic">, string> = {
    nik: P.srcNik,
    staging: P.srcStaging,
    hyrox: P.srcHyrox,
    progressive: P.srcProgressive,
    staff: P.srcStaff,
  };
  return map[s];
}
/** Provenance label for a gender source, using the server-coarsened clinic label for "clinic". */
function genderSourceLabel(s: GenderSource, clinicLabel: string, P: Dict["profile"]): string {
  if (s === "clinic") return clinicLabel;
  const map: Record<Exclude<GenderSource, "clinic">, string> = {
    nik: P.srcNik,
    progressive: P.srcProgressive,
    staff: P.srcStaff,
  };
  return map[s];
}

/**
 * Resolve the DEMOGRAPHIC identity of a profile into ONE chosen value per field, from whatever
 * sources the caller was allowed to see (the server withholds gated sources for a role without
 * view_contact, so the picker naturally shows each role its best PERMITTED value). Uses the pure
 * priority chain (lib/crm/demographic-pick) so the order lives in one tested place. Province is
 * kept SEPARATE from city — NIK province = KTP issuance, not domicile.
 */
function resolveIdentity(
  enrichment: ProfileEnrichment | null,
  clinic: ProfileClinicT | null,
  importData: ProfileImportT | null,
  demographic: ProfileDemographicT | null,
) {
  const hs = enrichment?.hyrox.sensitive ?? null;
  const nd = enrichment?.hyrox.nikDerived ?? null;
  const cs = clinic?.sensitive ?? null; // present iff canSeeContact (server-gated)
  const dm = demographic?.gated ? demographic : null;

  const nik = hs?.nik ?? cs?.nik ?? null;
  // Source DISCRIMINATOR (not label) — the display maps it to a label, coarsening clinic per gate.
  const nikSource: "hyrox" | "clinic" | null = hs?.nik ? "hyrox" : cs?.nik ? "clinic" : null;

  const staging = importData?.dob ?? null;
  // crm_profile_demographic carries TWO provenances (T-35): a value's *_source decides whether it
  // lands in the `progressive` slot (self-report / the 248-row external batch) or the last-resort
  // `staff` slot — inspected per field, never assumed to be staff.
  const dmDob = dm?.dateOfBirth ? { iso: toIsoDate(dm.dateOfBirth), ambiguous: false } : null;
  const dmDobSlot = dmDob ? demographicProvenance(dm?.dateOfBirthSource) : null;
  const dmGender = normalizeGender(dm?.gender);
  const dmGenderSlot = dmGender ? demographicProvenance(dm?.genderSource) : null;

  const dob = pickBirthDate({
    nik: nd?.valid ? { iso: toIsoDate(nd.birthDate), ambiguous: nd.yearOutOfRange } : null,
    staging: staging && staging.status === "parsed" ? { iso: toIsoDate(staging.iso), ambiguous: staging.ambiguousDayMonth } : null,
    clinic: { iso: toIsoDate(cs?.dateOfBirth), ambiguous: false },
    hyrox: { iso: toIsoDate(hs?.tglLahir), ambiguous: false },
    progressive: dmDobSlot === "progressive" ? dmDob : null,
    staff: dmDobSlot === "staff" ? dmDob : null,
  });

  const gender = pickGender({
    nik: nd?.valid ? (nd.gender ?? null) : null,
    clinic: normalizeGender(cs?.gender),
    progressive: dmGenderSlot === "progressive" ? dmGender : null,
    staff: dmGenderSlot === "staff" ? dmGender : null,
  });

  const emergency =
    [hs?.kontakDarurat, hs?.noKontakDarurat].filter(Boolean).join(" · ") ||
    [cs?.emergencyContactName, cs?.emergencyContactPhone].filter(Boolean).join(" · ") ||
    null;

  return {
    nik,
    nikSource,
    dob,
    gender,
    provinceName: nd?.valid ? nd.provinceName : null,
    provinceCode: nd?.valid ? nd.provinceCode : null,
    address: cs?.address ?? null,
    emergency,
    /** Staging DOB detail kept for the notes shown only when staging is the chosen value. */
    stagingDob: staging,
  };
}

/**
 * Filled identity-field count for the Demografi tab label AND the Identitas section title — one
 * source (this fn) so the two cannot disagree. Counts only what the CALLER can see, because the
 * server already withheld the gated sources.
 */
function identityFieldCount(
  enrichment: ProfileEnrichment | null,
  clinic: ProfileClinicT | null,
  importData: ProfileImportT | null,
  demographic: ProfileDemographicT | null,
): number {
  const r = resolveIdentity(enrichment, clinic, importData, demographic);
  return [r.nik, r.dob.iso, r.gender.value, r.provinceName ?? r.provinceCode, r.address, r.emergency].filter(Boolean).length;
}

/** Human genders. */
function genderLabel(v: "male" | "female", P: Dict["profile"]): string {
  return v === "female" ? P.gFemale : P.gMale;
}

/**
 * Fill-form for EMPTY demographic fields (profile.edit_demographic, K-32). Renders inputs ONLY for
 * the fields still empty across every source (offerGender / offerDob decided by the caller from the
 * resolved values). Submits to POST /api/audience/[id]/demographic, which re-checks the gate AND
 * re-verifies emptiness server-side, then calls the atomic fill-empty-only RPC. On success the page
 * reloads so the new value shows through the normal (audited) read path.
 */
function DemographicFillForm({
  customerId,
  offerGender,
  offerDob,
}: {
  customerId: string;
  offerGender: boolean;
  offerDob: boolean;
}) {
  const { t } = useI18n();
  const P = t.profile;
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "green" | "red"; text: string } | null>(null);

  if (!offerGender && !offerDob) return null;

  async function submit() {
    setMsg(null);
    const payload: { gender?: string; date_of_birth?: string } = {};
    if (offerGender && gender) payload.gender = gender;
    if (offerDob && dob) payload.date_of_birth = dob;
    if (Object.keys(payload).length === 0) {
      setMsg({ tone: "red", text: P.fillMinOne });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/audience/${customerId}/demographic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; fields?: string[] };
      if (res.ok) {
        setMsg({ tone: "green", text: P.fillSaved });
        setTimeout(() => window.location.reload(), 600);
      } else {
        setMsg({ tone: "red", text: body.message ?? `${P.fillFailPrefix}${res.status}).` });
        setBusy(false);
      }
    } catch {
      setMsg({ tone: "red", text: P.fillConnErr });
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-sm border border-dashed border-glass-border p-3">
      <p className="font-display text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {P.fillTitle}
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
        {offerGender && (
          <label className="flex flex-col gap-1">
            <span className="font-body text-[11px] text-ink-soft">{P.fillGender}</span>
            <select
              className="rounded-sm border border-glass-border bg-transparent px-2 py-1 font-body text-[13px] text-ink"
              value={gender}
              onChange={(e) => setGender(e.target.value as "" | "male" | "female")}
              disabled={busy}
            >
              <option value="">{P.fillPick}</option>
              <option value="male">{P.gMale}</option>
              <option value="female">{P.gFemale}</option>
            </select>
          </label>
        )}
        {offerDob && (
          <label className="flex flex-col gap-1">
            <span className="font-body text-[11px] text-ink-soft">{P.fillDob}</span>
            <input
              type="date"
              className="rounded-sm border border-glass-border bg-transparent px-2 py-1 font-mono text-[13px] text-ink"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <Button size="sm" variant="outline" onClick={submit} disabled={busy}>
          {busy ? P.fillSaving : P.fillSave}
        </Button>
      </div>
      {msg && (
        <p className={`mt-2 font-body text-[12px] ${msg.tone === "green" ? "text-emerald" : "text-red"}`}>{msg.text}</p>
      )}
      <p className="mt-2 font-body text-[11px] italic text-ink-faint">
        {P.warn.fillNoteA}<span className="font-mono">staff_entry</span>{P.warn.fillNoteB}
      </p>
    </div>
  );
}

/**
 * IDENTITAS (Demografi) — NIK + tanggal lahir + gender + provinsi KTP + alamat + kontak darurat,
 * one value per field chosen by the priority chain (lib/crm/demographic-pick), from whatever the
 * caller may see. K-31: identity rides `profile.view_contact` (NIK sekelas telepon/email); the
 * server withholds NIK/clinic/staff sources for a role without it, so this shows each role its best
 * PERMITTED value. One birth date, not two — but any DISAGREEMENT between sources stays findable
 * (a ringkas marker + the comparison behind <Why>). NIK shown full (owner decision); its value
 * never enters audit/metadata/CSV. Province = KTP issuance place, NOT domicile.
 */
function IdentitySection({
  enrichment,
  clinic,
  importData,
  demographic,
  canSeeContact,
  clinicSourceLabel,
  customerId,
  canEditDemographic,
}: {
  enrichment: ProfileEnrichment | null;
  clinic: ProfileClinicT | null;
  importData: ProfileImportT | null;
  demographic: ProfileDemographicT | null;
  canSeeContact: boolean;
  /** Server-coarsened label for clinic-sourced identity (T-21) — "klinik" or "sumber ekosistem". */
  clinicSourceLabel: string;
  customerId: string;
  /** Whether to render the empty-field fill form (profile.edit_demographic, K-32). */
  canEditDemographic: boolean;
}) {
  const { t } = useI18n();
  const P = t.profile;
  const r = resolveIdentity(enrichment, clinic, importData, demographic);
  const count = identityFieldCount(enrichment, clinic, importData, demographic);
  const open = count > 0;

  // Are there gated identity fields the caller CANNOT see (so we can show the "behind the gate" note)?
  const hasGatedIdentity = !!(enrichment?.hyrox.hasSensitive || (clinic?.matched));

  // The chosen DOB's own ambiguity note, worded by which source it came from.
  const dobAmbNote =
    r.dob.ambiguous && r.dob.source === "nik"
      ? P.warn.dobAmbNik
      : r.dob.ambiguous && r.dob.source === "staging"
        ? P.warn.dobAmbStaging
        : null;
  const stagingSwapNote = r.dob.source === "staging" && r.stagingDob?.swapped ? P.warn.dobSwap : null;

  return (
    <Section title={P.secIdentity} count={count} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />} open={open} span2>
      {/* NIK — full, view_contact (K-31). */}
      {canSeeContact && r.nik && (
        <Field label={P.fNik} mono>
          <span>
            {r.nik}
            {r.nikSource ? <span className="font-body text-[11px] text-ink-faint">{P.fromPrefix}{r.nikSource === "hyrox" ? P.srcHyrox : clinicSourceLabel}</span> : null}
          </span>
        </Field>
      )}

      {/* Tanggal lahir — ONE value from the chain, with provenance; disagreement stays findable. */}
      <Field label={P.fDob} mono>
        {r.dob.iso ? (
          <span className="flex flex-col gap-0.5">
            <span>
              {r.dob.iso}
              {r.dob.source ? <span className="font-body text-[11px] text-ink-faint">{P.fromPrefix}{dobSourceLabel(r.dob.source, clinicSourceLabel, P)}</span> : null}
              {r.dob.conflicts.length > 0 && (
                <span className="font-body text-[11px] not-italic text-amber">{P.otherDiffer}</span>
              )}
            </span>
            {dobAmbNote && <span className="font-body text-[11px] not-italic text-amber">{dobAmbNote}</span>}
            {stagingSwapNote && <span className="font-body text-[11px] not-italic text-amber">{stagingSwapNote}</span>}
            {r.dob.conflicts.length > 0 && (
              <Why>
                <p className="text-[12px] leading-relaxed text-ink-soft">
                  {P.warn.dobConflictWhyA}{dobSourceLabel(r.dob.source!, clinicSourceLabel, P)}{P.warn.dobConflictWhyB}
                  <strong>{P.warn.dobConflictWhyStrong}</strong>{": "}
                  {r.dob.conflicts.map((c) => `${c.iso} (${P.fromWord} ${dobSourceLabel(c.source, clinicSourceLabel, P)})`).join(", ")}{". "}
                  {P.warn.dobConflictWhyC}
                </p>
              </Why>
            )}
          </span>
        ) : <Empty />}
      </Field>

      {/* Gender — one value from the chain. */}
      {r.gender.value && (
        <Field label={P.fGender}>
          {genderLabel(r.gender.value, P)}
          {r.gender.source ? <span className="font-body text-[11px] text-ink-faint">{P.fromPrefix}{genderSourceLabel(r.gender.source, clinicSourceLabel, P)}</span> : null}
          {r.gender.conflicts.length > 0 && (
            <span className="font-body text-[11px] not-italic text-amber">{P.otherDiffer} ({r.gender.conflicts.map((c) => `${genderLabel(c.value, P)}/${genderSourceLabel(c.source, clinicSourceLabel, P)}`).join(", ")})</span>
          )}
        </Field>
      )}

      {/* Provinsi KTP — from NIK, SEPARATE from domicile city. */}
      {canSeeContact && (r.provinceName || r.provinceCode) && (
        <Field label={P.fProvince}>
          {r.provinceName ? r.provinceName : <span className="font-mono">{P.provinceCodeA}{r.provinceCode}{P.provinceCodeB}</span>}
          <span className="font-body text-[11px] text-ink-faint">{P.provinceNote}</span>
        </Field>
      )}

      {canSeeContact && r.address && <Field label={P.fAddress}>{r.address}</Field>}
      {canSeeContact && r.emergency && <Field label={P.fEmergency} mono>{r.emergency}</Field>}

      {/* Fill form — only for an editor role, and only for the fields still empty everywhere. */}
      {canEditDemographic && canSeeContact && (!r.dob.iso || !r.gender.value) && (
        <DemographicFillForm customerId={customerId} offerGender={!r.gender.value} offerDob={!r.dob.iso} />
      )}

      {/* Explainer + the "behind the gate" note for a role without view_contact. */}
      {canSeeContact ? (
        (r.nik || r.dob.iso) && (
          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {P.warn.identityWhyA}<strong>{P.warn.identityWhyStrong}</strong>{P.warn.identityWhyB}
              <span className="font-mono">lib/crm/nik.ts</span>{P.warn.identityWhyC}
              <span className="font-mono">profile.view_contact</span>{P.warn.identityWhyD}
              <span className="font-mono">profile.view_health</span>{P.warn.identityWhyE}
            </p>
          </Why>
        )
      ) : hasGatedIdentity ? (
        <p className="font-body text-[12px] italic text-ink-faint">
          {P.warn.identityGatedA}<span className="font-mono">profile.view_contact</span>{P.warn.identityGatedB}
        </p>
      ) : null}
    </Section>
  );
}

/**
 * Data impor 20FIT — PARTISIPASI (staging_20fit_data, Sprint 3Y). This is the BEHAVIOURAL slice:
 * RFM (per-paid-order score) + program participation. It lives in the Perilaku tab. The DEMOGRAPHIC
 * fields the same import carries — birth date, city — moved to the Identitas / Kontak sections
 * (Demografi), because grouping must follow MEANING, not the source table (the same reason NIK was
 * mis-filed). Clinic-patient program flags are server-omitted for non-view_health callers.
 */
function ImportSection({ importData }: { importData: ProfileImportT | null }) {
  const { t } = useI18n();
  const P = t.profile;
  const imp = importData;
  const count = imp && imp.matched ? imp.programs.length + (imp.rfmPaidOrder && imp.rfmPaidOrder !== "-" ? 1 : 0) : 0;
  return (
    <Section
      title={P.secImport}
      count={count}
      icon={<Activity className="h-4 w-4 text-ink-soft" aria-hidden />}
      open={!!imp?.matched}
      span2
    >
      {importData === null ? (
        <div className="mt-4 rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
          <Badge tone="amber">{P.loadFailBadge}</Badge>
          <p className="mx-auto mt-2 max-w-xl font-body text-[13px] text-ink-soft">{P.warn.importFail}</p>
        </div>
      ) : !importData.matchable ? (
        <p className="mt-4 font-body text-[13px] italic text-ink-faint">{P.warn.importUnmatchable}</p>
      ) : !importData.matched ? (
        <p className="mt-4 font-body text-[13px] italic text-ink-faint">{P.warn.importNotMatchedA}<span className="font-mono">staging_20fit_data</span>{P.warn.importNotMatchedB}</p>
      ) : (
        <div className="mt-2">
          <Field label={P.impRfm}>
            {importData.rfmPaidOrder && importData.rfmPaidOrder !== "-" ? (
              <Badge tone="neutral">{importData.rfmPaidOrder}</Badge>
            ) : (
              <span className="font-body text-[13px] italic text-ink-faint">{importData.rfmPaidOrder === "-" ? P.impRfmNoBucket : P.warn.emptyField}</span>
            )}
          </Field>

          <Field label={P.impPrograms}>
            {importData.programs.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {importData.programs.map((p) => <Badge key={p.key} tone="neutral">{p.label}</Badge>)}
              </span>
            ) : (
              <span className="font-body text-[13px] italic text-ink-faint">{P.warn.importNoProgram}</span>
            )}
          </Field>

          {importData.clinicalWithheld && (
            <p className="mt-2 font-body text-[11px] italic text-ink-faint">
              {P.warn.importClinicalWithheldA}<span className="font-mono">profile.view_health</span>{P.warn.importClinicalWithheldB}
            </p>
          )}
          <Why>
            <p className="text-[11px] leading-relaxed text-ink-soft">
              {P.warn.importWhyA}<span className="font-mono">staging_20fit_data</span>{P.warn.importWhyB}
              <strong>{P.warn.importWhyStrong}</strong>{P.warn.importWhyC}<strong>{P.secIdentity}</strong>{P.warn.importWhyD}
              <strong>{P.secContact}</strong>{P.warn.importWhyE}
            </p>
          </Why>
        </div>
      )}
    </Section>
  );
}


export function ProfileDetail({
  id,
  canEditConsent,
  canEditDemographic = false,
  previewData,
}: {
  id: string;
  canEditConsent: boolean;
  /** Whether this role may fill EMPTY demographic fields (profile.edit_demographic, K-32). The API
   *  re-checks server-side; this only gates whether the fill form renders. */
  canEditDemographic?: boolean;
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

  const { t } = useI18n();
  const P = t.profile;

  const BackLink = () => (
    <Link
      href="/audience"
      className="inline-flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-wide text-ink-soft transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {P.back}
    </Link>
  );

  if (state === "loading") {
    return (
      <div className="space-y-6">
        <BackLink />
        <p className="font-body text-[14px] text-ink-soft">{P.loading}</p>
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="neutral">{P.notFoundBadge}</Badge>
          <p className="max-w-md font-body text-[14px] text-ink-soft">{P.notFoundText}</p>
        </div>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className="space-y-6">
        <BackLink />
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{P.errorBadge}</Badge>
          <p className="max-w-md font-body text-[14px] text-ink-soft">{P.errorText}</p>
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
  // PARTICIPATION (RFM + programs) — behavioural, so it belongs to Perilaku, matching ImportSection.
  // The demographic fields the same import carries (birth date, city) are counted under Demografi.
  const importCount =
    imp && imp.matched ? imp.programs.length + (imp.rfmPaidOrder && imp.rfmPaidOrder !== "-" ? 1 : 0) : 0;
  const ms = data.multiSource?.sources ?? [];
  const liveSourceCount = [
    data.enrichment?.hyrox.matched,
    data.enrichment?.my20fit.matched || data.enrichment?.activity.matched,
    ms.some((s) => s.key.startsWith("arena") && s.matched),
    ms.some((s) => s.key.startsWith("gym") && s.matched),
    data.clinic?.gated && data.clinic.matched,
  ].filter(Boolean).length;
  const attrFilled = [p.first_unit, p.segment, p.lifetime_value != null ? "x" : null, p.source].filter(Boolean).length;
  // Identity (NIK + derivatives + staging DOB) moved OUT of Perilaku into Demografi — grouping by
  // meaning, not source table. Same helper as the Identitas section title so they can't drift.
  const identityCount = identityFieldCount(data.enrichment, data.clinic, data.importData, data.demographic);
  const demografiCount = contactFilled + attrFilled + identityCount;
  const perilakuCount = (data.engagement?.totalRows ?? 0) + liveSourceCount + importCount;

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
            {formatDisplayName(p.full_name) ?? P.noName}
          </h1>
          {/* Original name kept visible when tidying changed it — search still runs over the
              SOURCE column (search-read.ts), so the raw name stays findable. */}
          {nameNeedsTidy(p.full_name) && (
            <p className="mt-1 font-body text-[12px] text-ink-faint">
              {P.originalNameLabel}<span className="font-mono">{p.full_name}</span>
            </p>
          )}
          <p className="mt-2 font-mono text-[12px] text-ink-faint">{p.customer_id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.masked && (
            <Badge tone="amber" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> {P.contactMasked}</Badge>
          )}
          {p.is_merged ? <Badge tone="neutral">{P.merged}</Badge> : null}
          {p.is_potential_duplicate ? <Badge tone="amber">{P.possibleDup}</Badge> : null}
          {/* Write entry point — only for roles that may edit consent, and only when a
              real (unmasked) identity exists to suppress. The API re-checks the gate. */}
          {canEditConsent && !p.masked && (p.phone || p.email) && (
            <Button size="sm" variant="outline" onClick={() => setSuppressOpen(true)}>
              <Ban className="h-3.5 w-3.5" /> {P.recordStop}
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
            <Section title={P.secContact} count={contactFilled} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />}>
              <Field label={P.fPhone} mono>{p.phone ? p.phone : <Empty />}</Field>
              <Field label={P.fEmail} mono>
                {p.email ? p.email : <Empty />}
                {/* Typo FLAG only — never an auto-fix. Runs on the real email, so it is shown
                    only to roles that see it unmasked (a masked role can't correct it anyway). */}
                {!p.masked && emailTypo.suspect && (
                  <span className="mt-1 flex items-center gap-1.5">
                    <Badge tone="amber" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> {P.typoBadge}
                    </Badge>
                    <span className="font-body text-[12px] text-ink-soft">
                      {P.typoSuggest}<span className="font-mono text-ink">{emailTypo.suggestion}</span>{" "}
                      ({emailTypo.confidence === "high" ? P.confHigh : P.confMed}){P.typoNote}
                    </span>
                  </span>
                )}
              </Field>
              <Field label={P.fCity}>{p.city ? p.city : <Empty />}</Field>
            </Section>

            <Section title={P.secAttr} count={attrFilled} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />}>
              <Field label={P.fFirstUnit}>{p.first_unit ? p.first_unit : <Empty />}</Field>
              <Field label={P.fSegment}>
                {p.segment ? <Badge tone="neutral">{p.segment}</Badge> : <span className="font-body text-[13px] italic text-ink-faint">{P.noSegment}</span>}
              </Field>
              <Field label={P.fLtv} mono>
                {p.lifetime_value != null ? (p.lifetime_value > 0 ? idr.format(p.lifetime_value) : <span className="text-ink-faint">Rp 0</span>) : <Empty />}
              </Field>
              <Field label={P.fSource} mono>{p.source ? p.source : <Empty />}</Field>
            </Section>

            {/* Identitas — NIK + turunannya + tanggal lahir + alamat + kontak darurat, DIGABUNG dari
                Hyrox/klinik/staging berdasarkan MAKNA (bukan tabel sumber). NIK penuh; satu tanggal
                lahir dari rantai prioritas; gerbang view_contact (K-31). */}
            <IdentitySection
              enrichment={data.enrichment}
              clinic={data.clinic}
              importData={data.importData}
              demographic={data.demographic}
              canSeeContact={data.canSeeContact}
              clinicSourceLabel={data.clinicSourceLabel}
              customerId={p.customer_id}
              canEditDemographic={canEditDemographic && !previewData}
            />

            {/* Row metadata — closed by default (secondary to the person). */}
            <Section title={P.secTrail} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />} open={false}>
              <Field label={P.tCreated} mono>{formatTs(p.created_at)}</Field>
              {p.source === "live_txn_ingest" ? (
                <Field label={P.tFirstSeenReal} mono>
                  {formatTs(p.first_seen_at)}{" "}
                  <span className="font-body text-[12px] italic text-ink-faint">{P.warn.firstSeenRealNote}</span>
                </Field>
              ) : (
                <Field label={P.tFirstSeen} mono>
                  {formatTs(p.first_seen_at)}{" "}
                  <span className="font-body text-[12px] italic text-ink-faint">{P.warn.firstSeenNote}</span>
                </Field>
              )}
              <Field label={P.tUpdated} mono>{formatTs(p.updated_at)}</Field>
              <Why>
                <p className="text-[12px] leading-relaxed text-ink-soft">
                  {P.warn.trailWhyA}<span className="font-mono">live_txn_ingest</span>{P.warn.trailWhyB}
                  <span className="font-mono">20fit_data_import</span>{P.warn.trailWhyC}
                </p>
              </Why>
            </Section>

            <Section title={P.secCuration} count={kurasiFilled} icon={<User className="h-4 w-4 text-ink-soft" aria-hidden />} open={false}>
              <Field label={P.cNotes}>{p.notes ? p.notes : <Empty />}</Field>
              <Field label={P.cTags}>
                {p.tags && p.tags.length > 0 ? (
                  <span className="flex flex-wrap gap-1.5">{p.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}</span>
                ) : <Empty />}
              </Field>
              <Field label={P.cDupReason}>{p.duplicate_reason ? p.duplicate_reason : <Empty />}</Field>
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

            {/* Data impor 20FIT — partisipasi (RFM + program). Behavioural, so Perilaku; its
                demographic fields (DOB, city) moved to Identitas / Kontak. */}
            <ImportSection importData={data.importData} />

            {/* Health flags — structural gate, but no source exists. */}
            {data.canViewHealth && (
              <Section title={P.secHealth} icon={<HeartPulse className="h-4 w-4 text-ink-soft" aria-hidden />} open={false} span2>
                <div className="rounded-sm border border-dashed border-glass-border px-4 py-6 text-center">
                  <Badge tone="neutral">{P.warn.healthNoSourceBadge}</Badge>
                  <p className="mx-auto mt-2 max-w-xl font-body text-[13px] leading-relaxed text-ink-soft">
                    <span className="font-mono text-[12px]">master_customer</span>{P.warn.healthNoSourceB}
                    <span className="font-mono text-[12px]">clinic_*</span>{P.warn.healthNoSourceC}
                    <span className="font-mono text-[12px]">profile.view_health</span>{P.warn.healthNoSourceD}
                  </p>
                </div>
              </Section>
            )}
          </>
        }
      />

      <p className="font-mono text-[11px] text-ink-faint">{P.footer}</p>
    </div>
  );
}
