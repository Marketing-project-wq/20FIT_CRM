"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SegmentBuilder } from "@/components/segments/segment-builder";
import { deleteSegmentAction } from "@/app/(app)/segments/actions";
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
}: {
  segments: SavedSegmentMeta[];
  cityFillPct: number;
  cityFilled: number;
  total: number;
  canViewHealth: boolean;
  canBuild: boolean;
}) {
  const { lang, t } = useI18n();
  const s = t.campaignsPage.segmentsTab;
  const [segments, setSegments] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

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
          <p className="font-body text-[13px] text-ink-soft">{s.buildHint}</p>
          <SegmentBuilder
            cityFillPct={cityFillPct}
            cityFilled={cityFilled}
            total={total}
            canViewHealth={canViewHealth}
          />
        </section>
      )}
    </div>
  );
}
