import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Auth-directory helpers for the 20FIT Manager tab. The auth pool is SHARED across the whole 20FIT
 * ecosystem (935 accounts as of 25 Agu 2026), which broke two things when we used a bare
 * `listUsers()`:
 *
 *  1. Display (T-33): `listUsers()` returns only PAGE 1 (default 50). The CRM members sit at creation
 *     ranks 2, 3 and 110, so at least one was never on page 1 → the roles table silently showed a UUID
 *     instead of the email. `tsc`/lint/build all green; only the rendered value was wrong.
 *  2. Grant-by-email: the same page-1 lookup would return "user not found" for a real account that
 *     happens to live past page 1 — a silent false negative on a write path.
 *
 * The fixes below are TARGETED: resolve a member's email by its id (getUserById — no pagination, no
 * ecosystem dump, and it honours "never list the whole auth directory to show a few emails"); and,
 * where we genuinely must search by email (grant), paginate deliberately with a bound.
 */

/** One member's email by id. Returns null if it TRULY can't be resolved (never a UUID stand-in). */
export async function resolveUserEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Map user_id -> email for a SMALL, known set of members (the crm_user_role rows). Missing ids are
 *  simply absent from the map, so the caller can show an honest "unresolved" marker rather than a UUID
 *  dressed up as an answer. */
export async function resolveUserEmails(userIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    userIds.map(async (id) => {
      const email = await resolveUserEmail(id);
      if (email) out[id] = email;
    }),
  );
  return out;
}

/**
 * Find an auth account id by email. The admin API has no by-email lookup, so we paginate — but
 * DELIBERATELY, across pages, not just page 1 (that was the silent bug). Bounded so a typo can't scan
 * forever. Returns null only when the email genuinely has no account within the bound; the CRM never
 * creates one.
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  try {
    const admin = createAdminClient();
    const perPage = 200;
    const maxPages = 50; // 10k accounts — far above the current ~935 pool; a hard stop, not a scan-all
    for (let page = 1; page <= maxPages; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return null;
      const users = data?.users ?? [];
      const match = users.find((u) => (u.email ?? "").toLowerCase() === needle);
      if (match) return match.id;
      if (users.length < perPage) break; // reached the last page
    }
    return null;
  } catch {
    return null;
  }
}
