"use client";

import { useEffect, useState } from "react";
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
 * "Lupa kata sandi" — step 2: verify the OTP code and set a new password.
 *
 * verifyOtp({ type: 'recovery' }) exchanges the 6-digit code for a short-lived recovery
 * session; updateUser({ password }) then sets the new password. Supabase validates the
 * code (expiry, single-use) — this app never sees or stores it. On success we sign out so
 * the user logs in fresh with the new password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Prefill the email from the query string without useSearchParams (avoids a Suspense
  // boundary requirement); read it client-side after mount.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("email");
    if (q) setEmail(q);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const em = email.trim();
    const code = token.trim();
    if (!em || !code) {
      setError("Email dan kode OTP wajib diisi.");
      return;
    }
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
      const { error: verifyErr } = await supabase.auth.verifyOtp({ email: em, token: code, type: "recovery" });
      if (verifyErr) {
        setError("Kode OTP salah atau kedaluwarsa. Minta kode baru dan coba lagi.");
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message || "Gagal mengatur kata sandi baru.");
        return;
      }
      await supabase.auth.signOut();
      setDone(true);
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
            <p className="mt-2 font-body text-[14px] text-ink-soft">Masukkan kode OTP dari email + kata sandi baru</p>
          </div>
        </div>

        <div className="glass-strong p-6 shadow-glass-lg">
          {done ? (
            <div className="flex flex-col gap-4 text-center">
              <p role="status" className="font-body text-[14px] leading-relaxed text-ink">
                Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru Anda.
              </p>
              <Button size="lg" className="w-full" onClick={() => router.push("/login")}>
                Ke halaman masuk
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="font-mono" placeholder="nama@20fit.id" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="token">Kode OTP</Label>
                <Input id="token" inputMode="numeric" autoComplete="one-time-code" required value={token} onChange={(e) => setToken(e.target.value)} className="font-mono tracking-[0.3em]" placeholder="123456" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Kata sandi baru</Label>
                <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`Minimal ${MIN_PASSWORD} karakter`} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Ulangi kata sandi baru</Label>
                <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p role="alert" className="font-body text-[13px] text-red">{error}</p>}
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
                {loading ? "Menyimpan…" : "Simpan kata sandi baru"}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center font-body text-[12px] text-ink-faint">
          <Link href="/forgot-password" className="underline underline-offset-2 hover:text-ink-soft">Belum punya kode? Minta lagi</Link>
          {" · "}
          <Link href="/login" className="underline underline-offset-2 hover:text-ink-soft">Masuk</Link>
        </p>
      </div>
    </div>
  );
}
