import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n";
import type { DeliveryRow, DeliveryState, DeliveryRecipient } from "@/lib/crm/deliveries";
import { CancelDeliveryButton } from "./cancel-delivery-button";

/**
 * Deliveries tab (Campaigns) — one chronological list of scheduled sends + campaign runs. A run row
 * links to its per-recipient detail (traceable to the run, fix #2); a pending scheduled send can be
 * cancelled straight from its row (an uncancellable scheduled send is a trap). Manual vs automated
 * (workflow) sends are tagged so they read differently when tracing a problem.
 */

const STATE_META: Record<DeliveryState, { key: keyof Dict["campaignsPage"]["deliveries"]; tone: "blue" | "amber" | "green" | "red" | "neutral" }> = {
  upcoming: { key: "stateUpcoming", tone: "blue" },
  running: { key: "stateRunning", tone: "amber" },
  done: { key: "stateDone", tone: "green" },
  stopped: { key: "stateStopped", tone: "red" },
  cancelled: { key: "stateCancelled", tone: "neutral" },
};

// Recipient status/cause reuse the send-log vocabulary (messagesPage), the same labels the old
// history panel used.
const REC_STATUS: Record<string, { key: keyof Dict["messagesPage"]; tone: "green" | "red" | "blue" | "neutral" }> = {
  queued: { key: "stQueued", tone: "blue" },
  sent: { key: "stSent", tone: "green" },
  delivered: { key: "stDelivered", tone: "green" },
  bounced: { key: "stBounced", tone: "red" },
  complained: { key: "stComplained", tone: "red" },
  failed: { key: "stFailed", tone: "red" },
  skipped_suppressed: { key: "stSkipped", tone: "neutral" },
};
const REC_CAUSE: Record<string, keyof Dict["messagesPage"]> = {
  invalid_address: "causeInvalid",
  hard_bounce: "causeHardBounce",
  provider_rejected: "causeProvider",
  daily_limit: "causeDaily",
  unknown: "causeUnknown",
};

/** UTC ISO → "YYYY-MM-DD HH:mm WIB" (WIB = UTC+7). Scheduled sends are entered in WIB, so showing WIB
 *  keeps the displayed time consistent with what the operator typed. */
function wibDisplay(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return utcIso;
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.toISOString().slice(0, 16).replace("T", " ")} WIB`;
}

export function DeliveriesTab({
  deliveries,
  detail,
}: {
  deliveries: DeliveryRow[];
  detail: { runId: string; recipients: DeliveryRecipient[] } | null;
}) {
  const { t } = getServerDict();
  const d = t.campaignsPage.deliveries;
  const m = t.messagesPage;

  // ── DETAIL: per-recipient rows for one run ──
  if (detail) {
    return (
      <div className="flex flex-col gap-5">
        <Link href="/campaigns?tab=kiriman" className="font-body text-[13px] text-red hover:underline">
          {d.backToList}
        </Link>
        <h2 className="font-body text-[15px] font-semibold text-ink">{d.detailTitle}</h2>
        <p className="font-body text-[12px] leading-relaxed text-ink-faint">{d.maskNote}</p>

        {detail.recipients.length === 0 ? (
          <div className="rounded-card border border-dashed border-glass-border px-6 py-12 text-center">
            <p className="font-body text-[13px] text-ink-soft">{d.detailEmpty}</p>
          </div>
        ) : (
          <div className="glass-strong overflow-x-auto rounded-card">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border font-body text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5 font-medium">{d.recipientName}</th>
                  <th className="px-4 py-2.5 font-medium">{d.recipientChannel}</th>
                  <th className="px-4 py-2.5 font-medium">{d.recipientStatus}</th>
                  <th className="px-4 py-2.5 font-medium">{d.recipientCause}</th>
                  <th className="px-4 py-2.5 font-medium">{d.recipientWhen}</th>
                </tr>
              </thead>
              <tbody className="font-body text-[13px] text-ink-soft">
                {detail.recipients.map((r, i) => {
                  const st = REC_STATUS[r.status] ?? REC_STATUS.queued;
                  return (
                    <tr key={i} className="border-b border-glass-border/50 last:border-0">
                      <td className="px-4 py-2.5">
                        {r.name ? r.name : <span className="italic text-ink-faint">{d.recipientUnresolved}</span>}
                      </td>
                      <td className="px-4 py-2.5">{r.channel}</td>
                      <td className="px-4 py-2.5"><Badge tone={st.tone}>{m[st.key]}</Badge></td>
                      <td className="px-4 py-2.5">{r.failureCause ? m[REC_CAUSE[r.failureCause] ?? "causeUnknown"] : "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px]">{wibDisplay(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
                  <span className="font-mono">{wibDisplay(row.time)}</span>
                </div>
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
