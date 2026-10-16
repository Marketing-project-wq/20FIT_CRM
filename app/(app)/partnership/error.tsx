"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for /partnership. The common failure is deployment skew: a tab opened before a
 * redeploy navigates here and asks for client modules the new build no longer has ("reading 'call'",
 * ChunkLoadError). That heals with one full reload, done automatically once per minute; anything else
 * is shown with a retry button instead of the blank "Application error" page.
 */
const STALE = /ChunkLoadError|Loading chunk|reading 'call'|Failed to fetch dynamically imported module|Importing a module script failed/i;

export default function PartnershipError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = STALE.test(`${error?.name ?? ""} ${error?.message ?? ""}`);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!stale) return;
    let last = 0;
    try { last = Number(window.sessionStorage.getItem("partnership-reload") ?? 0); } catch { /* storage blocked */ }
    if (Date.now() - last > 60_000) {
      try { window.sessionStorage.setItem("partnership-reload", String(Date.now())); } catch { /* storage blocked */ }
      setReloading(true);
      window.location.reload();
    }
  }, [stale]);

  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-glass-border p-6">
      <h1 className="font-display text-[24px] font-black uppercase text-ink">Partnership</h1>
      <p className="max-w-xl font-body text-[14px] text-ink-soft">
        {stale || reloading
          ? "CRM baru saja diperbarui. Halaman dimuat ulang supaya memakai versi terbaru…"
          : "Halaman partnership gagal ditampilkan. Coba muat ulang; kalau masih gagal, kirim pesan error di bawah ke tim teknis."}
      </p>
      {!stale && <code className="max-w-full break-all font-mono text-[12px] text-red">{error?.message}{error?.digest ? ` (${error.digest})` : ""}</code>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => window.location.reload()}><RefreshCw /> Muat ulang</Button>
        <Button size="sm" variant="secondary" onClick={() => reset()}>Coba lagi</Button>
      </div>
    </div>
  );
}
