"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import { EmailListSegment } from "@/components/segments/email-list-segment";
import { deleteSegmentAction } from "@/app/(app)/segments/actions";
import { CAMPAIGN_COMPOSE_TAB, composeUrl, composeUrlWithNewSegment } from "@/lib/crm/campaign-nav";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatDateTime } from "@/lib/i18n";
import type { SavedSegmentMeta } from "@/lib/crm/segment-store";

/**
 * Tab Segmen di halaman Campaigns. SegmentBuilder untuk membangun dan menyimpan segmen baru,
 * plus daftar segmen tersimpan yang dapat dihapus (soft-delete: is_active = false).
 */
export function SegmentsTab({
  segments: initial,
  cityFillPct,
  cityFilled,
  total,
  canViewHealth,
  canBuild,
  returnTo,
}: {
  segments: SavedSegmentMeta[];
  cityFillPct: number;
  cityFilled: number;
  total: number;
  canViewHealth: boolean;
  canBuild: boolean;
  returnTo?: string | null;
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const s = t.campaignsPage.segmentsTab;
  const el = t.campaignsPage.emailListSegment;
  const [segments, setSegments] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"filter" | "manual">("filter");

  async function onDelete(id: string, name: string) {
    if (!confirm(`${s.deleteConfirm} "${name}"?`)) return;
    setDeleting(id);
    setDeleteMsg(null);
    try {
      const res = await deleteSegmentAction(id);
      if (res.ok) {
        setSegments((prev) => prev.filter((seg) => seg.id !== id));
        setDeleteMsg(s.deleteOk);
      } else {
        setDeleteMsg(s.deleteFailed);
      }
    } catch {
      setDeleteMsg(s.deleteFailed);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Arrived here from the composer ("Buat segmen baru"): offer a way back without building one.
          The draft is still in sessionStorage, so the composer restores it on return. */}
      {returnTo === CAMPAIGN_COMPOSE_TAB && (
        <button
          type="button"
          onClick={() => router.push(composeUrl())}
          className="inline-flex items-center gap-1.5 self-start font-body text-[13px] text-red hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.campaignsPage.segmentsTab.backToCampaign}
        </button>
      )}

      {/* ── LIST: segmen tersimpan ── */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{s.savedTitle}</h2>
        {deleteMsg && (
          <p className="font-body text-[13px] text-ink-soft">{deleteMsg}</p>
        )}
        {segments.length === 0 ? (
          <p className="font-body text-[13px] text-ink-soft">{s.savedEmpty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {segments.map((seg) => (
              <div key={seg.id} className="flex items-center gap-3 rounded-card border border-glass-border bg-glass px-4 py-3">
                <div className="min-w-0 flex-1">
                  <span className="font-body text-[14px] font-semibold text-ink">{seg.name}</span>
                  {seg.requiresClinical && <Badge tone="amber" className="ml-2">⚕ Klinis</Badge>}
                  <span className="ml-3 font-mono text-[11px] text-ink-faint">
                    {formatDateTime(seg.createdAt, lang)}
                    {seg.createdBy && ` · ${seg.createdBy}`}
                  </span>
                </div>
                {canBuild && (
                  <button
                    type="button"
                    onClick={() => onDelete(seg.id, seg.name)}
                    disabled={deleting === seg.id}
                    aria-label={`${s.deleteLabel} ${seg.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-ink-faint transition-colors hover:text-red disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── BUILDER: susun segmen baru ── */}
      {canBuild && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">{s.buildTitle}</h2>

          {/* Toggle: filter otomatis vs daftar email manual */}
          <div className="flex gap-1 border-b border-glass-border">
            <button
              type="button"
              onClick={() => setMode("filter")}
              className={`px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wide transition-colors ${mode === "filter" ? "border-b-2 border-red text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {el.tabFilter}
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`px-4 py-2 font-display text-[12px] font-bold uppercase tracking-wide transition-colors ${mode === "manual" ? "border-b-2 border-red text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {el.tabManual}
            </button>
          </div>

          {mode === "filter" ? (
            <>
              <p className="font-body text-[13px] text-ink-soft">{s.buildHint}</p>
              <SegmentBuilder
                cityFillPct={cityFillPct}
                cityFilled={cityFilled}
                total={total}
                canViewHealth={canViewHealth}
                returnTo={returnTo}
              />
            </>
          ) : (
            <div className="glass rounded-card p-5">
              <EmailListSegment
                onSaved={(segmentId) => {
                  // Bounce back to the composer with the new segment when we came from it.
                  if (returnTo === CAMPAIGN_COMPOSE_TAB && segmentId) router.push(composeUrlWithNewSegment(segmentId));
                  else window.location.reload();
                }}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
