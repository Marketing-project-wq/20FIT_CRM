"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Generic message — never reveal whether the email exists.
    redirect(back("invalid"));
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}
