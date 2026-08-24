import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeLogo } from "@/components/brand/theme-logo";
import { AuthControls } from "@/components/auth/auth-controls";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { normalizeEmail } from "@/lib/crm/normalize";
import { RECOVERY_OTP_VALIDITY_LABEL, RECOVERY_OTP_VALIDITY_MINUTES } from "@/lib/auth/recovery";
import { getServerDict } from "@/lib/i18n/server";
import { LangProvider } from "@/components/i18n/lang-provider";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme";

export const metadata: Metadata = { title: "Kata sandi baru" };
export const dynamic = "force-dynamic";

/**
 * Landing page for the reset CODE. The email arrives already-normalized from the request
 * action; we normalize again defensively so a hand-typed `?email=Marketing@20fit.id` is shown
 * (and verified) in the lower-case form the system actually uses (K-06). No session token in
 * the URL — the session is established by verifyOtp when the code is submitted (in the client
 * form), which is why an authenticated user is deliberately NOT bounced off this path.
 */
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = normalizeEmail(searchParams?.email ?? null);
  const { lang, t } = getServerDict();
  const theme = resolveTheme(cookies().get(THEME_COOKIE)?.value);

  return (
    // Follows the viewer's theme (K-33); theme-aware lockup.
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-[linear-gradient(150deg,var(--bg-from)_0%,var(--bg-to)_100%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-6 text-center">
          <ThemeLogo height={40} priority />
          <div>
            <h1 className="font-display text-[32px] font-black uppercase leading-none text-ink">
              {t.auth.resetTitle}
            </h1>
            <p className="mt-2 font-body text-[14px] text-ink-soft">
              {t.auth.resetSubtitle}
            </p>
          </div>
        </div>

        <LangProvider lang={lang}>
          <AuthControls initialTheme={theme} />
        </LangProvider>

        <div className="glass-strong p-6 shadow-glass-lg">
          {/* Auth pages live outside the app shell, so there is no ambient LangProvider — wrap the
              client form here (lang read from the same cookie) so it can use the dictionary. */}
          <LangProvider lang={lang}>
            <ResetPasswordForm
              email={email}
              validityLabel={RECOVERY_OTP_VALIDITY_LABEL}
              validityMinutes={RECOVERY_OTP_VALIDITY_MINUTES}
            />
          </LangProvider>
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
