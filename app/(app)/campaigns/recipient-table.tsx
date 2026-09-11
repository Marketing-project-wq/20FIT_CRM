"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Dict } from "@/lib/i18n";
import type { DeliveryRecipient } from "@/lib/crm/deliveries";

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
  provider_throttled: "causeThrottled",
  daily_limit: "causeDaily",
  unknown: "causeUnknown",
};

type StatusFilter = "all" | "delivered" | "sent" | "bounced" | "failed" | "complained" | "opened" | "clicked";

const FILTER_OPTIONS: { value: StatusFilter; labelKey: keyof Dict["campaignsPage"]["deliveries"]; alwaysShow?: boolean }[] = [
  { value: "all", labelKey: "filterAll" },
  { value: "delivered", labelKey: "filterDelivered" },
  { value: "sent", labelKey: "filterSent" },
  { value: "bounced", labelKey: "filterBounced" },
  { value: "failed", labelKey: "filterFailed" },
  { value: "complained", labelKey: "filterComplained" },
  { value: "opened", labelKey: "filterOpened", alwaysShow: true },
  { value: "clicked", labelKey: "filterClicked", alwaysShow: true },
];

function wibDisplay(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return utcIso;
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.toISOString().slice(0, 16).replace("T", " ")} WIB`;
}

export function RecipientTable({ recipients }: { recipients: DeliveryRecipient[] }) {
  const { t } = useI18n();
  const d = t.campaignsPage.deliveries;
  const m = t.messagesPage;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: recipients.length, delivered: 0, sent: 0, bounced: 0, failed: 0, complained: 0, opened: 0, clicked: 0 };
    for (const r of recipients) {
      if (r.status in counts) counts[r.status as StatusFilter]++;
      if (r.openedAt) counts.opened++;
      if (r.clickedAt) counts.clicked++;
    }
    return counts;
  }, [recipients]);

  const filtered = useMemo(() => {
    let rows = recipients;
    if (statusFilter === "opened") {
      rows = rows.filter((r) => !!r.openedAt);
    } else if (statusFilter === "clicked") {
      rows = rows.filter((r) => !!r.clickedAt);
    } else if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      rows = rows.filter((r) => {
        if (r.name && r.name.toLowerCase().includes(q)) return true;
        if (r.rawEmail && r.rawEmail.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    return rows;
  }, [recipients, debouncedQuery, statusFilter]);

  const isFiltering = debouncedQuery.trim() || statusFilter !== "all";

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={d.searchPlaceholder}
            className="w-full rounded-md border border-glass-border bg-glass py-2 pl-9 pr-3 font-body text-[13px] text-ink placeholder:text-ink-faint focus:border-red focus:outline-none focus:ring-1 focus:ring-red"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTER_OPTIONS.map((opt) => {
            const count = statusCounts[opt.value];
            if (opt.value !== "all" && !opt.alwaysShow && count === 0) return null;
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`rounded-md px-2.5 py-1 font-body text-[12px] transition-colors ${
                  active
                    ? "bg-red text-white"
                    : "bg-glass text-ink-soft hover:bg-glass-border"
                }`}
              >
                {d[opt.labelKey]} ({count})
              </button>
            );
          })}
        </div>
      </div>
      {isFiltering && (
        <p className="font-body text-[12px] text-ink-faint">
          {d.showingResults.replace("{x}", String(filtered.length)).replace("{y}", String(recipients.length))}
        </p>
      )}
      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-glass-border px-6 py-12 text-center">
          <p className="font-body text-[13px] text-ink-soft">{d.detailEmpty}</p>
        </div>
      ) : (
        <div className="glass-strong overflow-x-auto rounded-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-glass-border font-body text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5 font-medium">{d.recipientName}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientEmail}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientChannel}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientStatus}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientSentAt}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientDeliveredAt}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientOpenedAt}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientClickedAt}</th>
                <th className="px-4 py-2.5 font-medium">{d.recipientCause}</th>
              </tr>
            </thead>
            <tbody className="font-body text-[13px] text-ink-soft">
              {filtered.map((r, i) => {
                const rst = REC_STATUS[r.status] ?? REC_STATUS.queued;
                const displayName = r.name
                  ? r.name
                  : r.maskedEmail
                    ? r.maskedEmail
                    : null;
                return (
                  <tr key={i} className="border-b border-glass-border/50 last:border-0">
                    <td className="px-4 py-2.5">
                      {displayName
                        ? <span className={r.name ? "" : "italic text-ink-faint"}>{displayName}</span>
                        : <span className="italic text-ink-faint">{d.recipientUnresolved}</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink-faint">
                      {r.rawEmail ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">{r.channel}</td>
                    <td className="px-4 py-2.5"><Badge tone={rst.tone}>{m[rst.key]}</Badge></td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{r.sentAt ? wibDisplay(r.sentAt) : "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{r.deliveredAt ? wibDisplay(r.deliveredAt) : "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{r.openedAt ? wibDisplay(r.openedAt) : "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{r.clickedAt ? wibDisplay(r.clickedAt) : "—"}</td>
                    <td className="px-4 py-2.5">{r.failureCause ? m[REC_CAUSE[r.failureCause] ?? "causeUnknown"] : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
