"use client";

import { useState } from "react";
import Link from "next/link";
import { Filter, Clock, Users, Send, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ECOSYSTEM_UNITS, ECOSYSTEM_PRODUCTS_BY_UNIT } from "@/lib/crm/engagement-constants";
import { STAGING_RFM_VALUES, STAGING_PROGRAMS } from "@/lib/crm/staging-constants";
import { EMPTY_CRITERIA, type SegmentCriteria } from "@/lib/crm/segment";
import { FilterTreeBuilder, rowsToTree, type Row } from "@/components/segments/filter-tree-builder";
import { saveSegmentAction } from "@/app/(app)/segments/actions";
import { Why } from "@/components/ui/why";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatPct, formatDateTime } from "@/lib/i18n";
import { QuickSegments } from "@/components/segments/quick-segments";

interface Counts {
  matched: number;
  contactableMarketing: number;
  contactableService: number;
  /** ISO time the mirror was last refreshed — present only when a source-presence flag shaped
   *  this count (that part is read from crm_customer_mirror). Null otherwise. */
  mirrorRefreshedAt?: string | null;
}

const selectCls =
  "h-10 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink focus:outline-none focus:ring-2 focus:ring-red";

/** Below this many matched profiles a segment practically points at individuals — a warning
 *  shows (the count is NOT suppressed; this builder never emits a list of people anyway). */
const SMALL_SEGMENT = 25;

/** The rule this whole screen exists to make visible (PRD §18.8). K-28: the title is the one-line
 *  screen-wide warning; the "why" (load-stamp explanation) is collapsed, and the K-code / docs
 *  references are gone from the screen (they live in the code + docs/KOLOM-WAKTU.md). */
function TimeBanned() {
  const w = useI18n().t.segments.warn;
  return (
    <div className="tint-blue rounded-card p-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          {w.timeBannedTitle}
        </h3>
      </div>
      <Why>
        <p className="text-[12px] leading-relaxed text-ink-soft">
          {w.timeBannedA}
          <span className="font-mono">created_at</span>{w.timeBannedB}
          <span className="font-mono">first_seen_at</span>{w.timeBannedC}
          <span className="font-mono">last_activity_at</span>{w.timeBannedD}
        </p>
      </Why>
    </div>
  );
}

