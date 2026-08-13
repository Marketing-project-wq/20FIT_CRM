import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";
import { getServerDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Lupa kata sandi" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { t } = getServerDict();
  const ERRORS: Record<string, string> = {
    invalid: t.auth.forgotErrInvalid,
    unavailable: t.auth.forgotErrUnavailable,
  };
  const errorMsg = searchParams?.error ? (ERRORS[searchParams.error] ?? null) : null;

  return (
    // Same shell as /login: dark theme, white lockup, glass-strong card (no new styles).
    <div
      data-theme="dark"
      className="flex min-h-[100dvh] w-full items-center justify-center bg-[linear-gradient(150deg,var(--bg-from)_0%,var(--bg-to)_100%)] px-4 py-10"
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <BrandLogo variant="white" height={40} priority />
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
              {t.auth.forgotTitle}
            </h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">
              {t.auth.forgotSubtitle}
            </p>
          </div>
        </div>

        <div className="glass-strong p-6 shadow-glass-lg">
          <form action={requestPasswordReset} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t.auth.emailLabel}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="nama@20fit.id"
                className="font-mono"
              />
            </div>

            {errorMsg && (
              <p role="alert" className="font-body text-[13px] text-red">
                {errorMsg}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-1 w-full">
              {t.auth.sendCodeButton}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center font-body text-[12px] text-ink-faint">
          <Link href="/login" className="underline underline-offset-2 hover:text-ink-soft">
            {t.auth.backToLogin}
          </Link>
        </p>
      </div>
    </div>
  );
}
