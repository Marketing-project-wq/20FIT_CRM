"use client";

import { useState, useMemo, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronDown, Trash2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { isInternalTestTemplateKey } from "@/lib/crm/send-test-constants";
import type { Dict } from "@/lib/i18n";
import type { DeliveryRow, DeliveryState, DeliveryDetail } from "@/lib/crm/deliveries";
import type { SavedDraft } from "./draft-actions";
import { deleteDraftAction } from "./draft-actions";
import { CancelDeliveryButton } from "./cancel-delivery-button";
import { DrainControlButtons } from "./drain-control-buttons";
import { RetryFailedButton } from "./retry-failed-button";
import { RecipientTable } from "./recipient-table";

type BadgeTone = "blue" | "amber" | "green" | "red" | "neutral";
type DeliveryLabels = Dict["campaignsPage"]["deliveries"];

const STATE_META: Record<DeliveryState, { key: keyof DeliveryLabels; tone: BadgeTone }> = {
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

type DisplayStatus = { key: keyof DeliveryLabels; tone: BadgeTone; note?: string };

function getDisplayStatus(row: DeliveryRow, labels: DeliveryLabels): DisplayStatus {
  const base = STATE_META[row.state];
  if (row.state !== "partial" || row.recipientCount === 0) return base;
  const failPct = (row.failedCount / row.recipientCount) * 100;
  if (failPct < 5) {
    return { key: "stateDone", tone: "green", note: labels.partialNote.replace("{x}", String(row.failedCount)) };
  }
  if (failPct <= 20) {
    return { key: "stateDoneWithNote", tone: "amber", note: labels.partialNote.replace("{x}", String(row.failedCount)) };
  }
  return { key: "statePartial", tone: "red" };
}

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

function ProgressBar({ row, labels }: { row: DeliveryRow; labels: DeliveryLabels }) {
  const total = row.recipientCount;
  const delivered = row.deliveredCount;
  const sent = row.sentCount;
  const good = sent + delivered;
  const bad = row.failedCount + row.bouncedCount;
  const pctDelivered = (delivered / total) * 100;
  const pctSent = (sent / total) * 100;
  const pctBad = (bad / total) * 100;
  const pctRemaining = 100 - pctDelivered - pctSent - pctBad;
  const inProgress = row.state === "running" || row.state === "paused" || row.state === "stalled";
  const text = labels.progressSent.replace("{x}", String(good)).replace("{y}", String(total));

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-faint/20">
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
      <span className="shrink-0 font-body text-[11px] text-ink-faint">{text}</span>
    </div>
  );
}

function CompactStats({ row, labels }: { row: DeliveryRow; labels: DeliveryLabels }) {
  const delivered = row.deliveredCount;
  const sent = row.sentCount + delivered;
  const bounced = row.bouncedCount;
  const failed = row.failedCount;
  const opened = row.openedCount;
  const clicked = row.clickedCount;
  const openRate = delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : null;
  const clickRate = delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : null;

  const parts: ReactNode[] = [];
  if (delivered > 0) parts.push(<span key="del">{labels.statDelivered} {delivered}</span>);
  else if (sent > 0) parts.push(<span key="sent">{labels.statSent} {sent}</span>);
  if (opened > 0) parts.push(<span key="open">{labels.statOpened} {opened}{openRate != null && ` (${openRate}%)`}</span>);
  if (clicked > 0) parts.push(<span key="click">{labels.statClicked} {clicked}{clickRate != null && ` (${clickRate}%)`}</span>);
  if (bounced > 0) parts.push(<span key="bounce" className="text-red">{labels.statBounced} {bounced}</span>);
  if (failed > 0) parts.push(<span key="fail" className="text-red">{labels.statFailed} {failed}</span>);

  if (parts.length === 0) return null;
  return <div className="flex flex-wrap gap-x-4 gap-y-1 font-body text-[11px] text-ink-faint">{parts}</div>;
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

const CHIP_KEYS: Record<FilterChip, keyof DeliveryLabels> = {
  all: "chipAll",
  done: "chipDone",
  sending: "chipSending",
  failed: "chipFailed",
  draft: "chipDraft",
};

const TEST_RE = /test|uji|gmail\s*test/i;
const DOORPRIZE_RE = /doorprize/i;

function isTestEntry(row: DeliveryRow): boolean {
  if (isInternalTestTemplateKey(row.templateKey)) return true;
  if (TEST_RE.test(row.label ?? "")) return true;
  if (row.recipientCount <= 5 && !DOORPRIZE_RE.test(row.label ?? "")) return true;
  return false;
}

function readShowTest(): boolean {
  try { return localStorage.getItem("crm_show_test_campaigns") === "1"; }
  catch { return false; }
}

// ── Component ──

function DraftList({
  drafts,
  cd,
  router,
}: {
  drafts: SavedDraft[];
  cd: Dict["campaignsPage"]["drafts"];
  router: ReturnType<typeof useRouter>;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await deleteDraftAction(id);
      if (res.ok) {
        startTransition(() => router.refresh());
      }
    } finally {
      setDeleting(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {drafts.map((draft) => (
        <div
          key={draft.id}
          className="glass flex flex-col gap-1.5 rounded-card border border-dashed border-glass-border p-3"
        >
          <div className="flex items-center gap-2">
            <Badge tone="amber">{cd.badge}</Badge>
            <span className="min-w-0 flex-1 truncate font-body text-[13px] font-semibold text-ink">
              {draft.label || cd.noName}
            </span>
            <span className="shrink-0 font-body text-[11px] text-ink-faint">
              {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-body text-[11px] text-ink-faint">
            <span>{draft.segmentName ?? cd.noSegment}</span>
            <span>{draft.templateKey ?? cd.noTemplate}</span>
            {draft.whenMode === "schedule" && draft.dateWib && (
              <span>{draft.dateWib} {draft.timeWib ?? ""}</span>
            )}
            {draft.createdBy && <span>{draft.createdBy}</span>}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <a
              href={`/campaigns?tab=kirim&draft=${draft.id}`}
              className="flex items-center gap-1 rounded-sm border border-red px-2.5 py-1 font-body text-[12px] font-semibold text-red transition-colors hover:bg-red hover:text-white"
            >
              <Play className="h-3 w-3" />
              {cd.resumeBtn}
            </a>
            {confirmId === draft.id ? (
              <div className="flex items-center gap-1.5">
                <span className="font-body text-[11px] text-ink-soft">{cd.deleteConfirm}</span>
                <button
                  type="button"
                  disabled={deleting === draft.id}
                  onClick={() => handleDelete(draft.id)}
                  className="rounded-sm bg-red px-2 py-0.5 font-body text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {cd.deleteBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmId(null)}
                  className="font-body text-[11px] text-ink-faint hover:text-ink"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(draft.id)}
                className="flex items-center gap-1 rounded-sm border border-glass-border px-2.5 py-1 font-body text-[12px] text-ink-soft transition-colors hover:border-red hover:text-red"
              >
                <Trash2 className="h-3 w-3" />
                {cd.deleteBtn}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DraftSection({
  drafts,
  cd,
  router,
}: {
  drafts: SavedDraft[];
  cd: Dict["campaignsPage"]["drafts"];
  router: ReturnType<typeof useRouter>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-card border border-dashed border-glass-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          aria-hidden
        />
        <span className="font-display text-[13px] font-bold uppercase tracking-wide text-ink-faint">
          {cd.title}
        </span>
        <span className="rounded-full bg-ink-faint/20 px-2 py-0.5 font-body text-[11px] font-semibold text-ink-faint">
          {drafts.length}
        </span>
      </button>
      {open && (
        <div className="border-t border-glass-border px-3 pb-3 pt-2">
          <DraftList drafts={drafts} cd={cd} router={router} />
        </div>
      )}
    </div>
  );
}

export function DeliveriesTab({
  deliveries,
  detail,
  detailRequested,
  drafts = [],
}: {
  deliveries: DeliveryRow[];
  detail: DeliveryDetail | null;
  detailRequested: boolean;
  drafts?: SavedDraft[];
}) {
  const { t } = useI18n();
  const d = t.campaignsPage.deliveries;
  const cd = t.campaignsPage.drafts;
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterChip>("all");
  const [page, setPage] = useState(0);
  const [showTest, setShowTest] = useState(readShowTest);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  function toggleShowTest() {
    const next = !showTest;
    setShowTest(next);
    setPage(0);
    try { localStorage.setItem("crm_show_test_campaigns", next ? "1" : "0"); } catch { /* noop */ }
  }

  function toggleCard(key: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
          {(() => {
            const r = detail.result;
            const pct = (n: number, base: number) => base > 0 ? `${((n / base) * 100).toFixed(1)}%` : undefined;
            return (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                <Stat label={d.resSent} value={r.sent} sub={d.resSentSub} />
                <Stat label={d.resDelivered} value={r.delivered} sub={pct(r.delivered, r.sent) ?? d.resDeliveredSub} />
                <Stat label={d.resOpened} value={detail.engagementMeasured ? r.opened : "—"} sub={detail.engagementMeasured ? pct(r.opened, r.delivered) : undefined} />
                <Stat label={d.resClicked} value={detail.engagementMeasured ? r.clicked : "—"} sub={detail.engagementMeasured ? pct(r.clicked, r.delivered) : undefined} />
                <Stat label={d.resBounced} value={r.bounced} sub={pct(r.bounced, r.sent)} />
                <Stat label={d.resComplained} value={r.complained} sub={pct(r.complained, r.sent)} />
                <Stat label={d.resUnsub} value={r.unsubscribed} sub={pct(r.unsubscribed, r.sent)} />
                <Stat label={d.resFailed} value={r.failed} sub={pct(r.failed, r.sent)} />
                {r.queued > 0 && <Stat label={d.resQueued} value={r.queued} sub={pct(r.queued, r.sent)} />}
              </div>
            );
          })()}
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
          {(detail.result.failed > 0 || detail.result.queued > 0) && ["sent", "partial", "stopped", "failed"].includes(detail.status) && (
            <RetryFailedButton runId={detail.runId} failedCount={detail.result.failed + detail.result.queued} />
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

      {/* Search */}
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

      {/* Filter chips + Test toggle */}
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

      {/* ── Saved drafts (collapsible, hidden by default) ── */}
      {drafts.length > 0 && (
        <DraftSection drafts={drafts} cd={cd} router={router} />
      )}

      {/* Compact cards */}
      {paged.length === 0 ? (
        <div className="rounded-card border border-dashed border-glass-border px-6 py-16 text-center">
          <p className="font-body text-[13px] text-ink-soft">{d.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {paged.map((row) => {
            const ds = getDisplayStatus(row, d);
            const cardKey = `${row.kind}:${row.id}`;
            const expanded = expandedCards.has(cardKey);
            const errorExpanded = expandedErrors.has(cardKey);
            return (
              <div key={cardKey} className="glass flex flex-col gap-1.5 rounded-card p-3">
                <button
                  type="button"
                  onClick={() => toggleCard(cardKey)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <Badge tone={ds.tone}>{d[ds.key]}</Badge>
                  {ds.note && <span className="font-body text-[11px] text-ink-faint">{ds.note}</span>}
                  <span className="min-w-0 flex-1 truncate font-body text-[13px] font-semibold text-ink">
                    {row.label ?? d.unnamedRun}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">{wibDisplay(row.time)}</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
                </button>

                {row.kind === "run" && row.recipientCount > 0 && (
                  <>
                    <ProgressBar row={row} labels={d} />
                    <CompactStats row={row} labels={d} />
                  </>
                )}

                {expanded && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-glass-border pt-2 font-body text-[11px] text-ink-soft">
                    <span><span className="text-ink-faint">{d.detailOwner}:</span> {row.ownerName ?? <span className="italic text-ink-faint">{d.ownerUnresolved}</span>}</span>
                    <span><span className="text-ink-faint">{d.detailTemplate}:</span> <span className="font-mono">{row.templateKey}</span></span>
                    <span><span className="text-ink-faint">{d.colRecipients}:</span> {row.recipientCount}</span>
                    {row.source === "auto" && <Badge tone="blue">{d.sourceAuto}</Badge>}
                  </div>
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

      {/* Pagination */}
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
