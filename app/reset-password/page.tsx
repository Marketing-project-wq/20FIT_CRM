"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;

/**
 * Landing page for the recovery LINK. Supabase establishes a short-lived recovery session
 * when the emailed link is clicked (the token is in the URL); this page waits for that
 * session, then lets the user set a new password via updateUser({ password }).
 *
 * The link is single-use and EXPIRES: if no valid recovery session appears, we show a clear
 * message + a way back to /forgot-password — never a blank error that reads as "broken".
 * This page shows NO email / name / role — it only needs to know a valid reset session exists.
 */
type Phase = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    // The recovery link fires PASSWORD_RECOVERY (or yields a session) once its token is
    // processed. Accept either signal; if neither arrives shortly, treat the link as invalid.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled.current) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        settled.current = true;
        setPhase("ready");
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!settled.current && data.session) {
        settled.current = true;
        setPhase("ready");
      }
    })();

    // Fallback: no recovery session established → invalid / expired link.
    const timer = setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        setPhase("invalid");
      }
    }, 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Kata sandi baru minimal ${MIN_PASSWORD} karakter.`);
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message || "Gagal mengatur kata sandi baru. Tautan mungkin sudah kedaluwarsa.");
        return;
      }
      await supabase.auth.signOut();
      setPhase("done");
    } catch {
      setError("Tidak dapat terhubung ke server. Coba lagi sebentar lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-theme="dark"
      className="flex min-h-[100dvh] w-full items-center justify-center bg-[linear-gradient(150deg,var(--bg-from)_0%,var(--bg-to)_100%)] px-4 py-10"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <BrandLogo variant="white" height={40} priority />
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Kata sandi baru</h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">Buat kata sandi baru untuk akun Anda</p>
          </div>
        </div>

        <div className="glass-strong p-6 shadow-glass-lg">
          {phase === "checking" && (
            <p role="status" className="font-body text-[14px] text-ink-soft">Memeriksa tautan…</p>
          )}

          {phase === "invalid" && (
            <div className="flex flex-col gap-4 text-center">
              <p role="alert" className="font-body text-[14px] leading-relaxed text-ink">
                Tautan reset tidak sah atau sudah kedaluwarsa. Tautan hanya berlaku sekali dan
                untuk waktu terbatas.
              </p>
              <Button size="lg" className="w-full" onClick={() => router.push("/forgot-password")}>
                Minta tautan baru
              </Button>
            </div>
          )}

          {phase === "done" && (
            <div className="flex flex-col gap-4 text-center">
              <p role="status" className="font-body text-[14px] leading-relaxed text-ink">
                Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru Anda.
              </p>
              <Button size="lg" className="w-full" onClick={() => router.push("/login")}>
                Ke halaman masuk
              </Button>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Kata sandi baru</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Minimal ${MIN_PASSWORD} karakter`}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Ulangi kata sandi baru</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <p role="alert" className="font-body text-[13px] text-red">{error}</p>}
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
                {loading ? "Menyimpan…" : "Simpan kata sandi baru"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center font-body text-[12px] text-ink-faint">
          <Link href="/login" className="underline underline-offset-2 hover:text-ink-soft">Kembali ke halaman masuk</Link>
        </p>
      </div>
    </div>
  );
}