export function SegmentBuilder({ cityFillPct, cityFilled, total, canViewHealth, embedded = false, onComputed }: { cityFillPct: number; cityFilled: number; total: number; canViewHealth: boolean; embedded?: boolean; onComputed?: (counts: { matched: number; contactableMarketing: number; contactableService: number } | null) => void }) {
  const { lang, t } = useI18n();
  const [c, setC] = useState<SegmentCriteria>(EMPTY_CRITERIA);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segName, setSegName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Save the DEFINITION (criteria + validated tree), never a member list (K-40). Enabled only after
  // a compute, so a saved segment is one whose size the operator has just seen.
  async function saveSeg() {
    if (!segName.trim() || saving) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await saveSegmentAction({ name: segName, criteria: c, tree: rowsToTree(rows) });
      setSaveMsg(res.ok ? t.segments.saveOk : t.segments.saveFailed);
      if (res.ok) setSegName("");
    } catch {
      setSaveMsg(t.segments.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof SegmentCriteria>(k: K, v: SegmentCriteria[K]) {
    setC((prev) => ({ ...prev, [k]: v }));
    setCounts(null); // criteria changed -> stale result, recompute explicitly
  }

  function setRowsAndClear(r: Row[]) {
    setRows(r);
    setCounts(null); // filter changed -> stale result
    onComputed?.(null);
  }

  // KONTAK group (nav rebuild): "punya email" / "punya telepon" are their own question, not demographic
  // attributes, so they live here as dedicated toggles instead of in the free field picker. They still
  // resolve as tree conditions (one source, no duplication, no engine change) — toggling adds/removes a
  // single hasEmail/hasPhone condition row.
  const hasContactRow = (field: "hasEmail" | "hasPhone") =>
    rows.some((r) => r.t === "cond" && r.field === field);
  function setContactRow(field: "hasEmail" | "hasPhone", on: boolean) {
    const without = rows.filter((r) => !(r.t === "cond" && r.field === field));
    setRowsAndClear(on ? [...without, { t: "cond", field, value: "" }] : without);
  }

  // The request body — master fields come from the AND/OR tree; ecosystem + source presence stay
  // separate top-level ANDs (cross-table OR isn't expressible in one query).
  function buildBody() {
    return {
      tree: rowsToTree(rows),
      ecoUnit: c.ecoUnit,
      ecoProduct: c.ecoProduct,
      srcHyrox: c.srcHyrox,
      srcMy20fit: c.srcMy20fit,
      srcRecency: c.srcRecency,
      srcArena: c.srcArena,
      srcGym: c.srcGym,
      srcClinicPatient: c.srcClinicPatient,
      srcClinicTxn: c.srcClinicTxn,
      srcRfm: c.srcRfm,
      srcProgram: c.srcProgram,
    };
  }

  async function compute() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `${t.segments.computeFailed} (HTTP ${res.status}).`);
        setCounts(null);
        onComputed?.(null);
        return;
      }
      const next = {
        matched: data.matched as number,
        contactableMarketing: data.contactableMarketing as number,
        contactableService: data.contactableService as number,
        mirrorRefreshedAt: (data.mirrorRefreshedAt ?? null) as string | null,
      };
      setCounts(next);
      onComputed?.({ matched: next.matched, contactableMarketing: next.contactableMarketing, contactableService: next.contactableService });
    } catch {
      setError(t.segments.connFailed);
      setCounts(null);
      onComputed?.(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {!embedded && (
        <header className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.segments}</h1>
            <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">
              {t.segments.subtitleA}
            </p>
          </div>
        </header>
      )}

      {/* Quick preset segments — klik langsung set criteria */}
      <QuickSegments
        canViewHealth={canViewHealth}
        onSelect={(preset) => {
          setC({ ...EMPTY_CRITERIA, ...preset });
          setRows([]);
          setCounts(null);
          onComputed?.(null);
        }}
      />

        {/* No time criteria — the one screen-wide invariant, stays visible (its "why" is collapsed). */}
        <TimeBanned />

        {/* Three groups by QUESTION (mirrors the profile screen), not by data source. */}
        <section className="glass space-y-5 rounded-card p-5">
          {/* ── DEMOGRAFI — attributes of the person, combined AND/OR ── */}
          <div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-ink-soft" aria-hidden />
              <h3 className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">{t.segments.groupDemografi}</h3>
            </div>
            <p className="mt-1 font-body text-[12px] text-ink-soft">{t.segments.groupDemografiHint}</p>
            <div className="mt-3">
              <FilterTreeBuilder rows={rows} setRows={setRowsAndClear} />
            </div>
          </div>

          {/* ── KONTAK — a question of its own, not a demographic attribute ── */}
          <div className="border-t border-glass-border/60 pt-4">
            <h3 className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">{t.segments.groupKontak}</h3>
            <p className="mt-1 font-body text-[12px] text-ink-soft">{t.segments.groupKontakHint}</p>
            <div className="mt-2 flex flex-col gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
                <input type="checkbox" checked={hasContactRow("hasEmail")} onChange={(e) => setContactRow("hasEmail", e.target.checked)} className="accent-red" />
                {t.segments.kontakHasEmail}
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
                <input type="checkbox" checked={hasContactRow("hasPhone")} onChange={(e) => setContactRow("hasPhone", e.target.checked)} className="accent-red" />
                {t.segments.kontakHasPhone}
              </label>
            </div>
          </div>

          {/* ── PERILAKU — cross-table presence (ecosystem, sources, program) ── */}
        <div className="mt-1 border-t border-glass-border/60 pt-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-ink-soft" aria-hidden />
            <h3 className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">
              {t.segments.groupPerilaku}
            </h3>
          </div>
          <p className="mt-1 font-body text-[12px] text-ink-soft">{t.segments.groupPerilakuHint}</p>
          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
            {t.segments.warn.ecoDescA}<span className="font-mono">customer_engagement</span>{t.segments.warn.ecoDescB}<span className="font-mono">event</span>{t.segments.warn.ecoDescC}<span className="font-mono">membership</span>{t.segments.warn.ecoDescD}<span className="font-mono">last_seen_at</span>{t.segments.warn.ecoDescE}
            </p>
          </Why>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.segments.ecoUnitLabel}</span>
              <select className={selectCls} value={c.ecoUnit ?? ""} onChange={(e) => set("ecoUnit", e.target.value || null)}>
                <option value="">{t.segments.ecoAllUnits}</option>
                {ECOSYSTEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.segments.ecoProductLabel}</span>
              <select className={selectCls} value={c.ecoProduct ?? ""} onChange={(e) => set("ecoProduct", e.target.value || null)}>
                <option value="">{t.segments.ecoAllProducts}</option>
                {ECOSYSTEM_UNITS.map((u) => (
                  <optgroup key={u} label={u}>
                    {ECOSYSTEM_PRODUCTS_BY_UNIT[u].map((p) => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          {c.ecoUnit && c.ecoProduct && (
            <p className="mt-2 font-body text-[11px] leading-relaxed text-ink-faint">
              {t.segments.ecoBothNote}
            </p>
          )}

          {/* Unmatched-source presence (Sprint 3R) — cocok lewat email ternormalisasi. */}
          <div className="mt-3 flex flex-col gap-2 border-t border-glass-border/60 pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcHyrox} onChange={(e) => set("srcHyrox", e.target.checked)} className="accent-red" />
              {t.segments.srcHyroxLabel}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcMy20fit} onChange={(e) => set("srcMy20fit", e.target.checked)} className="accent-red" />
              {t.segments.srcMy20fitLabel}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcRecency} onChange={(e) => set("srcRecency", e.target.checked)} className="accent-red" />
              {t.segments.srcRecencyLabel}
            </label>
            <Why>
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {t.segments.warn.srcRecencyA}<span className="font-mono">last_active_at</span>{t.segments.warn.srcRecencyB}
              </p>
            </Why>
          </div>

          {/* Sumber lain (TUGAS 2) — arena/gym (email), klinik (telepon, digerbangi view_health). */}
          <div className="mt-3 flex flex-col gap-2 border-t border-glass-border/60 pt-3">
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcArena} onChange={(e) => set("srcArena", e.target.checked)} className="accent-red" />
              {t.segments.srcArenaLabel}
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
              <input type="checkbox" checked={c.srcGym} onChange={(e) => set("srcGym", e.target.checked)} className="accent-red" />
              {t.segments.srcGymLabel}
            </label>
            {canViewHealth ? (
              <>
                <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
                  <input type="checkbox" checked={c.srcClinicPatient} onChange={(e) => set("srcClinicPatient", e.target.checked)} className="accent-red" />
                  {t.segments.srcClinicPatientLabel}<span className="font-mono text-[11px] text-ink-faint">{t.segments.srcClinicPatientTag}</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 font-body text-[13px] text-ink">
                  <input type="checkbox" checked={c.srcClinicTxn} onChange={(e) => set("srcClinicTxn", e.target.checked)} className="accent-red" />
                  {t.segments.srcClinicTxnLabel}<span className="font-mono text-[11px] text-ink-faint">{t.segments.srcClinicPatientTag}</span>
                </label>
              </>
            ) : (
              <p className="font-body text-[11px] italic text-ink-faint">
                {t.segments.warn.clinicHiddenA}<span className="font-mono">profile.view_health</span>{t.segments.warn.clinicHiddenB}
              </p>
            )}
            <Why>
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {t.segments.warn.sourcesAndA}
              </p>
            </Why>
          </div>

          {/* Data impor 20FIT (staging_20fit_data, Sprint 3Y) — RFM + keikutsertaan program.
              Cocok lewat email (K-06), 98,6% pool. Program klinik (pasien klinik) digerbangi
              view_health seperti sumber klinis lain. */}
          <div className="mt-3 flex flex-col gap-3 border-t border-glass-border/60 pt-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.segments.rfmLabel}</span>
                <select className={selectCls} value={c.srcRfm ?? ""} onChange={(e) => set("srcRfm", e.target.value || null)}>
                  <option value="">{t.segments.rfmAll}</option>
                  {STAGING_RFM_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                {c.srcRfm && (
                  <span className="font-body text-[11px] leading-relaxed text-amber">
                    {t.segments.warn.rfmA}<span className="font-mono">New User</span>{t.segments.warn.rfmB}<span className="font-mono">Loyal</span>{t.segments.warn.rfmC}<span className="font-mono">Campion</span>{t.segments.warn.rfmD}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.segments.programLabel}</span>
                <select className={selectCls} value={c.srcProgram ?? ""} onChange={(e) => set("srcProgram", e.target.value || null)}>
                  <option value="">{t.segments.programAll}</option>
                  <optgroup label={t.segments.programGroupNonClinical}>
                    {STAGING_PROGRAMS.filter((p) => !p.clinical).map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </optgroup>
                  {canViewHealth && (
                    <optgroup label={t.segments.programGroupClinical}>
                      {STAGING_PROGRAMS.filter((p) => p.clinical).map((p) => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
            </div>
            <Why>
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {t.segments.warn.stagingA}<span className="font-mono">staging_20fit_data</span>{t.segments.warn.stagingB}<span className="font-mono">Campion user</span>{t.segments.warn.stagingC}{canViewHealth ? t.segments.stagingGated : t.segments.stagingHidden}{t.segments.warn.stagingD}<span className="font-mono">profile.view_health</span>{t.segments.warn.stagingE}
              </p>
            </Why>
          </div>
        </div>

        {/* City-fill caveat — a "why city filtering is unreliable" note, no longer filling the space
            between controls: title on the line, the numbers + reason collapsed (nav rebuild). */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-[11px] font-bold uppercase tracking-wide text-amber">{t.segments.cityCaveatTitle}</span>
          </div>
          <Why>
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {t.segments.warn.cityA}{formatPct(cityFillPct, lang)}{t.segments.warn.cityB}{formatCount(cityFilled, lang)}{t.segments.warn.cityC}{formatCount(total, lang)}{t.segments.warn.cityD}
            </p>
          </Why>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={compute} disabled={loading}>
            {loading ? t.segments.computing : t.segments.computeBtn}
          </Button>
          {/* Save the definition (K-40). Enabled after a compute; saves criteria, not people. */}
          {counts && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <input
                type="text"
                value={segName}
                onChange={(e) => setSegName(e.target.value)}
                placeholder={t.segments.savePlaceholder}
                className="h-9 w-56 rounded-sm border border-glass-border bg-glass px-3 font-body text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-red"
              />
              <Button variant="outline" onClick={saveSeg} disabled={saving || !segName.trim()}>
                {saving ? t.segments.saving : t.segments.saveBtn}
              </Button>
              {saveMsg && <span className="font-body text-[12px] text-ink-soft">{saveMsg}</span>}
            </div>
          )}
          {error && <p className="w-full font-body text-[13px] text-red">{error}</p>}
        </div>
      </section>

      {/* Paired counts — audiens NEVER shown without contactable (PRD §18.8). Marketing and
          service (layanan) are DISTINCT permissions and shown separately (Migrasi 11):
          collapsing them hides the very distinction CS relies on. */}
      {counts && counts.matched > 0 && counts.matched < SMALL_SEGMENT && (
        <div className="tint-amber rounded-card px-4 py-3">
          <p className="font-body text-[12px] leading-relaxed text-ink">
            {t.segments.warn.smallSegmentA}{formatCount(counts.matched, lang)}{t.segments.warn.smallSegmentB}{formatCount(SMALL_SEGMENT, lang)}{t.segments.warn.smallSegmentC}
          </p>
        </div>
      )}
      {counts && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass rounded-card p-5">
            <div className="flex items-center gap-2 text-ink-soft">
              <Users className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">{t.segments.countMatchedLabel}</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{formatCount(counts.matched, lang)}</p>
            <p className="mt-1 font-body text-[12px] text-ink-faint">{t.segments.countMatchedSub}</p>
          </div>

          <div className={`${counts.contactableMarketing === 0 ? "tint-red" : "glass"} rounded-card p-5`}>
            <div className="flex items-center gap-2 text-ink-soft">
              <Send className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">{t.segments.countMktLabel}</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{formatCount(counts.contactableMarketing, lang)}</p>
            {counts.contactableMarketing === 0 ? (
              <p className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft">
                {t.segments.warn.mktZeroA}{formatCount(counts.matched, lang)}{t.segments.warn.mktZeroB}<span className="font-mono">marketing</span>{t.segments.warn.mktZeroC}<Link href="/consent" className="font-semibold text-ink underline underline-offset-2">{t.segments.openConsent}</Link>.
              </p>
            ) : (
              <p className="mt-1 font-body text-[12px] text-ink-faint">{t.segments.countMktSub}</p>
            )}
          </div>

          <div className={`${counts.contactableService === 0 ? "tint-red" : "glass"} rounded-card p-5`}>
            <div className="flex items-center gap-2 text-ink-soft">
              <Send className="h-4 w-4" aria-hidden />
              <span className="font-display text-[12px] font-bold uppercase tracking-wide">{t.segments.countSvcLabel}</span>
            </div>
            <p className="mt-2 font-display text-[40px] font-black leading-none text-ink">{formatCount(counts.contactableService, lang)}</p>
            {counts.contactableService === 0 ? (
              <p className="mt-2 font-body text-[12px] leading-relaxed text-ink-soft">
                {t.segments.warn.svcZeroA}{formatCount(counts.matched, lang)}{t.segments.warn.svcZeroB}<span className="font-mono">transactional</span>{t.segments.warn.svcZeroC}
              </p>
            ) : (
              <p className="mt-1 font-body text-[12px] text-ink-faint">
                {t.segments.countSvcSub}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Mirror provenance (Sprint 5A, K-28): one line, only when a source-presence flag was used —
          that part of the count is read from the pre-joined mirror, so its freshness is shown. */}
      {counts?.mirrorRefreshedAt && (
        <p className="font-body text-[11px] text-ink-faint">
          {t.segments.mirrorFreshA}{formatDateTime(counts.mirrorRefreshedAt, lang)}{t.segments.mirrorFreshB}
        </p>
      )}

      <p className="font-mono text-[11px] text-ink-faint">{t.segments.warn.footer}</p>
    </div>
  );
}
