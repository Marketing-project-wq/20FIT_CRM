import type { Metadata } from "next";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerDict } from "@/lib/i18n/server";
import { Badge } from "@/components/ui/badge";
import type { Dict } from "@/lib/i18n";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

/**
 * Messages — read-only log of every send (crm_message_log). Gate: send.* != deny (same as nav).
 *
 * HONESTY RULES this screen keeps:
 *   - `skipped_suppressed` and `failed`/`bounced` are shown as-is, with their differentiated cause.
 *     A screen that showed only successes would make a half-failed campaign look whole.
 *   - The destination address is NEVER shown: crm_message_log stores it only as a keyed hash, and
 *     even that column is not selected here. "To whom" is the customer_id — the log is not a
 *     back-door around contact masking.
 *   - Empty is a first-class state (the table is empty until the first campaign runs; real sending
 *     is still blocked on token rotation).
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

export default async function MessagesPage() {
  const role = await getCurrentUserRole();
  const { t } = getServerDict();
  const m = t.messagesPage;

  if (grantFor(role, "send.at_or_below_threshold") === "deny") {
    return (
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.messages}</h1>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-glass-border px-6 py-20 text-center">
          <Badge tone="red">{t.access.deniedBadge}</Badge>
          <p className="max-w-md font-body text-[14px] leading-relaxed text-ink-soft">{m.deniedRole}</p>
        </div>
      </div>
    );
  }

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">{t.nav.messages}</h1>
        <p className="mt-2 font-body text-[14px] leading-relaxed text-ink-soft">{m.subtitle}</p>
      </div>

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
        <div className="glass-strong overflow-x-auto rounded-card">
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
                    <td className="px-4 py-2.5 font-mono text-[12px]">{r.created_at.slice(0, 16).replace("T", " ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-body text-[12px] leading-relaxed text-ink-faint">{m.identityNote}</p>
    </div>
  );
}
