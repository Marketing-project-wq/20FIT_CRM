import { cookies } from "next/headers";
import { Sidebar } from "./sidebar";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme";

/**
 * Application chrome: always-dark sidebar + light/dark content surface. The
 * content sits on the body's `--bg-from → --bg-to` gradient, which re-tints with
 * the theme. `activePath` is only for dev previews.
 */
export function AppShell({
  userEmail,
  activePath,
  children,
}: {
  userEmail: string;
  activePath?: string;
  children: React.ReactNode;
}) {
  const theme = resolveTheme(cookies().get(THEME_COOKIE)?.value);
  return (
    <div className="flex min-h-[100dvh]">
      <Sidebar userEmail={userEmail} initialTheme={theme} activePath={activePath} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">{children}</div>
      </main>
    </div>
  );
}
