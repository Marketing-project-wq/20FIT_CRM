import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Guard for every authenticated screen. Middleware already gates access; this is
 * defense in depth and also supplies the signed-in user's email to the shell.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect("/login");
  }

  const supabase = createClient();
  let email: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    // Auth server unreachable — treat as signed out and fail closed below.
    email = null;
  }

  if (!email) redirect("/login");

  return <AppShell userEmail={email}>{children}</AppShell>;
}
