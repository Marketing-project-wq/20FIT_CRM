"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Database, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConsentData, EmptyRegister, Pager } from "@/components/consent/consent-shared";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatDate as fmtDate, formatCount } from "@/lib/i18n";

const BASIS_VALUES = ["legacy_import_unverified", "explicit_opt_in"] as const;

function truncateUuid(uuid: string): string {
  if (uuid.length < 16) return uuid;
  return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
}

function SummaryCards({
  total,
  mix,
}: {
  total: number;
  mix?: { legacy: number; explicitOptIn: number; other: number };
}) {
  const { t, lang } = useI18n();
  const c = t.consent;

  const activePct = mix ? Math.round(((mix.legacy + mix.explicitOptIn) / Math.max(total, 1)) * 100) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="glass rounded-card p-4">
        <div className="flex items-center gap-2 text-ink-soft">
          <Database className="h-4 w-4" aria-hidden />
          <span className="font-display text-[11px] font-bold uppercase tracking-wide">{c.consentSummaryTotal}</span>
        </div>
        <p className="mt-1 font-display text-[28px] font-black tabular-nums text-ink">{formatCount(total, lang)}</p>
      </div>
      <div className="glass rounded-card p-4">
        <div className="flex items-center gap-2 text-ink-soft">
          <ShieldCheck className="h-4 w-4 text-green" aria-hidden />
          <span className="font-display text-[11px] font-bold uppercase tracking-wide">{c.consentSummaryActive}</span>
        </div>
        <p className="mt-1 font-display text-[28px] font-black tabular-nums text-ink">{activePct}%</p>
        {mix && (
          <p className="mt-0.5 font-body text-[11px] text-ink-faint">
            <ShieldX className="mr-1 inline h-3 w-3" aria-hidden />
            {c.consentSummaryRevoked}: {formatCount(mix.other, lang)}
          </p>
        )}
      </div>
      {mix && (
        <>
          <div className="glass rounded-card p-4">
            <div className="flex items-center gap-2 text-ink-soft">
              <span className="font-display text-[11px] font-bold uppercase tracking-wide">{c.consentSummaryLegacy}</span>
            </div>
            <p className="mt-1 font-display text-[28px] font-black tabular-nums text-ink">{formatCount(mix.legacy, lang)}</p>
          </div>
          <div className="glass rounded-card p-4">
            <div className="flex items-center gap-2 text-ink-soft">
              <span className="font-display text-[11px] font-bold uppercase tracking-wide">{c.consentSummaryOptin}</span>
            </div>
            <p className="mt-1 font-display text-[28px] font-black tabular-nums text-ink">{formatCount(mix.explicitOptIn, lang)}</p>
          </div>
        </>
      )}
    </div>
  );
}

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
  const c = t.consent;
  const [cpage, setCpage] = useState(1);
  const [tableOpen, setTableOpen] = useState(false);
  const { data, loading, error } = useConsentData(cpage, 1);
  const consent = data?.consent;
  const mix = data?.basisCounts;

  const recordCountLabel = c.consentRecordCount.replace("{n}", formatCount(consent?.total ?? 0, lang));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-[22px] font-extrabold uppercase tracking-wide text-ink">{c.title}</h2>
        <p className="mt-1 max-w-3xl font-body text-[13px] text-ink-soft">{c.subtitleA}</p>
      </div>

      {!consent || consent.total === 0 ? (
        <ZeroMeaning />
      ) : mix && (mix.explicitOptIn > 0 || mix.other > 0) ? (
        <MixedBasisMeaning legacy={mix.legacy} optin={mix.explicitOptIn} other={mix.other} />
      ) : (
        <BackfilledMeaning />
      )}

      {/* Summary cards */}
      {consent && consent.total > 0 && <SummaryCards total={consent.total} mix={mix} />}

      <div className="rounded-card border border-glass-border p-5">
        <h3 className="font-display text-[13px] font-bold uppercase tracking-wide text-ink">
          {c.basisHeadingA}<span className="font-mono">basis</span>{" "}
          <Badge tone="amber">{c.basisProvisional}</Badge>
        </h3>
        <ul className="mt-3 space-y-1.5 font-body text-[13px] text-ink-soft">
          {BASIS_VALUES.map((value) => (
            <li key={value}>
              <span className="font-mono text-[12px] text-ink">{value}</span> —{" "}
              {value === "legacy_import_unverified" ? c.basisNoteLegacy : c.basisNoteOptin}
            </li>
          ))}
        </ul>
        <p className="mt-2 font-body text-[12px] text-ink-faint">{c.basisFooter}</p>
      </div>

      {error && (
        <div className="rounded-card border border-glass-border p-6 text-center">
          <Badge tone="red">{c.failed}</Badge>
          <p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p>
        </div>
      )}

      {/* Collapsible table */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setTableOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-card border border-glass-border px-4 py-3 text-left transition-colors hover:bg-glass"
        >
          <span className="font-display text-[14px] font-bold uppercase tracking-wide text-ink">
            {tableOpen ? c.consentHideTable : c.consentShowTable}{" "}
            <span className="ml-1 font-body text-[12px] font-normal normal-case text-ink-faint">({recordCountLabel})</span>
          </span>
          {tableOpen ? <ChevronUp className="h-4 w-4 text-ink-soft" /> : <ChevronDown className="h-4 w-4 text-ink-soft" />}
        </button>

        {tableOpen && (
          <>
            {loading && !data ? (
              <p className="font-body text-[14px] text-ink-soft">{c.loading}</p>
            ) : consent && consent.total === 0 ? (
              <EmptyRegister what={c.emptyConsentWhat} why={c.warn.emptyConsentWhy} />
            ) : consent ? (
              <>
                {/* Wide: compact table with truncated UUIDs */}
                <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                        <th className="px-4 py-3 font-bold">{c.thProfile}</th>
                        <th className="px-4 py-3 font-bold">{c.thChannel}</th>
                        <th className="px-4 py-3 font-bold">{c.thPurpose}</th>
                        <th className="px-4 py-3 font-bold">{c.thBasis}</th>
                        <th className="px-4 py-3 font-bold">{c.thStatus}</th>
                        <th className="px-4 py-3 font-bold">{c.thRecorded}</th>
                      </tr>
                    </thead>
                    <tbody className="font-body text-[13px] text-ink">
                      {consent.rows.map((r) => (
                        <tr key={r.id} className="border-b border-glass-border last:border-0">
                          <td className="px-4 py-2 font-mono text-[12px]" title={r.customer_id ?? undefined}>
                            {r.customer_id ? truncateUuid(r.customer_id) : <span className="text-ink-faint">{c.orphan}</span>}
                          </td>
                          <td className="px-4 py-2">{r.channel}</td>
                          <td className="px-4 py-2">{r.purpose}</td>
                          <td className="px-4 py-2 font-mono text-[12px]">{r.basis}</td>
                          <td className="px-4 py-2"><Badge tone={r.status === "active" ? "green" : "neutral"}>{r.status}</Badge></td>
                          <td className="px-4 py-2 font-mono text-[12px] text-ink-soft">{fmtDate(r.recorded_at, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Narrow: cards with truncated UUIDs */}
                <div className="flex flex-col gap-2 md:hidden">
                  {consent.rows.map((r) => (
                    <div key={r.id} className="rounded-card border border-glass-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[12px] text-ink" title={r.customer_id ?? undefined}>
                          {r.customer_id ? truncateUuid(r.customer_id) : c.orphan}
                        </span>
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
          </>
        )}
      </div>
    </section>
  );
}
