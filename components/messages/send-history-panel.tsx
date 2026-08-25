import { createAdminClient } from "@/lib/supabase/admin";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import type { Dict } from "@/lib/i18n";

/**
 * Send history — read-only log of every send (crm_message_log), now a tab under Templates (nav
 * rebuild). Same honesty rules as the old /messages screen, moved here intact:
 *   - skipped_suppressed and failed/bounced are shown as-is, with their differentiated cause (a
 *     success-only view would make a half-failed campaign look whole);
 *   - the destination is NEVER shown (stored only as a keyed hash, not even selected here) — "to whom"
 *     is the customer_id; this is not a back-door around contact masking;
 *   - empty is a first-class state.
 * The caller (Templates page) owns the send.* gate and the screen title. Responsive (BAGIAN D): table
 * on wide screens, per-row cards on narrow ones.
 */

type Status = "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed" | "skipped_suppressed";
type Cause = "invalid_address" | "hard_bounce" | "provider_rejected" | "daily_limit" | "unknown";

const STATUS_META: Record<Status, { key: keyof Dict["messagesPage"]; tone: "green" | "red" | "blue" | "neutral" }> = {
  queued: { key: "stQueued", tone: "blue" },
  sent: { key: "stSent", tone: "green" },
  delivered: { key: "stDelivered", tone: "green" },
  bounced: { key: "stBounced", tone: "red" },
  complained: { key: "stComplained", tone: "red" },
  failed: { key: "stFailed", tone: "red" },
  skipped_suppressed: { key: "stSkipped", tone: "neutral" },
};

const CAUSE_KEY: Record<Cause, keyof Dict["messagesPage"]> = {
  invalid_address: "causeInvalid",
  hard_bounce: "causeHardBounce",
  provider_rejected: "causeProvider",
  daily_limit: "causeDaily",
  unknown: "causeUnknown",
};

const ALL_STATUSES: Status[] = ["sent", "delivered", "skipped_suppressed", "bounced", "failed", "complained", "queued"];

interface LogRow {
  customer_id: string;
  channel: string;
  status: Status;
  failure_cause: Cause | null;
  created_at: string;
}

export async function SendHistoryPanel() {
  const { t } = getServerDict();
  const m = t.messagesPage;

  const admin = createAdminClient();
  let rows: LogRow[] = [];
  const counts: Record<Status, number> = {
    queued: 0, sent: 0, delivered: 0, bounced: 0, complained: 0, failed: 0, skipped_suppressed: 0,
  };
  try {
    const [recent, ...perStatus] = await Promise.all([
      admin
        .from("crm_message_log")
        .select("customer_id, channel, status, failure_cause, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      ...ALL_STATUSES.map((s) =>
        admin.from("crm_message_log").select("id", { count: "exact", head: true }).eq("status", s),
      ),
    ]);
    rows = (recent.data ?? []) as unknown as LogRow[];
    ALL_STATUSES.forEach((s, i) => {
      counts[s] = perStatus[i]?.count ?? 0;
    });
  } catch {
    rows = [];
  }

  const lastSend = rows[0]?.created_at ? rows[0].created_at.slice(0, 16).replace("T", " ") : m.never;
  const nonZero = ALL_STATUSES.filter((s) => counts[s] > 0);
  const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

  return (
    <div className="flex flex-col gap-6">
      <p className="font-body text-[13px] leading-relaxed text-ink-soft">{m.subtitle}</p>
      <p className="font-body text-[12px] text-ink-faint">
        {m.lastSend}: <span className="font-mono text-ink-soft">{lastSend}</span>
      </p>

      {nonZero.length > 0 && (
        <div className="glass-strong rounded-card p-5">
          <h2 className="font-body text-[13px] font-semibold text-ink">{m.breakdownTitle}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {nonZero.map((s) => (
              <Badge key={s} tone={STATUS_META[s].tone}>
                {m[STATUS_META[s].key]}: {counts[s]}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
          <p className="font-body text-[14px] font-semibold text-ink">{m.emptyTitle}</p>
          <p className="max-w-md font-body text-[13px] leading-relaxed text-ink-soft">{m.emptyBody}</p>
        </div>
      ) : (
        <>
          {/* Wide screens: table. */}
          <div className="glass-strong hidden overflow-x-auto rounded-card md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-glass-border font-body text-[11px] uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5 font-medium">{m.colWho}</th>
                  <th className="px-4 py-2.5 font-medium">{m.colChannel}</th>
                  <th className="px-4 py-2.5 font-medium">{m.colStatus}</th>
                  <th className="px-4 py-2.5 font-medium">{m.colCause}</th>
                  <th className="px-4 py-2.5 font-medium">{m.colWhen}</th>
                </tr>
              </thead>
              <tbody className="font-body text-[13px] text-ink-soft">
                {rows.map((r, i) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.queued;
                  return (
                    <tr key={i} className="border-b border-glass-border/50 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-[12px] text-ink-faint">{r.customer_id.slice(0, 8)}…</td>
                      <td className="px-4 py-2.5">{r.channel}</td>
                      <td className="px-4 py-2.5"><Badge tone={meta.tone}>{m[meta.key]}</Badge></td>
                      <td className="px-4 py-2.5">{r.failure_cause ? m[CAUSE_KEY[r.failure_cause]] : "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px]">{when(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Narrow screens: one card per row. */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((r, i) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.queued;
              return (
                <div key={i} className="rounded-card border border-glass-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-ink-faint">{r.customer_id.slice(0, 8)}…</span>
                    <Badge tone={meta.tone}>{m[meta.key]}</Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-body text-[12px] text-ink-soft">
                    <span>{r.channel}</span>
                    {r.failure_cause && <span>{m[CAUSE_KEY[r.failure_cause]]}</span>}
                    <span className="font-mono">{when(r.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="font-body text-[12px] leading-relaxed text-ink-faint">{m.identityNote}</p>
    </div>
  );
}
