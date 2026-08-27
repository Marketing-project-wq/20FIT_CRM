"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDictionary, parseLang } from "@/lib/i18n";

/**
 * PUBLIC self-service unsubscribe page (contacting-half TUGAS 3). Reached from a link in an email,
 * so there is NO session and NO LangProvider — it reads the language from ?lang (default id) and
 * pulls strings straight from the dictionary. The SIGNED token in ?token is the authorization; this
 * page only relays it to /api/unsubscribe (GET to preview the masked identity, POST to confirm).
 * A POST-to-confirm (not auto-on-load) means an email scanner prefetching the link cannot
 * unsubscribe anyone.
 */

type Phase = "checking" | "invalid" | "preview" | "unavailable" | "prompt" | "working" | "done" | "already" | "failed";

function UnsubscribeFlow() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const t = getDictionary(parseLang(params.get("lang") ?? undefined)).unsubscribe;

  const [phase, setPhase] = useState<Phase>("checking");
  const [kind, setKind] = useState<"phone" | "email" | null>(null);
  const [identity, setIdentity] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) setPhase("invalid");
        return;
      }
      try {
        const res = await fetch(`/api/unsubscribe?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 503) return setPhase("unavailable");
        if (!res.ok) return setPhase("invalid");
        const body = (await res.json()) as { valid?: boolean; kind?: "phone" | "email"; identity?: string; error?: string };
        if (body.error === "preview") return setPhase("preview");
        if (!body.valid) return setPhase("invalid");
        setKind(body.kind ?? null);
        setIdentity(body.identity ?? "");
        setPhase("prompt");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = useCallback(async () => {
    setPhase("working");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      if (!res.ok) return setPhase("failed");
      const body = (await res.json()) as { ok?: boolean; action?: string };
      if (!body.ok) return setPhase("failed");
      setPhase(body.action === "noop" ? "already" : "done");
    } catch {
      setPhase("failed");
    }
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="glass shadow-glass rounded-card p-8">
        <h1 className="font-display text-[24px] font-black uppercase leading-none text-ink">{t.title}</h1>

        {phase === "checking" && <p className="mt-4 font-body text-[14px] text-ink-soft">{t.checking}</p>}

        {phase === "invalid" && (
          <div className="mt-4 space-y-2">
            <p className="font-body text-[15px] font-semibold text-ink">{t.invalidTitle}</p>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">{t.invalidBody}</p>
          </div>
        )}

        {phase === "unavailable" && <p className="mt-4 font-body text-[14px] text-ink-soft">{t.unavailableBody}</p>}

        {phase === "preview" && (
          <div className="mt-4 space-y-2">
            <p className="font-body text-[15px] font-semibold text-ink">{t.previewTitle}</p>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">{t.previewBody}</p>
          </div>
        )}

        {(phase === "prompt" || phase === "working") && (
          <div className="mt-4 space-y-4">
            <p className="font-body text-[14px] leading-relaxed text-ink-soft">
              {kind === "phone" ? t.promptPhone : t.promptEmail}
            </p>
            <p className="font-mono text-[14px] font-semibold text-ink">{identity}</p>
            <button
              type="button"
              onClick={confirm}
              disabled={phase === "working"}
              className="inline-flex h-11 items-center justify-center rounded-sm bg-red px-5 font-display text-[13px] font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-red disabled:opacity-50"
            >
              {phase === "working" ? t.working : t.confirmButton}
            </button>
          </div>
        )}

        {(phase === "done" || phase === "already") && (
          <div className="mt-4 space-y-3">
            <p className="font-body text-[15px] font-semibold text-ink">{t.doneTitle}</p>
            <p className="font-body text-[13px] leading-relaxed text-ink-soft">
              {phase === "already" ? t.alreadyBody : t.doneBody}
            </p>
            <p className="font-body text-[12px] leading-relaxed text-ink-faint">{t.resubscribe}</p>
          </div>
        )}

        {phase === "failed" && <p className="mt-4 font-body text-[14px] text-red">{t.failed}</p>}
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeFlow />
    </Suspense>
  );
}
