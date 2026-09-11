import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n";
import type { DeliveryRow, DeliveryState, DeliveryDetail } from "@/lib/crm/deliveries";
import { CancelDeliveryButton } from "./cancel-delivery-button";
import { DrainControlButtons } from "./drain-control-buttons";
import { RecipientTable } from "./recipient-table";

/**
 * Deliveries tab (Campaigns) — one chronological list of scheduled sends + campaign runs. A run row
 * links to its per-recipient detail (traceable to the run, fix #2); a pending scheduled send can be
 * cancelled straight from its row (an uncancellable scheduled send is a trap). Manual vs automated
 * (workflow) sends are tagged so they read differently when tracing a problem.
 */

const STATE_META: Record<DeliveryState, { key: keyof Dict["campaignsPage"]["deliveries"]; tone: "blue" | "amber" | "green" | "red" | "neutral" }> = {
  upcoming: { key: "stateUpcoming", tone: "blue" },
  overdue: { key: "stateOverdue", tone: "red" }, // past its time but never ran — the T-40 #8 symptom, made loud
  running: { key: "stateRunning", tone: "amber" },
  paused: { key: "statePaused", tone: "blue" }, // P0-3: spent today's daily budget — waits for a human Lanjutkan
  stalled: { key: "stateStalled", tone: "red" }, // P0-3: drain-active but the executor went silent — a zombie made loud
  done: { key: "stateDone", tone: "green" },
  // Two states a run can now land in honestly instead of being filed as "Selesai" (T-42): some
  // recipients failed (partial) or every one did (failed).
  partial: { key: "statePartial", tone: "amber" },
  failed: { key: "stateFailed", tone: "red" },
  stopped: { key: "stateStopped", tone: "red" },
  cancelled: { key: "stateCancelled", tone: "neutral" },
};

/** UTC ISO → "YYYY-MM-DD HH:mm WIB" (WIB = UTC+7). Scheduled sends are entered in WIB, so showing WIB
 *  keeps the displayed time consistent with what the operator typed. */
