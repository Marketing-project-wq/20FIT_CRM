"use client";

import { useState } from "react";
import { Ban, Lock, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuppressionForm } from "@/components/consent/suppression-form";
import { LiftSuppressionDialog } from "@/components/consent/lift-dialog";
import { useConsentData, EmptyRegister, Pager, type SuppressionRow } from "@/components/consent/consent-shared";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatDate as fmtDate } from "@/lib/i18n";

/**
 * UNSUBSCRIBE list — the crm_suppression half of the old /consent screen, now a tab under Audience
 * (nav rebuild). Carries the "suppression WINS over consent" warning (moved here with the list, not
 * dropped) and the record-a-stop write path. Responsive (BAGIAN D): a table on wide screens, per-row
 * cards on narrow ones — a sideways-scrolling table on a phone is almost never used.
 */

/** The rule hierarchy — the thing most likely to be misread. Moved here WITH the suppression list. */
function SuppressionWins() {
  const w = useI18n().t.consent.warn;
  return (
    <div className="tint-amber rounded-card p-5">
      <div className="flex items-center gap-2">
        <Ban className="h-4 w-4" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{w.winsTitle}</h2>
      </div>
      <p className="mt-3 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
        {w.winsBodyA}
        <span className="font-mono text-[12px]">crm_suppression</span>
        {w.winsBodyB}
        <span className="font-mono text-[12px]">isContactableForMarketing</span>
        {w.winsBodyC}
        <span className="font-mono text-[12px]">customer_id</span>
        {w.winsBodyD}
      </p>
    </div>
  );
}

function LiftCell({ r, onLift }: { r: SuppressionRow; onLift: () => void }) {
  const { t } = useI18n();
  if (r.status !== "active") return <span className="font-mono text-[11px] text-ink-faint">—</span>;
  return (
    <Button size="sm" variant="ghost" onClick={onLift}>
      <Undo2 className="h-3.5 w-3.5" /> {t.consent.liftButton}
    </Button>
  );
}

export function SuppressionPanel() {
  const { lang, t } = useI18n();
  const [spage, setSpage] = useState(1);
  const { data, loading, error, reload } = useConsentData(1, spage);
  const [recordOpen, setRecordOpen] = useState(false);
  const [liftTarget, setLiftTarget] = useState<{ id: string; label: string } | null>(null);
  const suppression = data?.suppression;
  const labelFor = (r: SuppressionRow) => `${r.identity_kind} · ${r.identity_key ?? "—"}`;

  return (
    <div className="space-y-6">
      <SuppressionWins />

      {error && (
        <div className="rounded-card border border-glass-border p-6 text-center">
          <Badge tone="red">{t.consent.failed}</Badge>
          <p className="mt-2 font-body text-[13px] text-ink-soft">{error}</p>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">{t.consent.sectionSuppression}</h2>
          <span className="font-mono text-[12px] text-ink-faint">crm_suppression</span>
          {suppression && suppression.rows.some((r) => r.identity_key?.includes("*")) && (
            <Badge tone="amber" className="gap-1.5"><Lock className="h-3.5 w-3.5" /> {t.consent.maskedShort}</Badge>
          )}
          <Button size="sm" variant="outline" className="ml-auto min-h-[40px]" onClick={() => setRecordOpen(true)}>
            <Ban className="h-3.5 w-3.5" /> {t.consent.recordButton}
          </Button>
        </div>

        {loading && !data ? (
          <p className="font-body text-[14px] text-ink-soft">{t.consent.loading}</p>
        ) : suppression && suppression.total === 0 ? (
          <EmptyRegister what={t.consent.emptySuppWhat} why={t.consent.warn.emptySuppWhy} />
        ) : suppression ? (
          <>
            {/* Wide screens: table. */}
            <div className="hidden overflow-x-auto rounded-card border border-glass-border md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-glass-border font-display text-[12px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-3 font-bold">{t.consent.thKind}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thIdentity}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thReason}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thStatus}</th>
                    <th className="px-4 py-3 font-bold">{t.consent.thRecorded}</th>
                    <th className="px-4 py-3 font-bold text-right">{t.consent.thAction}</th>
                  </tr>
                </thead>
                <tbody className="font-body text-[13px] text-ink">
                  {suppression.rows.map((r) => (
                    <tr key={r.id} className="border-b border-glass-border last:border-0">
                      <td className="px-4 py-3">{r.identity_kind}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{r.identity_key ?? "—"}</td>
                      <td className="px-4 py-3">{r.reason_code}</td>
                      <td className="px-4 py-3"><Badge tone={r.status === "active" ? "red" : "neutral"}>{r.status}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[12px] text-ink-soft">{fmtDate(r.created_at, lang)}</td>
                      <td className="px-4 py-3 text-right">
                        <LiftCell r={r} onLift={() => setLiftTarget({ id: r.id, label: labelFor(r) })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Narrow screens: one card per row. */}
            <div className="flex flex-col gap-2 md:hidden">
              {suppression.rows.map((r) => (
                <div key={r.id} className="rounded-card border border-glass-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] text-ink">{r.identity_key ?? "—"}</span>
                    <Badge tone={r.status === "active" ? "red" : "neutral"}>{r.status}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-body text-[12px] text-ink-soft">
                    <span>{t.consent.thKind}: {r.identity_kind}</span>
                    <span>{t.consent.thReason}: {r.reason_code}</span>
                    <span className="font-mono">{fmtDate(r.created_at, lang)}</span>
                  </div>
                  <div className="mt-2">
                    <LiftCell r={r} onLift={() => setLiftTarget({ id: r.id, label: labelFor(r) })} />
                  </div>
                </div>
              ))}
            </div>

            <Pager page={suppression.page} total={suppression.total} pageSize={suppression.pageSize} loading={loading}
              onPrev={() => setSpage((p) => Math.max(1, p - 1))} onNext={() => setSpage((p) => p + 1)} />
          </>
        ) : null}
      </section>

      <p className="font-mono text-[11px] text-ink-faint">{t.consent.warn.footer}</p>

      <SuppressionForm mode="direct" open={recordOpen} onOpenChange={setRecordOpen} onRecorded={reload} />
      {liftTarget && (
        <LiftSuppressionDialog
          open={liftTarget !== null}
          onOpenChange={(o) => !o && setLiftTarget(null)}
          suppressionId={liftTarget.id}
          identityLabel={liftTarget.label}
          onLifted={reload}
        />
      )}
    </div>
  );
}
