import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ThemeLogo } from "@/components/brand/theme-logo";
import { AuthControls } from "@/components/auth/auth-controls";
import { LangProvider } from "@/components/i18n/lang-provider";
import { signIn } from "./actions";
import { getServerDict } from "@/lib/i18n/server";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; redirectedFrom?: string };
}) {
  const { lang, t } = getServerDict();
  const theme = resolveTheme(cookies().get(THEME_COOKIE)?.value);
  const ERRORS: Record<string, string> = {
    invalid: t.auth.errInvalid,
    missing: t.auth.errMissing,
    unavailable: t.auth.errUnavailable,
  };
  const errorMsg = searchParams?.error
    ? (ERRORS[searchParams.error] ?? t.auth.errGeneric)
    : null;
  const redirectedFrom =
    typeof searchParams?.redirectedFrom === "string" ? searchParams.redirectedFrom : "/";

  return (
    // Follows the viewer's theme (PRD §18.8 "login always dark" superseded — see K-33); the lockup
    // variant follows the theme too (white on dark, colour on light).
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[linear-gradient(150deg,var(--bg-from)_0%,var(--bg-to)_100%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <ThemeLogo height={40} priority />
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
              {t.auth.loginTitle}
            </h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">
              {t.auth.loginSubtitle}
            </p>
          </div>
        </div>

        <LangProvider lang={lang}>
          <AuthControls initialTheme={theme} />
        </LangProvider>

        <div className="glass-strong p-6 shadow-glass-lg">
          <form action={signIn} className="flex flex-col gap-4">
            <input type="hidden" name="redirectedFrom" value={redirectedFrom} />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t.auth.emailLabel}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder={t.auth.emailPlaceholder}
                className="font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password">{t.auth.passwordLabel}</Label>
                <Link
                  href={`/forgot-password?redirectedFrom=${encodeURIComponent(redirectedFrom)}`}
                  className="font-body text-[12px] text-ink-soft underline underline-offset-2 hover:text-ink"
                >
                  {t.auth.forgotLink}
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
                required
                showLabel={t.auth.showPassword}
                hideLabel={t.auth.hidePassword}
              />
            </div>

            {errorMsg && (
              <p role="alert" className="font-body text-[13px] text-red">
                {errorMsg}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-1 w-full">
              {t.auth.loginButton}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center font-body text-[12px] leading-relaxed text-ink-faint">
          {t.auth.loginFootnote}
        </p>
      </div>
    </div>
  );
}
