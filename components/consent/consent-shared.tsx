"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";

/**
 * Shared building blocks for the two halves of the old /consent screen after the nav rebuild:
 *   - the UNSUBSCRIBE (suppression) list → a tab under Audience (suppression-panel)
 *   - the CONSENT-BASIS archive (crm_consent) → a read-only panel under Settings (consent-archive-panel)
 * ONE data hook + ONE Pager + ONE EmptyRegister, imported by both — so the split into two screens
 * does NOT become two copies of the same fetch/paging logic (the one-rule-two-implementations trap).
 * Both halves read the SAME /api/consent endpoint (which returns both paged sets); each renders its
 * own half. They live on different routes now, so a page load audits the read exactly once.
 */

export interface ConsentRow {
  id: string;
  customer_id: string | null;
  channel: string;
  purpose: string;
  basis: string;
  status: string;
  source: string | null;
  recorded_at: string | null;
  updated_at: string | null;
}
export interface SuppressionRow {
  id: string;
  identity_kind: string;
  identity_key: string | null;
  reason_code: string;
  reason_detail: string | null;
  status: string;
  created_at: string | null;
}
export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ApiResult {
  consent: Paged<ConsentRow>;
  suppression: Paged<SuppressionRow>;
}

/** Fetch /api/consent for the given page cursors; re-fetches on change; abortable. Returns the
 *  combined result, loading/error, and a `reload` for after a write (record/lift). */
export function useConsentData(cpage: number, spage: number) {
  const { t } = useI18n();
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/consent?cpage=${cpage}&spage=${spage}`, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message || `${t.consent.loadFailed} (HTTP ${res.status}).`);
        setData(null);
        return;
      }
      setData((await res.json()) as ApiResult);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(t.consent.connFailed);
      setData(null);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [cpage, spage, t]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  return { data, loading, error, reload: load };
}

export function EmptyRegister({ what, why }: { what: string; why: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-glass-border px-6 py-12 text-center">
      <Badge tone="neutral">{t.consent.zeroRows}</Badge>
      <p className="max-w-lg font-body text-[13px] leading-relaxed text-ink-soft">
        <span className="font-semibold text-ink">{what}</span> {why}
      </p>
    </div>
  );
}

export function Pager({
  page,
  total,
  pageSize,
  loading,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  pageSize: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { lang, t } = useI18n();
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const hasNext = page * pageSize < total;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-[12px] text-ink-faint">
        {total === 0
          ? t.consent.zeroRows
          : `${t.consent.showingPre}${formatCount(first, lang)}–${formatCount(last, lang)}${t.consent.showingOf}${formatCount(total, lang)}`}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={loading || page <= 1}
          className="min-h-[40px] rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
          {t.consent.prev}
        </button>
        <span className="font-mono text-[12px] text-ink-soft">{t.consent.pageLabel} {formatCount(page, lang)}</span>
        <button type="button" onClick={onNext} disabled={loading || !hasNext}
          className="min-h-[40px] rounded-sm border border-glass-border px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-wide text-ink-soft transition-colors hover:bg-glass disabled:cursor-not-allowed disabled:opacity-40">
          {t.consent.next}
        </button>
      </div>
    </div>
  );
}
