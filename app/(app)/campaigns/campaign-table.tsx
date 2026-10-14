"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Dict } from "@/lib/i18n";
import type { DeliveryRow, DeliveryState } from "@/lib/crm/deliveries";
import { isAgentMailTemplateKey } from "@/lib/crm/agent-mail/guide";
import { CancelDeliveryButton } from "./cancel-delivery-button";
import { DrainControlButtons } from "./drain-control-buttons";

type DeliveryLabels = Dict["campaignsPage"]["deliveries"];

/** Status dot per delivery state — green = done, blue = in flight / upcoming, amber = waits on a
 *  human (paused, partial), red = stopped / failed / overdue, faint = cancelled. */
const DOT: Record<DeliveryState, string> = {
  upcoming: "bg-blue",
  overdue: "bg-red",
  running: "bg-blue progress-pulse",
  paused: "bg-amber",
  stalled: "bg-red progress-pulse",
  done: "bg-green",
  partial: "bg-amber",
  failed: "bg-red",
  stopped: "bg-red",
  cancelled: "bg-ink-faint",
};

const STATE_KEY: Record<DeliveryState, keyof DeliveryLabels> = {
  upcoming: "stateUpcoming",
  overdue: "stateOverdue",
  running: "stateRunning",
  paused: "statePaused",
  stalled: "stateStalled",
  done: "stateDone",
  partial: "statePartial",
  failed: "stateFailed",
  stopped: "stateStopped",
  cancelled: "stateCancelled",
};

function wib(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return utcIso;
  return `${new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ")} WIB`;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}jt`;
  if (n >= 10_000) return `${Math.round(n / 1000)}rb`;
  return n.toLocaleString("id-ID");
}

function rate(n: number, base: number): string {
  return base > 0 ? `${((n / base) * 100).toFixed(1).replace(/\.0$/, "")}%` : "—";
}

/**
 * Per-campaign performance from crm_message_log, Mailtrap-style:
 *   sent       = rows that left the provider (status sent + delivered_at + bounced)
 *   base       = delivered when the webhook reported it, else sent − bounced − failed
 *   open/click/unsubscribe rates over `base`; bounce/spam over `sent`.
 */
function metrics(row: DeliveryRow) {
  const sent = row.sentCount + row.deliveredCount + row.bouncedCount;
  const base = row.deliveredCount > 0 ? row.deliveredCount : Math.max(0, sent - row.bouncedCount - row.failedCount);
  return {
    sent,
    queued: Math.max(0, row.recipientCount - sent - row.failedCount),
    opened: rate(row.openedCount, base),
    clicked: rate(row.clickedCount, base),
    bounced: rate(row.bouncedCount, sent),
    spam: rate(row.complainedCount, sent),
    unsub: rate(row.unsubscribedCount, base),
  };
}

export function CampaignTable({ rows, detailHref }: { rows: DeliveryRow[]; detailHref: (runId: string) => string }) {
  const { t } = useI18n();
  const d = t.campaignsPage.deliveries;

  return (
    <div className="glass overflow-x-auto rounded-card">
      <table className="w-full min-w-[920px] font-body text-[13px]">
        <thead>
          <tr className="border-b border-glass-border text-left text-[12px] font-semibold text-ink-soft">
            <th className="px-4 py-3">{d.colStatus}</th>
            <th className="px-3 py-3">{d.colCampaign}</th>
            <th className="px-3 py-3 text-right">{d.colSent}</th>
            <th className="px-3 py-3 text-right">{d.colOpened}</th>
            <th className="px-3 py-3 text-right">{d.colClicked}</th>
            <th className="px-3 py-3 text-right">{d.colBounce}</th>
            <th className="px-3 py-3 text-right">{d.colSpam}</th>
            <th className="px-3 py-3 text-right">{d.colUnsub}</th>
            <th className="px-3 py-3" aria-label={d.viewDetail} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const m = metrics(row);
            const agent = isAgentMailTemplateKey(row.templateKey);
            const key = `${row.kind}:${row.id}`;
            return (
              <tr key={key} className="border-b border-glass-border last:border-b-0 hover:bg-glass-strong">
                <td className="px-4 py-3.5 align-top">
                  <span className="flex items-center gap-2" title={d[STATE_KEY[row.state]]}>
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DOT[row.state]}`} aria-hidden />
                    <span className="whitespace-nowrap text-[12px] text-ink-soft">{d[STATE_KEY[row.state]]}</span>
                  </span>
                </td>
                <td className="max-w-[340px] px-3 py-3.5 align-top">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.runId ? (
                      <Link href={detailHref(row.runId)} className="truncate font-semibold text-ink hover:text-red hover:underline">
                        {row.label ?? d.unnamedRun}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold text-ink">{row.label ?? d.unnamedRun}</span>
                    )}
                    {agent && <Badge tone="blue">{d.agentBadge}</Badge>}
                    {row.source === "auto" && <Badge tone="neutral">{d.sourceAuto}</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink-faint">
                    {row.ownerName ?? d.ownerUnresolved} · {wib(row.time)}
                  </div>
                  {row.lastError && <div className="mt-0.5 truncate text-[12px] text-red" title={row.lastError}>{d.lastError}: {row.lastError}</div>}
                </td>
                {row.kind === "scheduled" ? (
                  <td colSpan={6} className="px-3 py-3.5 align-top text-[12px] text-ink-soft">
                    {d.scheduledFor.replace("{t}", wib(row.time))} · {d.colRecipients}: {compact(row.recipientCount)}
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-3.5 text-right align-top tabular-nums text-ink">
                      {compact(m.sent)}
                      {m.queued > 0 && (row.state === "running" || row.state === "paused" || row.state === "stalled") && (
                        <div className="text-[11px] text-amber">{d.queuedNote.replace("{n}", compact(m.queued))}</div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right align-top tabular-nums text-ink">{m.opened}</td>
                    <td className="px-3 py-3.5 text-right align-top tabular-nums text-ink">{m.clicked}</td>
                    <td className="px-3 py-3.5 text-right align-top tabular-nums text-ink">{m.bounced}</td>
                    <td className="px-3 py-3.5 text-right align-top tabular-nums text-ink">{m.spam}</td>
                    <td className="px-3 py-3.5 text-right align-top tabular-nums text-ink">{m.unsub}</td>
                  </>
                )}
                <td className="px-3 py-3.5 align-top">
                  <div className="flex items-center justify-end gap-2">
                    {row.cancellable && <CancelDeliveryButton id={row.id} />}
                    {row.runId && (row.resumable || row.stoppable) && (
                      <DrainControlButtons runId={row.runId} resumable={row.resumable} stoppable={row.stoppable} />
                    )}
                    {row.runId && (
                      <Link
                        href={detailHref(row.runId)}
                        title={d.viewDetail}
                        aria-label={d.viewDetail}
                        className="grid h-8 w-8 place-items-center rounded-sm text-ink-soft transition-colors hover:bg-glass-strong hover:text-ink"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
