"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConsentData, EmptyRegister, Pager } from "@/components/consent/consent-shared";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatDate as fmtDate, formatCount } from "@/lib/i18n";

/**
 * CONSENT-BASIS archive — the crm_consent half of the old /consent screen (408k rows), now a READ-ONLY
 * panel under Settings (nav rebuild, K-36: consent is a record, not a gate). Keeps the zero/backfilled
 * meaning banners and the provisional-basis vocabulary — the honesty notes move WITH the data, none
 * dropped. Responsive: table on wide screens, cards on narrow ones (BAGIAN D).
 */

const BASIS_VALUES = ["legacy_import_unverified", "explicit_opt_in"] as const;

function ZeroMeaning() {
  const w = useI18n().t.consent.warn;
  return (
    <div className="tint-red rounded-card p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{w.zeroTitle}</h2>
      </div>
      <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
        {w.zeroBodyA}<span className="font-mono text-[12px]">purpose=marketing</span>
        {w.zeroBodyB}<span className="font-mono text-[12px]">status=active</span>{w.zeroBodyC}
      </p>
    </div>
  );
}

/**
 * Shown once the table holds more than one legal basis (T-60). It says the MIX, from data, and it
 * deliberately does NOT carry BackfilledMeaning's "delete the rows to undo it" line: that sentence
 * describes reverting a backfill, and applied to `explicit_opt_in` rows it would describe deleting
 * the evidence of a person's actual opt-in. The per-basis rollback recipes stay where they belong —
 * beside each write path, keyed on `source`, not offered as one blanket instruction here.
 */
function MixedBasisMeaning({ legacy, optin, other }: { legacy: number; optin: number; other: number }) {
  const { t, lang } = useI18n();
  const w = t.consent.warn;
  return (
    <div className="tint-amber rounded-card p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{w.mixedTitle}</h2>
      </div>
      <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">{w.mixedBody}</p>
      <ul className="mt-3 space-y-1 font-body text-[13px] text-ink-soft">
        <li>
          <span className="font-mono text-[12px] text-ink">legacy_import_unverified</span> —{" "}
          <strong className="tabular-nums">{formatCount(legacy, lang)}</strong> {w.mixedRows}
        </li>
        <li>
          <span className="font-mono text-[12px] text-ink">explicit_opt_in</span> —{" "}
          <strong className="tabular-nums">{formatCount(optin, lang)}</strong> {w.mixedRows}
        </li>
        {other > 0 && (
          <li className="text-red">
            <span className="font-mono text-[12px]">{w.mixedOtherLabel}</span> —{" "}
            <strong className="tabular-nums">{formatCount(other, lang)}</strong> {w.mixedRows} · {w.mixedOtherNote}
          </li>
        )}
      </ul>
    </div>
  );
}

function BackfilledMeaning() {
  const w = useI18n().t.consent.warn;
  return (
    <div className="tint-amber rounded-card p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
          {w.backfilledTitleA}<span className="font-mono">legacy_import_unverified</span>
        </h2>
      </div>
      <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
        {w.backfilledBodyA}<span className="font-mono text-[12px]">legacy_import_unverified</span>
        {w.backfilledBodyB}<span className="font-mono text-[12px]">crm_consent</span>
        {w.backfilledBodyC}<span className="font-mono text-[12px]">source = &apos;20fit_data_import&apos;</span>
        {w.backfilledBodyD}
      </p>
    </div>
  );
}

