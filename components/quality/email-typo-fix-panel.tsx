"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n/format";
import type { Lang } from "@/lib/i18n/config";

interface TypoRow {
  customerId: string;
  email: string;
  emailNormalized: string;
  domain: string;
  suggestion: string;
  confidence: "high" | "medium";
  correctedEmail: string;
  correctedNormalized: string;
  collision: boolean;
}

interface ScanResult {
  rows: TypoRow[];
  totalScanned: number;
  fixable: number;
  collisions: number;
  mediumOnly: number;
}

interface FixSummary {
  attempted: number;
  fixed: number;
  skipped: number;
  collisions: number;
  errors: number;
}

export function EmailTypoFixPanel() {
  const { t, lang } = useI18n();
  const tf = t.typoFix;
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<FixSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setFixResult(null);
    try {
      const res = await fetch("/api/audience/typo-fix", { cache: "no-store" });
      if (!res.ok) {
        setError(tf.scanFailed);
        setScan(null);
        return;
      }
      setScan((await res.json()) as ScanResult);
    } catch {
      setError(tf.scanFailed);
      setScan(null);
    } finally {
      setScanning(false);
    }
  }, [tf.scanFailed]);

  const runFix = useCallback(async () => {
    setFixing(true);
    setError(null);
    try {
      const res = await fetch("/api/audience/typo-fix", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        setError(tf.fixFailed);
        return;
      }
      const body = (await res.json()) as { summary: FixSummary };
      setFixResult(body.summary);
      setScan(null);
    } catch {
      setError(tf.fixFailed);
    } finally {
      setFixing(false);
    }
  }, [tf.fixFailed]);

  const highRows = scan?.rows.filter((r) => r.confidence === "high" && !r.collision) ?? [];
  const collisionRows = scan?.rows.filter((r) => r.collision) ?? [];
  const mediumRows = scan?.rows.filter((r) => r.confidence === "medium" && !r.collision) ?? [];

  // Group by domain for a compact summary
  const domainGroups = new Map<string, { count: number; suggestion: string }>();
  for (const r of highRows) {
    const existing = domainGroups.get(r.domain);
    if (existing) existing.count++;
    else domainGroups.set(r.domain, { count: 1, suggestion: r.suggestion });
  }

  return (
    <section className="glass shadow-glass">
      <div className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Wrench className="h-5 w-5 text-ink" aria-hidden />
          <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">
            {tf.title}
          </h2>
          {scan && (
            <Badge tone={scan.fixable > 0 ? "amber" : "green"}>
              {formatCount(scan.fixable, lang)} {tf.fixable}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={runScan}
            disabled={scanning || fixing}
            className="inline-flex h-10 items-center gap-2 rounded-sm border border-glass-border bg-glass px-4 font-display text-[13px] font-bold uppercase tracking-wide text-ink transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} aria-hidden />
            {tf.scanBtn}
          </button>
          {scan && scan.fixable > 0 && !fixResult && (
            <button
              type="button"
              onClick={runFix}
              disabled={fixing || scanning}
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-glass-border bg-green/10 px-4 font-display text-[13px] font-bold uppercase tracking-wide text-green transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <CheckCircle2 className={`h-4 w-4 ${fixing ? "animate-spin" : ""}`} aria-hidden />
              {tf.fixAllBtn}
            </button>
          )}
        </div>
      </div>

      <div className="px-6 pb-6">
        <p className="mb-4 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
          {tf.description}
        </p>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-sm border border-glass-border p-3">
            <AlertTriangle className="h-4 w-4 text-red" aria-hidden />
            <p className="font-body text-[14px] text-ink">{error}</p>
          </div>
        )}

        {scanning && <p className="font-body text-[14px] text-ink-soft">{tf.scanning}</p>}

        {fixResult && (
          <div className="rounded-sm border border-glass-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-green" aria-hidden />
              <p className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
                {tf.fixDone}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={tf.statFixed} value={fixResult.fixed} tone="green" lang={lang} />
              <Stat label={tf.statSkipped} value={fixResult.skipped} tone="neutral" lang={lang} />
              <Stat label={tf.statCollisions} value={fixResult.collisions} tone="amber" lang={lang} />
              <Stat label={tf.statErrors} value={fixResult.errors} tone="red" lang={lang} />
            </div>
          </div>
        )}

        {scan && !scanning && !fixResult && (
          <>
            {scan.fixable === 0 && scan.mediumOnly === 0 && (
              <div className="flex items-center gap-2 rounded-sm border border-glass-border p-4">
                <CheckCircle2 className="h-5 w-5 text-green" aria-hidden />
                <p className="font-body text-[14px] text-ink">{tf.noTypos}</p>
              </div>
            )}

            {domainGroups.size > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 font-display text-[14px] font-bold uppercase tracking-wide text-ink">
                  {tf.autoFixTitle}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-body text-[13px]">
                    <thead>
                      <tr className="border-b border-glass-border text-ink-faint">
                        <th className="pb-2 pr-4 font-semibold">{tf.colDomain}</th>
                        <th className="pb-2 pr-4 font-semibold">{tf.colCorrection}</th>
                        <th className="pb-2 pr-4 text-right font-semibold">{tf.colCount}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(domainGroups.entries())
                        .sort((a, b) => b[1].count - a[1].count)
                        .map(([domain, { count, suggestion }]) => (
                          <tr key={domain} className="border-b border-glass-border last:border-b-0">
                            <td className="py-2 pr-4 font-mono text-[12px] text-red">@{domain}</td>
                            <td className="py-2 pr-4 font-mono text-[12px] text-green">@{suggestion}</td>
                            <td className="py-2 pr-4 text-right">{formatCount(count, lang)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {collisionRows.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 font-display text-[14px] font-bold uppercase tracking-wide text-ink">
                  {tf.collisionTitle}
                </h3>
                <p className="mb-2 font-body text-[13px] text-ink-soft">{tf.collisionDesc}</p>
                <Badge tone="amber">{formatCount(collisionRows.length, lang)}</Badge>
              </div>
            )}

            {mediumRows.length > 0 && (
              <div>
                <h3 className="mb-2 font-display text-[14px] font-bold uppercase tracking-wide text-ink">
                  {tf.mediumTitle}
                </h3>
                <p className="mb-2 font-body text-[13px] text-ink-soft">{tf.mediumDesc}</p>
                <Badge tone="neutral">{formatCount(mediumRows.length, lang)}</Badge>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  lang,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "amber" | "neutral";
  lang: Lang;
}) {
  return (
    <div className="text-center">
      <p className="font-mono text-[20px] font-bold text-ink">{formatCount(value, lang)}</p>
      <Badge tone={tone}>{label}</Badge>
    </div>
  );
}