function wibDisplay(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return utcIso;
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.toISOString().slice(0, 16).replace("T", " ")} WIB`;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-sm border border-glass-border px-3 py-2">
      <div className="font-body text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 font-body text-[15px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function ProgressBar({ row, labels }: { row: DeliveryRow; labels: Dict["campaignsPage"]["deliveries"] }) {
  const total = row.recipientCount;
  const delivered = row.deliveredCount;
  const sent = row.sentCount;
  const good = sent + delivered;
  const bad = row.failedCount + row.bouncedCount;
  const remaining = Math.max(0, total - good - bad);
  const pctDelivered = (delivered / total) * 100;
  const pctSent = (sent / total) * 100;
  const pctBad = (bad / total) * 100;
  const pctRemaining = 100 - pctDelivered - pctSent - pctBad;
  const inProgress = row.state === "running" || row.state === "paused" || row.state === "stalled";
  const text = labels.progressSent.replace("{x}", String(good)).replace("{y}", String(total));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-faint/20">
        {pctDelivered > 0 && (
          <div className="bg-green transition-all duration-300" style={{ width: `${pctDelivered}%` }} />
        )}
        {pctSent > 0 && (
          <div className="bg-green-dim transition-all duration-300" style={{ width: `${pctSent}%` }} />
        )}
        {pctBad > 0 && (
          <div className="bg-red transition-all duration-300" style={{ width: `${pctBad}%` }} />
        )}
        {pctRemaining > 0 && (
          <div
            className={`bg-ink-faint/30 transition-all duration-300${inProgress ? " progress-pulse" : ""}`}
            style={{ width: `${pctRemaining}%` }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-body text-[11px] text-ink-faint">
        <span>{text}</span>
        {delivered > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green" />
            {labels.progressConfirmed}
          </span>
        )}
        {sent > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-dim" />
            {labels.progressDelivered}
          </span>
        )}
        {bad > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red" />
            {labels.progressFailed}
          </span>
        )}
        {remaining > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-ink-faint/30" />
            {labels.progressRemaining}
          </span>
        )}
      </div>
    </div>
  );
}

function CompactStats({ row, labels }: { row: DeliveryRow; labels: Dict["campaignsPage"]["deliveries"] }) {
  const total = row.recipientCount;
  const delivered = row.deliveredCount;
  const sent = row.sentCount + delivered;
  const bounced = row.bouncedCount;
  const failed = row.failedCount;
  const opened = row.openedCount;
  const clicked = row.clickedCount;
  const openRate = delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : null;
  const clickRate = delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-body text-[11px] text-ink-faint">
      <span>{labels.statSent} {sent}/{total}</span>
      <span>{labels.statDelivered} {delivered}</span>
      {opened > 0 && <span>{labels.statOpened} {opened}{openRate != null && ` (${openRate}%)`}</span>}
      {clicked > 0 && <span>{labels.statClicked} {clicked}{clickRate != null && ` (${clickRate}%)`}</span>}
      {bounced > 0 && <span className="text-red">{labels.statBounced} {bounced}</span>}
      {failed > 0 && <span className="text-red">{labels.statFailed} {failed}</span>}
    </div>
  );
}

export function DeliveriesTab({
  deliveries,
  detail,
  detailRequested,
}: {
  deliveries: DeliveryRow[];
  detail: DeliveryDetail | null;
  detailRequested: boolean;
}) {
  const { t } = getServerDict();
  const d = t.campaignsPage.deliveries;

  // ── DETAIL: the full picture of one delivery ──
  if (detailRequested) {
    const backLink = (
      <Link href="/campaigns?tab=kiriman" className="font-body text-[13px] text-red hover:underline">
        {d.backToList}
      </Link>
    );
    if (!detail) {
      return (
        <div className="flex flex-col gap-5">
          {backLink}
          <p className="font-body text-[13px] text-ink-soft">{d.notFound}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {backLink}

        {/* Summary */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={detail.source === "auto" ? "blue" : "neutral"}>
              {detail.source === "auto" ? d.sourceAuto : d.sourceManual}
            </Badge>
            <h2 className="font-body text-[16px] font-semibold text-ink">{detail.label ?? d.unnamedRun}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label={d.sumOwner} value={detail.ownerName ?? <span className="italic text-ink-faint">{d.ownerUnresolved}</span>} />
            <Stat label={d.sumTemplate} value={<span className="font-mono text-[13px]">{detail.templateKey}</span>} />
            <Stat label={d.sumVersion} value={detail.templateVersion ?? "—"} />
            <Stat label={d.sumTime} value={<span className="font-mono text-[13px]">{wibDisplay(detail.createdAt)}</span>} />
            <Stat label={d.sumSentBy} value={<span className="font-mono text-[13px]">{detail.createdBy ?? "—"}</span>} />
            <Stat label={d.sumStatus} value={detail.status} />
          </div>
          {detail.lastError && <p className="font-body text-[12px] text-red">{d.lastError}: {detail.lastError}</p>}
        </section>

        {/* Audience — the four numbers computed at send time */}
        <section className="flex flex-col gap-2">
          <h3 className="font-body text-[13px] font-semibold text-ink">{d.audienceTitle}</h3>
          {detail.audience ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={d.audMatched} value={detail.audience.matched} />
              <Stat label={d.audHasEmail} value={detail.audience.hasEmail} />
              <Stat label={d.audSkipped} value={detail.audience.skippedSuppression} />
              <Stat label={d.audSent} value={detail.audience.sent} />
            </div>
          ) : (
            <p className="font-body text-[12px] text-ink-faint">{d.audienceMissing}</p>
          )}
        </section>

        {/* Result report — from crm_message_log (webhook-filled). */}
        <section className="flex flex-col gap-2">
          <h3 className="font-body text-[13px] font-semibold text-ink">{d.resultTitle}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label={d.resSent} value={detail.result.sent} />
            <Stat label={d.resDelivered} value={detail.result.delivered} />
            <Stat label={d.resOpened} value={detail.engagementMeasured ? detail.result.opened : "—"} />
            <Stat label={d.resClicked} value={detail.engagementMeasured ? detail.result.clicked : "—"} />
            <Stat label={d.resBounced} value={detail.result.bounced} />
            <Stat label={d.resComplained} value={detail.result.complained} />
            <Stat label={d.resUnsub} value={detail.result.unsubscribed} />
            <Stat label={d.resFailed} value={detail.result.failed} />
          </div>
          {!detail.engagementMeasured && (
            <p className="rounded-sm border border-dashed border-glass-border px-3 py-2 font-body text-[12px] leading-relaxed text-ink-faint">
              {d.engagementNote}
            </p>
          )}
        </section>

        {/* Email preview — the EXACT version sent, skeleton-wrapped, isolated in a sandboxed iframe */}
        <section className="flex flex-col gap-2">
          <h3 className="font-body text-[13px] font-semibold text-ink">{d.previewTitle}</h3>
          {detail.preview ? (
            <>
              <p className="font-body text-[12px] leading-relaxed text-ink-faint">
                {detail.templateVersion != null
                  ? d.previewVersionNote.replace("{v}", String(detail.templateVersion))
                  : d.previewNoVersion}
              </p>
              {detail.preview.subject && (
                <p className="font-body text-[13px] text-ink"><span className="text-ink-faint">Subjek:</span> {detail.preview.subject}</p>
              )}
              <iframe
                title={d.previewTitle}
                sandbox=""
                srcDoc={detail.preview.html}
                className="h-[520px] w-full rounded-card border border-glass-border bg-white"
              />
            </>
          ) : (
            <p className="font-body text-[12px] text-ink-faint">{d.previewMissing}</p>
          )}
        </section>

        {/* Recipient list */}
        <section className="flex flex-col gap-2">
          <h3 className="font-body text-[13px] font-semibold text-ink">{d.recipientsTitle}</h3>
          <p className="font-body text-[12px] leading-relaxed text-ink-faint">{d.maskNote}</p>
          <RecipientTable recipients={detail.recipients} />
        </section>
      </div>
    );
  }

  // ── LIST: the merged timeline ──
  return (
    <div className="flex flex-col gap-5">
      <p className="font-body text-[13px] leading-relaxed text-ink-soft">{d.subtitle}</p>

      {deliveries.length === 0 ? (
        <div className="rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
          <p className="font-body text-[13px] text-ink-soft">{d.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {deliveries.map((row) => {
            const st = STATE_META[row.state];
            return (
              <div key={`${row.kind}:${row.id}`} className="glass flex flex-col gap-2 rounded-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={st.tone}>{d[st.key]}</Badge>
                  <Badge tone={row.source === "auto" ? "blue" : "neutral"}>
                    {row.source === "auto" ? d.sourceAuto : d.sourceManual}
                  </Badge>
                  <span className="font-body text-[14px] font-semibold text-ink">{row.label ?? d.unnamedRun}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-[12px] text-ink-soft">
                  <span>{d.colOwner}: {row.ownerName ?? <span className="italic text-ink-faint">{d.ownerUnresolved}</span>}</span>
                  <span>{d.colTemplate}: <span className="font-mono">{row.templateKey}</span></span>
                  <span>{d.colRecipients}: {row.recipientCount}</span>
                  {row.failedCount > 0 && (
                    <span className="font-semibold text-red">{d.colFailed}: {row.failedCount}</span>
                  )}
                  <span className="font-mono">{wibDisplay(row.time)}</span>
                </div>
                {row.kind === "run" && row.recipientCount > 0 && (
                  <>
                    <ProgressBar row={row} labels={d} />
                    <CompactStats row={row} labels={d} />
                  </>
                )}
                {row.lastError && (
                  <p className="font-body text-[12px] text-red">{d.lastError}: {row.lastError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {row.runId && (
                    <Link
                      href={`/campaigns?tab=kiriman&run=${row.runId}`}
                      className="font-body text-[13px] text-red hover:underline"
                    >
                      {d.viewRecipients}
                    </Link>
                  )}
                  {row.cancellable && <CancelDeliveryButton id={row.id} />}
                  {row.runId && (row.resumable || row.stoppable) && (
                    <DrainControlButtons runId={row.runId} resumable={row.resumable} stoppable={row.stoppable} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
