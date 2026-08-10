"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Only allow same-site absolute paths as a post-login redirect target. */
function safeRedirectTarget(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  return "/";
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirectedFrom"));
  const back = (code: string) =>
    `/login?error=${code}&redirectedFrom=${encodeURIComponent(redirectTo)}`;

  if (!email || !password) {
    redirect(back("missing"));
  }

  const supabase = createClient();

  let signInError: AuthError | null = null;
  try {
    ({ error: signInError } = await supabase.auth.signInWithPassword({ email, password }));
  } catch (e) {
    // Building the client or the network call itself threw — never a credentials
    // problem. Surface it as a connection failure and leave a PII-free server trace.
    // Log status/code only: Railway retains logs off-site, so never record the email.
    console.error("[login] sign-in threw (connection/config)", {
      name: e instanceof Error ? e.name : typeof e,
      code: (e as { code?: string | number })?.code,
    });
    redirect(back("unavailable"));
  }

  if (signInError) {
    // A 400 from GoTrue is a genuine credential rejection: keep it generic so we
    // never reveal whether the email exists. Anything else (network error, 5xx,
    // paused project, wrong URL/key → 401) is a connection/config failure — give it
    // a distinct message and a server log, so nobody debugs a password while
    // Supabase is simply unreachable.
    if (signInError.status === 400) {
      redirect(back("invalid"));
    }
    // Log status/code only — never the email or the error message. Railway
    // retains logs off-site; this system holds PII, so keep it out of the logs.
    console.error("[login] auth error (connection/config)", {
      status: signInError.status,
      code: signInError.code,
    });
    redirect(back("unavailable"));
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}
