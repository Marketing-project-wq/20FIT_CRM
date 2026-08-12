"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Request a password-reset email. Supabase sends a recovery LINK to `redirectTo`
 * (/reset-password), where clicking it establishes a short-lived recovery session.
 *
 * ANTI-ENUMERATION: the outcome is IDENTICAL whether or not the email has an account —
 * always redirect to `?sent=1` and show the same message. A different response would turn
 * this page into a tool to check who has an account, and this Supabase project is shared
 * across 887 auth.users. The audit row is likewise written the same way regardless (we
 * cannot even tell if the account exists), and NEVER records the submitted email — so the
 * log can't leak what the screen deliberately hides.
 *
 * Errors follow app/login/actions.ts exactly: a 400 from GoTrue is a normal rejection kept
 * generic; anything else is a connection/config failure with a PII-free server log (status +
 * code only, never the email). Rate limiting relies on Supabase's built-in email rate limit
 * — there is no app-side store for per-email state without adding a table (out of scope).
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) {
    redirect("/forgot-password?error=invalid");
  }

  // Build the absolute redirect target from the request origin (falls back to the
  // configured site URL). This must be allow-listed in Supabase Auth (see SETUP doc).
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : "");
  const redirectTo = `${origin}/reset-password`;

  let outcome: "sent" | "error" = "sent";
  let authError: AuthError | null = null;
  try {
    const supabase = createClient();
    ({ error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }));
  } catch (e) {
    // Client build / network threw — a connection problem, never a credentials one.
    console.error("[forgot-password] reset request threw (connection/config)", {
      name: e instanceof Error ? e.name : typeof e,
      code: (e as { code?: string | number })?.code,
    });
    outcome = "error";
  }

  if (authError && authError.status !== 400) {
    // 400 = still "sent" semantics (don't leak). Anything else = connection/config.
    console.error("[forgot-password] auth error (connection/config)", {
      status: authError.status,
      code: authError.code,
    });
    outcome = "error";
  }

  // Audit: a reset was requested + its outcome. `login.password_reset_requested` falls under
  // the login.% operational allowlist (migration 8) — pruned after 90 days. actor_email is a
  // fixed system marker, NOT the submitted email: recording arbitrary submitted emails would
  // both store PII and leak which addresses were tried. Non-fatal — never block the reset.
  try {
    const admin = createAdminClient();
    await admin.from("crm_audit_log").insert({
      actor_email: "system:password-reset",
      action: "login.password_reset_requested",
      target_table: "auth.users",
      summary: "Permintaan reset kata sandi diajukan.",
      metadata: { outcome }, // NO email — anti-enumeration + PII-free.
    });
  } catch (e) {
    console.error("[forgot-password] audit write failed", {
      code: (e as { code?: string })?.code,
    });
  }

  if (outcome === "error") {
    redirect("/forgot-password?error=unavailable");
  }
  // Uniform success — identical whether or not the account exists.
  redirect("/forgot-password?sent=1");
}
