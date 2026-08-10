import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES ALL RLS. Server-only.
 *
 * Guards, strongest first:
 *   1. `import "server-only"` makes the build FAIL if this module is ever pulled
 *      into a client bundle.
 *   2. The runtime check below throws immediately if it somehow executes in a
 *      browser.
 *
 * Only import this from Route Handlers and Server Actions. It is intentionally
 * unused in Sprint 1 — there is no CRM data access yet.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase/admin.ts loaded in the browser — the service role key must never reach the client.",
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the admin client.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