export function ConsentArchivePanel() {
  const { lang, t } = useI18n();
  const [cpage, setCpage] = useState(1);
  const { data, loading, error } = useConsentData(cpage, 1);
  const consent = data?.consent;
  const mix = data?.basisCounts;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">{t.consent.title}</h2>
        <p className="mt-1 max-w-3xl font-body text-[13px] text-ink-soft">{t.consent.subtitleA}</p>
      </div>

      {/* THREE states, not two (T-60). The old code was `total > 0 ? BackfilledMeaning : ZeroMeaning`,
          and BackfilledMeaning asserts that this table IS the legacy backfill and that deleting its
          rows undoes that cleanly. Both claims were true while every row was legacy — 408,119 of
          408,119, measured 7 Sep 2026 — and the CSV import breaks both: it writes `explicit_opt_in`
          rows whose deletion destroys per-person opt-in evidence rather than reverting a backfill.
          So the banner is now chosen from the DATA, and the mixed case gets its own wording. */}
      {!consent || consent.total === 0 ? (
        <ZeroMeaning />
      ) : mix && (mix.explicitOptIn > 0 || mix.other > 0) ? (
        <MixedBasisMeaning legacy={mix.legacy} optin={mix.explicitOptIn} other={mix.other} />
      ) : (
        <BackfilledMeaning />
      )}

      <div className="rounded-card border border-glass-border p-5">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          {t.consent.basisHeadingA}<span className="font-mono">basis</span>{" "}
          <Badge tone="amber">{t.consent.basisProvisional}</Badge>
        </h3>
        <ul className="mt-3 space-y-1.5 font-body text-[13px] text-ink-soft">
          {BASIS_VALUES.map((value) => (
            <li key={value}>
              <span className="font-mono text-[12px] text-ink">{value}</span> —{" "}
              {value === "legacy_import_unverified" ? t.consent.basisNoteLegacy : t.consent.basisNoteOptin}
            </li>
          ))}
        </ul>
        <p className="mt-2 font-body text-[12px] text-ink-faint">{t.consent.basisFooter}</p>
      </div>

      {error && (
        <div className="rounded-card border border-glass-border p-6 text-center">
          <Badge tone="red">{t.consent.failed}</Badge>
          <p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-[16px] font-extrabold uppercase tracking-wide text-ink">{t.consent.sectionConsent}</h3>
          <span className="font-mono text-[12px] text-ink-faint">crm_consent</span>
        </div>
        {loading && !data ? (
          <p className="font-body text-[14px] text-ink-soft">{t.consent.loading}</p>
        ) : consent && consent.total === 0 ? (
          <EmptyRegister what={t.consent.emptyConsentWhat} why={t.consent.warn.emptyConsentWhy} />
        ) : consent ? (
          <>
            <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-bold">{t.consent.thProfile}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thChannel}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thPurpose}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thBasis}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thStatus}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thRecorded}</th>
                  </tr>
                </thead>
                <tbody className="font-body text-[13px] text-ink">
                  {consent.rows.map((r) => (
                    <tr key={r.id} className="border-b border-glass-border last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px]">{r.customer_id ?? <span className="text-ink-faint">{t.consent.orphan}</span>}</td>
                      <td className="px-4 py-3">{r.channel}</td>
                      <td className="px-4 py-3">{r.purpose}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{r.basis}</td>
                      <td className="px-4 py-3"><Badge tone={r.status === "active" ? "green" : "neutral"}>{r.status}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{fmtDate(r.recorded_at, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 md:hidden">
              {consent.rows.map((r) => (
                <div key={r.id} className="rounded-card border border-glass-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-ink">{r.customer_id ?? t.consent.orphan}</span>
                    <Badge tone={r.status === "active" ? "green" : "neutral"}>{r.status}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-body text-[12px] text-ink-soft">
                    <span>{r.channel} · {r.purpose}</span>
                    <span className="font-mono">{r.basis}</span>
                    <span className="font-mono">{fmtDate(r.recorded_at, lang)}</span>
                  </div>
                </div>
              ))}
            </div>

            <Pager page={consent.page} total={consent.total} pageSize={consent.pageSize} loading={loading}
              onPrev={() => setCpage((p) => Math.max(1, p - 1))} onNext={() => setCpage((p) => p + 1)} />
          </>
        ) : null}
      </div>
    </section>
  );
}
