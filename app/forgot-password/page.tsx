"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

/**
 * "Lupa kata sandi" — step 1: request an OTP code by email.
 *
 * Uses Supabase's built-in recovery: resetPasswordForEmail generates a one-time token
 * that the email template renders as a 6-digit code ({{ .Token }}), delivered via the
 * Mailtrap SMTP configured on the Supabase project. Supabase owns OTP generation, expiry,
 * hashing and rate-limiting — nothing sensitive is stored or generated in this app.
 *
 * ANTI-ENUMERATION: the response is the SAME whether or not the email exists — we always
 * show "if the email is registered, a code was sent" and never reveal which case it was.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      // No redirectTo: this is an OTP-CODE flow, not a magic-link flow. Supabase returns
      // success even for an unknown email (no enumeration), so we treat any non-throw as sent.
      const { error: err } = await supabase.auth.resetPasswordForEmail(value);
      if (err && err.status !== 400) {
        // 400 = still "sent" semantics (don't leak). Anything else = a real transport/config
        // problem (e.g. SMTP not configured) — surface it generically.
        setError("Tidak dapat mengirim kode saat ini. Coba lagi sebentar lagi atau hubungi admin.");
        return;
      }
      setSent(true);
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
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">Lupa kata sandi</h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">Kirim kode OTP ke email Anda</p>
          </div>
        </div>

        <div className="glass-strong p-6 shadow-glass-lg">
          {sent ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="font-body text-[14px] leading-relaxed text-ink">
                Bila <span className="font-mono">{email.trim()}</span> terdaftar, kode OTP 6-digit sudah
                dikirim ke email itu. Masukkan kodenya untuk mengatur kata sandi baru.
              </p>
              <Button
                size="lg"
                className="w-full"
                onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email.trim())}`)}
              >
                Masukkan kode OTP
              </Button>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-body text-[13px] text-ink-soft underline underline-offset-2 hover:text-ink"
              >
                Kirim ulang / ganti email
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@20fit.id"
                  className="font-mono"
                />
              </div>
              {error && <p role="alert" className="font-body text-[13px] text-red">{error}</p>}
              <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
                {loading ? "Mengirim…" : "Kirim kode OTP"}
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
