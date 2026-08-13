"use client";

import { useState } from "react";
import Link from "next/link";
import { Filter, Clock, Users, Send, Network, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ECOSYSTEM_UNITS, ECOSYSTEM_PRODUCTS_BY_UNIT } from "@/lib/crm/engagement-constants";
import { STAGING_RFM_VALUES, STAGING_PROGRAMS } from "@/lib/crm/staging-constants";
import { EMPTY_CRITERIA, type SegmentCriteria } from "@/lib/crm/segment";
import { describeProposal, proposalIsEmpty, type AssistProposal } from "@/lib/crm/segment-ai-shared";
import { FilterTreeBuilder, rowsToTree, type Row } from "@/components/segments/filter-tree-builder";
import { Why } from "@/components/ui/why";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount, formatPct } from "@/lib/i18n";

interface Counts {
  matched: number;
  contactableMarketing: number;
  contactableService: number;
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

export function SegmentBuilder({ cityFillPct, cityFilled, total, canViewHealth, canExport }: { cityFillPct: number; cityFilled: number; total: number; canViewHealth: boolean; canExport: boolean }) {
  const { lang, t } = useI18n();
  const [c, setC] = useState<SegmentCriteria>(EMPTY_CRITERIA);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProposal, setAiProposal] = useState<AssistProposal | null>(null);

  function set<K extends keyof SegmentCriteria>(k: K, v: SegmentCriteria[K]) {
    setC((prev) => ({ ...prev, [k]: v }));
    setCounts(null); // criteria changed -> stale result, recompute explicitly
    setExportError(null);
  }

  function setRowsAndClear(r: Row[]) {
    setRows(r);
    setCounts(null); // filter changed -> stale result
    setExportError(null);
  }

