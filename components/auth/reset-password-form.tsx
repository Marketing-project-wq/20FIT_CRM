"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendRecoveryCode } from "@/app/forgot-password/actions";

const MIN_PASSWORD = 8;
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 45;

/**
 * Reset password by entering the six-digit CODE mailed via Mailtrap (see lib/auth/recovery).
 * On submit: verifyOtp({ type: 'recovery' }) establishes a short-lived session, then
 * updateUser sets the new password, then signOut. Shows NO name / role — only the email the
 * code was sent to, in its normalized (lower-case) form so it matches what the system
 * searched for (K-06).
 *
 * The email is passed in already-normalized by the server page. `validityLabel` is shown so
 * nobody tries an expired code and assumes the system is broken. "Kirim ulang" has a cooldown
 * so it cannot become a repeat-send path.
 */
type Phase = "ready" | "done";

export function ResetPasswordForm({
  email,
  validityLabel,
}: {
  email: string | null;
  validityLabel: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  // Cooldown ticker — a code was just sent when this page loaded, so start disabled.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onResend = useCallback(async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await resendRecoveryCode(email);
      // Uniform: we never reveal whether the address has an account. Say "sent" regardless.
      setNotice("Kode baru sudah dikirim bila email tersebut terdaftar. Periksa kotak masuk dan folder spam.");
    } catch {
      setNotice("Kode baru sudah dikirim bila email tersebut terdaftar. Periksa kotak masuk dan folder spam.");
    } finally {
      setResending(false);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }, [email, cooldown, resending]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email) {
      setError("Sesi reset tidak lengkap. Mulai lagi dari halaman lupa kata sandi.");
      return;
    }
    const token = code.replace(/\s/g, "");
    if (token.length !== CODE_LENGTH || !/^\d+$/.test(token)) {
      setError(`Kode terdiri dari ${CODE_LENGTH} digit angka.`);
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
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "recovery",
      });
      if (verifyErr) {
        // Generic — an expired/wrong code and an unknown account look the same here.
        setError("Kode salah atau sudah kedaluwarsa. Minta kode baru lalu coba lagi.");
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError("Gagal mengatur kata sandi baru. Minta kode baru lalu coba lagi.");
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

  if (phase === "done") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p role="status" className="font-body text-[14px] leading-relaxed text-ink">
          Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru Anda.
        </p>
        <Button size="lg" className="w-full" onClick={() => router.push("/login")}>
          Ke halaman masuk
        </Button>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p role="alert" className="font-body text-[14px] leading-relaxed text-ink">
          Halaman ini perlu dibuka dari alur lupa kata sandi. Mulai dengan memasukkan email Anda.
        </p>
        <Button size="lg" className="w-full" onClick={() => router.push("/forgot-password")}>
          Ke halaman lupa kata sandi
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="font-body text-[13px] leading-relaxed text-ink-soft">
        Kode dikirim ke <span className="font-mono text-[12px] text-ink">{email}</span>. Kode berlaku{" "}
        <strong>{validityLabel}</strong> dan hanya dapat dipakai sekali.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Kode verifikasi</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={"".padStart(CODE_LENGTH, "•")}
          maxLength={CODE_LENGTH}
          className="font-mono tracking-[6px]"
        />
      </div>

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
      {notice && <p role="status" className="font-body text-[13px] text-ink-soft">{notice}</p>}

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={loading}>
        {loading ? "Menyimpan…" : "Simpan kata sandi baru"}
      </Button>

      <button
        type="button"
        onClick={onResend}
        disabled={cooldown > 0 || resending}
        className="font-body text-[12px] text-ink-soft underline underline-offset-2 hover:text-ink disabled:no-underline disabled:opacity-60"
      >
        {cooldown > 0 ? `Kirim ulang kode (${cooldown}s)` : resending ? "Mengirim ulang…" : "Kirim ulang kode"}
      </button>
    </form>
  );
}
