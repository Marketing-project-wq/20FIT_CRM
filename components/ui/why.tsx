"use client";

import { useI18n } from "@/components/i18n/lang-provider";

/**
 * "Why?" disclosure (Sprint 5A, K-28). A one-line warning shows at the point of use; the longer
 * explanation lives here, collapsed by default — the content is NOT cut, just no longer force-read.
 * Native <details>/<summary>, so it needs no JS state and stays keyboard-accessible.
 */
export function Why({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <details className="group mt-1 text-[12px] leading-relaxed text-ink-soft">
      <summary className="cursor-pointer select-none font-display text-[11px] font-bold uppercase tracking-wide text-ink-faint underline underline-offset-2 hover:text-ink-soft marker:content-['']">
        {t.common.why}
      </summary>
      <div className="mt-1.5 max-w-3xl font-body">{children}</div>
    </details>
  );
}
