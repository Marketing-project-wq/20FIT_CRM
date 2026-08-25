import { cookies } from "next/headers";
import { Sidebar } from "./sidebar";
import { NAV_ITEMS } from "./nav";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { canSeeNav } from "@/lib/auth/roles";
import { getLang } from "@/lib/i18n/server";
import { LangProvider } from "@/components/i18n/lang-provider";

/**
 * Application chrome: always-dark sidebar + light/dark content surface. The
 * content sits on the body's `--bg-from → --bg-to` gradient, which re-tints with
 * the theme.
 *
 * Nav is filtered SERVER-SIDE by the RBAC matrix (canSeeNav). Only href STRINGS
 * cross to the client Sidebar — icon components are not serializable and stay in the
 * client. This is cosmetic only; every route + API still enforces its own guard.
 * Fail-closed: no role -> only the dashboard shows.
 *
 * `activePath` is a dev-preview override for the active item. `showAllNav` bypasses
 * RBAC filtering for the dev shell preview (which has no live session).
 */
export async function AppShell({
  userEmail,
  activePath,
  showAllNav = false,
  children,
}: {
  userEmail: string;
  activePath?: string;
  showAllNav?: boolean;
  children: React.ReactNode;
}) {
  const theme = resolveTheme(cookies().get(THEME_COOKIE)?.value);

  const allowedHrefs = showAllNav
    ? NAV_ITEMS.map((i) => i.href)
    : await (async () => {
        const role = await getCurrentUserRole();
        return NAV_ITEMS.filter((i) => canSeeNav(role, i.href)).map((i) => i.href);
      })();

  return (
    <LangProvider lang={getLang()}>
      {/* Column on mobile (top bar stacked above content), row on desktop (rail beside content). */}
      <div className="flex min-h-[100dvh] flex-col md:flex-row">
        <Sidebar
          userEmail={userEmail}
          initialTheme={theme}
          activePath={activePath}
          allowedHrefs={allowedHrefs}
        />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:px-10 md:py-8">{children}</div>
        </main>
      </div>
    </LangProvider>
  );
}