  // The request body — master fields come from the AND/OR tree; ecosystem + source presence stay
  // separate top-level ANDs (cross-table OR isn't expressible in one query). Shared by compute +
  // export so the exported file can never describe a different segment than the counts shown.
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
        return;
      }
      setCounts({
        matched: data.matched,
        contactableMarketing: data.contactableMarketing,
        contactableService: data.contactableService,
      });
    } catch {
      setError(t.segments.connFailed);
      setCounts(null);
    } finally {
      setLoading(false);
    }
  }

  // AI assistant: propose criteria from free text. The proposal is NEVER run automatically — it
  // fills the manual controls only when the user clicks "Terapkan", then they compute themselves.
  async function aiPropose() {
    setAiError(null);
    setAiProposal(null);
    setAiLoading(true);
    try {
      const res = await fetch("/api/segments/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(data?.message ?? `${t.segments.proposeFailed} (HTTP ${res.status}).`);
        return;
      }
      setAiProposal(data as AssistProposal);
    } catch {
      setAiError(t.segments.connFailed);
    } finally {
      setAiLoading(false);
    }
  }

  /** Apply a proposal into the MANUAL controls (rows + criteria). Nothing is computed yet. */
  function applyProposal(p: AssistProposal) {
    setRows(p.conditions.map((cnd) => ({ t: "cond", field: cnd.field, value: cnd.value })));
    setC((prev) => ({
      ...prev,
      ecoUnit: p.criteria.ecoUnit,
      ecoProduct: p.criteria.ecoProduct,
      srcHyrox: p.criteria.srcHyrox,
      srcMy20fit: p.criteria.srcMy20fit,
      srcRecency: p.criteria.srcRecency,
      srcArena: p.criteria.srcArena,
      srcGym: p.criteria.srcGym,
      srcClinicPatient: p.criteria.srcClinicPatient,
      srcClinicTxn: p.criteria.srcClinicTxn,
      srcRfm: p.criteria.srcRfm,
      srcProgram: p.criteria.srcProgram,
    }));
    setCounts(null);
    setAiProposal(null);
  }

  async function exportCsv() {
    setExportError(null);
    setExporting(true);
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(data?.message ?? `${t.segments.exportFailed} (HTTP ${res.status}).`);
        return;
      }
      // Streamed CSV → download. The connection stayed alive as pages flowed (no idle timeout).
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "segmen.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(t.segments.connFailed);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div>
          <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.segments}</h1>
          <p className="mt-2 max-w-3xl font-body text-[14px] text-ink-soft">
            {t.segments.subtitleA}<span className="font-mono text-[13px]">docs/RENCANA-simpan-segmen.md</span>{t.segments.subtitleB}
          </p>
        </div>
      </header>

      <TimeBanned />

      {/* Criteria */}
      <section className="glass rounded-card p-5">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-soft" aria-hidden />
          <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{t.segments.criteriaTitle}</h2>
        </div>

        {/* AI accelerator (Sprint 4A TUGAS 3). Describe the segment in words → the server maps it
            to criteria via an LLM whose JSON is re-validated against the closed vocabulary. It is
            a PROPOSAL: nothing runs until you apply it and press Hitung. The manual filters below
            are always complete on their own — if the AI is down, this box just disappears in use. */}
        <div className="mt-4 rounded-sm border border-glass-border/70 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ink-soft" aria-hidden />
            <h3 className="font-display text-[12px] font-bold uppercase tracking-wide text-ink">{t.segments.aiTitle}</h3>
          </div>
          <p className="mt-1 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
            {t.segments.aiDescA}<span className="font-mono">profile.view_health</span>{t.segments.aiDescB}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="h-10 min-w-[16rem] flex-1 rounded-sm border border-glass-border bg-glass px-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={t.segments.aiPlaceholder}
              maxLength={500}
            />
            <Button variant="outline" onClick={aiPropose} disabled={aiLoading || aiText.trim() === ""}>
              {aiLoading ? t.segments.aiProposing : t.segments.aiPropose}
            </Button>
          </div>
          {aiError && <p className="mt-2 font-body text-[13px] text-red">{aiError}</p>}
          {aiProposal && (
            <div className="tint-neutral mt-3 rounded-sm px-3 py-3">
              <p className="font-body text-[13px] text-ink">
                <span className="font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint">{t.segments.aiProposalLabel}</span>
                {describeProposal(aiProposal, lang)}
              </p>
              {aiProposal.notes && (
                <p className="mt-1.5 font-body text-[12px] italic text-ink-soft">{t.segments.aiNotesLabel}{aiProposal.notes}</p>
              )}
              {aiProposal.clinicalBlocked && (
                <p className="mt-1.5 font-body text-[12px] text-amber">
                  {t.segments.aiClinicalBlockedA}<span className="font-mono">profile.view_health</span>{t.segments.aiClinicalBlockedB}
                </p>
              )}
              {aiProposal.unexpressible.length > 0 && (
                <div className="mt-1.5">
                  <p className="font-body text-[12px] font-semibold text-ink">{t.segments.aiUnexpressibleTitle}</p>
                  <ul className="ml-4 list-disc font-body text-[12px] text-ink-soft">
                    {aiProposal.unexpressible.map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={() => applyProposal(aiProposal)} disabled={proposalIsEmpty(aiProposal)}>
                  {t.segments.aiApply}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAiProposal(null)}>{t.segments.aiIgnore}</Button>
                {proposalIsEmpty(aiProposal) && (
                  <span className="font-body text-[12px] italic text-ink-faint">{t.segments.aiNothingToApply}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <FilterTreeBuilder rows={rows} setRows={setRowsAndClear} />
        </div>

        {/* Ecosystem presence (customer_engagement) — a DIFFERENT table + vocabulary from
            the attributes above. "Ada engagement di unit/produk ini", keyed by customer_id. */}
        <div className="mt-5 rounded-sm border border-glass-border/70 p-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-ink-soft" aria-hidden />
            <h3 className="font-display text-[12px] font-bold uppercase tracking-wide text-ink">
              {t.segments.ecoTitle}
            </h3>
          </div>
          <p className="mt-1 max-w-3xl font-body text-[12px] leading-relaxed text-ink-soft">
            {t.segments.warn.ecoDescA}<span className="font-mono">customer_engagement</span>{t.segments.warn.ecoDescB}<span className="font-mono">event</span>{t.segments.warn.ecoDescC}<span className="font-mono">membership</span>{t.segments.warn.ecoDescD}<span className="font-mono">last_seen_at</span>{t.segments.warn.ecoDescE}
          </p>
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
            <p className="font-body text-[11px] leading-relaxed text-ink-faint">
              {t.segments.warn.srcRecencyA}<span className="font-mono">last_active_at</span>{t.segments.warn.srcRecencyB}
            </p>
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
            <p className="font-body text-[11px] leading-relaxed text-ink-faint">
              {t.segments.warn.sourcesAndA}
            </p>
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
            <p className="font-body text-[11px] leading-relaxed text-ink-faint">
              {t.segments.warn.stagingA}<span className="font-mono">staging_20fit_data</span>{t.segments.warn.stagingB}<span className="font-mono">Campion user</span>{t.segments.warn.stagingC}{canViewHealth ? t.segments.stagingGated : t.segments.stagingHidden}{t.segments.warn.stagingD}<span className="font-mono">profile.view_health</span>{t.segments.warn.stagingE}
            </p>
          </div>
        </div>

        {/* City warning — in place, not a footnote (93% empty). */}
        <div className="tint-amber mt-4 rounded-sm px-3 py-2">
          <p className="font-body text-[12px] leading-relaxed text-ink">
            {t.segments.warn.cityA}{formatPct(cityFillPct, lang)}{t.segments.warn.cityB}{formatCount(cityFilled, lang)}{t.segments.warn.cityC}{formatCount(total, lang)}{t.segments.warn.cityD}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={compute} disabled={loading}>
            {loading ? t.segments.computing : t.segments.computeBtn}
          </Button>
          {/* Export is a separate, gated action (PRD 17.2). Enabled only after a compute so the
              file always matches a segment the user has just seen the size of. The server
              re-checks the grant against the row count and refuses (approval / deny) with a
              message; suppression is excluded and NIK/clinical are never columns. */}
          {canExport && (
            <Button variant="outline" onClick={exportCsv} disabled={exporting || !counts}>
              <Download className="h-3.5 w-3.5" /> {exporting ? t.segments.exporting : t.segments.exportBtn}
            </Button>
          )}
          {error && <p className="w-full font-body text-[13px] text-red">{error}</p>}
          {exportError && <p className="w-full font-body text-[13px] text-red">{exportError}</p>}
          {canExport && counts && !exportError && (
            <p className="w-full font-body text-[11px] leading-relaxed text-ink-faint">
              {t.segments.warn.exportNoteA}<span className="font-mono">EOF total_baris=…</span>{t.segments.warn.exportNoteB}
            </p>
          )}
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

      <p className="font-mono text-[11px] text-ink-faint">{t.segments.warn.footer}</p>
    </div>
  );
}
