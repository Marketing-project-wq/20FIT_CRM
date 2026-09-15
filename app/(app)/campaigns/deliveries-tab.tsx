"use client";

import { useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import type { Dict } from "@/lib/i18n";
import type { DeliveryRow, DeliveryState, DeliveryDetail } from "@/lib/crm/deliveries";
import { CancelDeliveryButton } from "./cancel-delivery-button";
import { DrainControlButtons } from "./drain-control-buttons";
import { RecipientTable } from "./recipient-table";

const STATE_META: Record<DeliveryState, { key: keyof Dict["campaignsPage"]["deliveries"]; tone: "blue" | "amber" | "green" | "red" | "neutral" }> = {
  upcoming: { key: "stateUpcoming", tone: "blue" },
  overdue: { key: "stateOverdue", tone: "red" },
  running: { key: "stateRunning", tone: "amber" },
  paused: { key: "statePaused", tone: "blue" },
  stalled: { key: "stateStalled", tone: "red" },
  done: { key: "stateDone", tone: "green" },
  partial: { key: "statePartial", tone: "amber" },
  failed: { key: "stateFailed", tone: "red" },
  stopped: { key: "stateStopped", tone: "red" },
  cancelled: { key: "stateCancelled", tone: "neutral" },
};

function wibDisplay(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return utcIso;
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.toISOString().slice(0, 16).replace("T", " ")} WIB`;
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-sm border border-glass-border px-3 py-2">
      <div className="font-body text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 font-body text-[15px] font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 font-body text-[10px] leading-tight text-ink-faint">{sub}</div>}
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

// ── Filter logic ──

const PAGE_SIZE = 10;

type FilterChip = "all" | "done" | "sending" | "failed" | "draft";

const FILTER_STATES: Record<Exclude<FilterChip, "all">, DeliveryState[]> = {
  done: ["done"],
  sending: ["running", "paused", "stalled"],
  failed: ["failed", "partial", "stopped"],
  draft: ["upcoming", "overdue", "cancelled"],
};

const CHIP_KEYS: Record<FilterChip, keyof Dict["campaignsPage"]["deliveries"]> = {
  all: "chipAll",
  done: "chipDone",
  sending: "chipSending",
  failed: "chipFailed",
  draft: "chipDraft",
};

const TEST_RE = /test|uji|gmail\s*test/i;

function isTestEntry(row: DeliveryRow): boolean {
  if (TEST_RE.test(row.label ?? "")) return true;
  if (row.recipientCount <= 3) return true;
  return false;
}

function readShowTest(): boolean {
  try { return localStorage.getItem("crm_campaign_hide_test") === "0"; }
  catch { return false; }
}

// ── Component ──

export function DeliveriesTab({
  deliveries,
  detail,
  detailRequested,
}: {
  deliveries: DeliveryRow[];
  detail: DeliveryDetail | null;
  detailRequested: boolean;
}) {
  const { t } = useI18n();
  const d = t.campaignsPage.deliveries;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [page, setPage] = useState(0);
  const [showTest, setShowTest] = useState(readShowTest);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  function toggleShowTest() {
    const next = !showTest;
    setShowTest(next);
    setPage(0);
    try { localStorage.setItem("crm_campaign_hide_test", next ? "0" : "1"); } catch { /* noop */ }
  }

  function toggleError(key: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    let rows = deliveries;
    if (!showTest) rows = rows.filter((r) => !isTestEntry(r));
    if (filter !== "all") rows = rows.filter((r) => FILTER_STATES[filter].includes(r.state));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => (r.label ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [deliveries, showTest, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // ── DETAIL ──
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

        <section className="flex flex-col gap-2">
          <h3 className="font-body text-[13px] font-semibold text-ink">{d.resultTitle}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label={d.resSent} value={detail.result.sent} sub={d.resSentSub} />
            <Stat label={d.resDelivered} value={detail.result.delivered} sub={d.resDeliveredSub} />
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
          {detail.engagementMeasured && detail.result.opened === 0 && detail.result.clicked === 0 && (
            <p className="font-body text-[12px] leading-relaxed text-ink-faint">
              {d.engagementPending}
            </p>
          )}
        </section>

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

        <section className="flex flex-col gap-2">
          <h3 className="font-body text-[13px] font-semibold text-ink">{d.recipientsTitle}</h3>
          <p className="font-body text-[12px] leading-relaxed text-ink-faint">{d.maskNote}</p>
          <RecipientTable recipients={detail.recipients} />
        </section>
      </div>
    );
  }

  // ── LIST ──
  return (
    <div className="flex flex-col gap-4">
      <p className="font-body text-[13px] leading-relaxed text-ink-soft">{d.subtitle}</p>

      {/* A1: Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder={d.searchCampaign}
          className="h-10 w-full rounded-sm border border-glass-border bg-glass pl-10 pr-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
        />
      </div>

      {/* A2: Filter chips + A5: Test toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "done", "sending", "failed", "draft"] as FilterChip[]).map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => { setFilter(chip); setPage(0); }}
            className={`rounded-full px-3 py-1 font-display text-[12px] font-bold uppercase tracking-wide transition-colors ${
              filter === chip
                ? "bg-red text-white"
                : "border border-glass-border bg-glass text-ink-soft hover:text-ink"
            }`}
          >
            {d[CHIP_KEYS[chip]]}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 font-body text-[12px] text-ink-faint">
          <input type="checkbox" checked={showTest} onChange={toggleShowTest} className="h-3.5 w-3.5 accent-red" />
          {d.showTest}
        </label>
      </div>

      {/* A4: Compact cards */}
      {paged.length === 0 ? (
        <div className="rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
          <p className="font-body text-[13px] text-ink-soft">{d.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {paged.map((row) => {
            const st = STATE_META[row.state];
            const cardKey = `${row.kind}:${row.id}`;
            const errorExpanded = expandedErrors.has(cardKey);
            return (
              <div key={cardKey} className="glass flex flex-col gap-1.5 rounded-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={st.tone}>{d[st.key]}</Badge>
                  <Badge tone={row.source === "auto" ? "blue" : "neutral"}>
                    {row.source === "auto" ? d.sourceAuto : d.sourceManual}
                  </Badge>
                  <span className="font-body text-[13px] font-semibold text-ink">{row.label ?? d.unnamedRun}</span>
                  <span className="ml-auto font-mono text-[11px] text-ink-faint">{wibDisplay(row.time)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-body text-[11px] text-ink-soft">
                  <span>{row.ownerName ?? <span className="italic text-ink-faint">{d.ownerUnresolved}</span>}</span>
                  <span className="font-mono">{row.templateKey}</span>
                  <span>{d.colRecipients}: {row.recipientCount}</span>
                  {row.failedCount > 0 && (
                    <span className="font-semibold text-red">{row.failedCount} {d.statFailed}</span>
                  )}
                </div>
                {row.kind === "run" && row.recipientCount > 0 && (
                  <>
                    <ProgressBar row={row} labels={d} />
                    <CompactStats row={row} labels={d} />
                  </>
                )}
                {row.lastError && (
                  <button
                    type="button"
                    onClick={() => toggleError(cardKey)}
                    className={`text-left font-body text-[12px] text-red ${!errorExpanded ? "truncate" : ""}`}
                  >
                    {d.lastError}: {row.lastError}
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  {row.runId && (
                    <Link
                      href={`/campaigns?tab=kiriman&run=${row.runId}`}
                      className="font-body text-[12px] text-red hover:underline"
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

      {/* A3: Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="rounded-sm border border-glass-border px-3 py-1.5 font-body text-[12px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
          >
            {d.prevPage}
          </button>
          <span className="font-body text-[13px] text-ink-soft">
            {safePage + 1} {d.pageOf} {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(safePage + 1)}
            className="rounded-sm border border-glass-border px-3 py-1.5 font-body text-[12px] text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
          >
            {d.nextPage}
          </button>
        </div>
      )}
    </div>
  );
}
