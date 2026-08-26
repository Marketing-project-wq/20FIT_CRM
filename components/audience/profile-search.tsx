"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, UserSearch, Lock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEARCH_KINDS, detectSearchKind, type SearchKind } from "@/lib/crm/search";
import { formatDisplayName } from "@/lib/crm/display-name";
import { useI18n } from "@/components/i18n/lang-provider";
import { formatCount } from "@/lib/i18n";

interface Hit {
  customer_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
}

type Result =
  | { status: "idle" }
  | { status: "empty" }
  | { status: "too_many"; cap: number }
  | { status: "ok"; rows: Hit[]; masked: boolean };

/**
 * Find ONE person, to reach the suppression write path. Distinct from the filters below
 * (which BROWSE a list). Phone/email are matched EXACTLY and normalized server-side; a
 * lone phone/email hit jumps straight to the profile. Writes `search.performed`, not
 * `list.viewed` — the header text says which the user is doing.
 */
export function ProfileSearch() {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [q, setQ] = useState("");
  // One box: the kind is DETECTED from the input's shape, shown before searching. `override` lets
  // the user force a kind for edge cases (a numeric name, an odd address) — null means auto.
  const [override, setOverride] = useState<SearchKind | null>(null);
  const [result, setResult] = useState<Result>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detected = detectSearchKind(q);
  const kind: SearchKind = override ?? detected;

  const KIND_LABEL: Record<SearchKind, string> = { name: t.audience.kindName, phone: t.audience.kindPhone, email: t.audience.kindEmail };
  const PLACEHOLDER: Record<SearchKind, string> = { name: t.audience.phName, phone: t.audience.phPhone, email: t.audience.phEmail };

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (q.trim() === "") {
      setError(t.audience.searchFillKeyword);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? `${t.audience.searchFailed} (HTTP ${res.status}).`);
        setResult({ status: "idle" });
        return;
      }
      if (data.status === "empty") {
        setResult({ status: "empty" });
      } else if (data.status === "too_many") {
        setResult({ status: "too_many", cap: data.cap });
      } else {
        const rows = data.rows as Hit[];
        // Exact identifier match with a single person → go straight there, no middle step.
        if ((kind === "phone" || kind === "email") && rows.length === 1) {
          router.push(`/audience/${rows[0].customer_id}`);
          return;
        }
        setResult({ status: "ok", rows, masked: data.masked });
      }
    } catch {
      setError(t.audience.connFailed);
      setResult({ status: "idle" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <UserSearch className="h-4 w-4 text-ink-soft" aria-hidden />
        <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-ink">
          {t.audience.searchTitle}
        </h2>
      </div>
      <p className="mt-1 font-body text-[13px] leading-relaxed text-ink-soft">
        {t.audience.warn.searchIntroA}
        <span className="font-mono text-[12px]">search.performed</span>
        {t.audience.warn.searchIntroB}
        <span className="font-mono text-[12px]">list.viewed</span>
        {t.audience.warn.searchIntroC}
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOverride(null); // typing re-runs auto-detection; a manual override is cleared
              setResult({ status: "idle" });
              setError(null);
            }}
            placeholder={PLACEHOLDER[kind]}
            inputMode={kind === "phone" ? "tel" : kind === "email" ? "email" : "text"}
            className="h-10 w-full rounded-sm border border-surface-border bg-surface pl-9 pr-3 font-body text-[14px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-red"
          />
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? t.audience.searching : t.audience.searchBtn}
        </Button>
      </form>

      {/* Detected kind, shown BEFORE searching so a wrong guess never silently reads as
          "person not found". Overridable for edge cases. */}
      {q.trim() !== "" && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-body text-[12px] text-ink-soft">
            {t.audience.detectedAsPre}
            <span className="font-display font-bold uppercase tracking-wide text-ink">{KIND_LABEL[kind]}</span>
            <span className="text-ink-faint">{override ? t.audience.detectManualSuffix : t.audience.detectAutoSuffix}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-body text-[11px] text-ink-faint">{t.audience.detectOverrideHint}</span>
            {SEARCH_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setOverride(k);
                  setResult({ status: "idle" });
                  setError(null);
                }}
                className={`rounded-sm px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wide transition-colors ${
                  kind === k ? "tint-red text-ink" : "text-ink-soft hover:bg-surface-2"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
            {override && (
              <button
                type="button"
                onClick={() => { setOverride(null); setResult({ status: "idle" }); setError(null); }}
                className="rounded-sm px-2 py-0.5 font-body text-[11px] text-ink-faint underline hover:text-ink"
              >
                {t.audience.detectBackToAuto}
              </button>
            )}
          </span>
        </div>
      )}

      {error && <p className="mt-3 font-body text-[13px] text-red">{error}</p>}

      {result.status === "empty" && (
        <p className="mt-3 font-body text-[13px] text-ink-soft">
          {kind === "name" ? t.audience.notFoundName : t.audience.notFoundId}
        </p>
      )}

      {result.status === "too_many" && (
        <p className="mt-3 font-body text-[13px] text-ink-soft">
          {t.audience.warn.tooManyA}{result.cap}{t.audience.warn.tooManyB}
        </p>
      )}

      {result.status === "ok" && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-ink-faint">{formatCount(result.rows.length, lang)}{t.audience.resultsSuffix}</span>
            {result.masked && (
              <Badge tone="amber" className="gap-1.5"><Lock className="h-3 w-3" /> {t.audience.maskedShort}</Badge>
            )}
          </div>
          <ul className="divide-y divide-surface-border rounded-sm border border-surface-border">
            {result.rows.map((r) => (
              <li key={r.customer_id}>
                <Link
                  href={`/audience/${r.customer_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-ink">{formatDisplayName(r.full_name) ?? t.audience.noName}</span>
                    <span className="font-mono text-[12px] text-ink-soft">
                      {[r.phone, r.email, r.city].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-display text-[12px] font-bold uppercase tracking-wide text-red">
                    {t.audience.openProfile} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
