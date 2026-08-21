/**
 * Profile SEARCH — input rules + result classification, pure & client-safe (imported by
 * the /audience UI AND the /api/search route, so the two never disagree). No I/O.
 *
 * Search is an EXTRACTION surface, so its limits are the product, not an afterthought.
 * Two invariants live here:
 *
 *   1. Phone/email are matched EXACT ONLY, and only after `normalize.ts`. This is the
 *      SECOND runtime consumer of the Sprint 3B canon (after the suppression write path).
 *      Substring on an identifier turns this screen into a harvester — `62812%` returns
 *      tens of thousands of people. Exact-match means the searcher must ALREADY know the
 *      full number/email, which is exactly the real situation: the person just called.
 *      Design follows the existing indexes (verified in pg_indexes 2026-08-11):
 *        - full_name           → GIN trigram  → substring (ilike), min 3 chars
 *        - phone_normalized     → btree UNIQUE → equality only
 *        - email_normalized     → btree UNIQUE → equality only
 *
 *   2. A capped result set with an explicit "too many" outcome — never silent truncation,
 *      never deep pagination (the paged, list.viewed-audited list already lives at
 *      /audience). If a name matches more than the cap, the answer is "narrow it", not
 *      "here's page 2".
 */
import { normalizePhoneID, normalizeEmail } from "./normalize";

export type SearchKind = "name" | "phone" | "email";
export const SEARCH_KINDS: readonly SearchKind[] = ["name", "phone", "email"];

export function isSearchKind(v: unknown): v is SearchKind {
  return v === "name" || v === "phone" || v === "email";
}

/**
 * Minimum name query length. 3 is not arbitrary: pg_trgm builds 3-character grams, so a
 * query shorter than 3 cannot use the GIN trigram index at all (it would seq-scan 82k
 * rows) AND is too broad to mean anything — one or two letters pull half the pool. The
 * index bound and the anti-harvest bound are the same number here.
 */
export const NAME_MIN_LEN = 3;

/**
 * Max hits returned by a search. Much smaller than the list page size (25) on purpose: a
 * search is "find THIS person", not "browse". Over this, we return `too_many` and ask the
 * searcher to narrow — we do NOT paginate search results.
 */
export const SEARCH_MAX_RESULTS = 10;

/**
 * Detect which KIND a single free-text query is, from its shape alone — so the user types into
 * ONE box instead of pre-picking Name/Phone/Email. The detection is a proxy, shown to the user
 * BEFORE searching and overridable, because a silent wrong guess returns zero rows and reads as
 * "person not found" when the real cause is "searched the wrong column".
 *
 * Rules (order matters):
 *   1. contains '@'                                  → email
 *   2. after stripping spaces . - ( ), all digits    → phone
 *      (an optional leading '+' is allowed; there must be at least one digit)
 *   3. otherwise                                     → name
 *
 * Deliberate edge behaviour: a lone '+' (no digits) is NOT a phone — it falls through to name,
 * where prepareSearch will reject it for length. A name containing digits ("Agent 007") keeps
 * its letters after stripping, so it is not all-digits → name. Empty/blank → name (the neutral
 * default; prepareSearch rejects it). This is pure and unit-tested next to prepareSearch.
 */
export function detectSearchKind(raw: string | null | undefined): SearchKind {
  const s = (raw ?? "").trim();
  if (s === "") return "name";
  if (s.includes("@")) return "email";
  const stripped = s.replace(/[\s.\-()]/g, "");
  if (/^\+?\d+$/.test(stripped)) return "phone";
  return "name";
}

export type PreparedSearch =
  | { ok: true; kind: SearchKind; term: string }
  | { ok: false; error: string };

/**
 * Validate + shape a raw query for one kind. For name: the trimmed term (matched as a
 * substring downstream, wildcards escaped there). For phone/email: the NORMALIZED canon
 * (matched by equality). A null normalization is a clear rejection — we never fall back
 * to searching the raw string, which would always miss and read as "person not found".
 */
export function prepareSearch(kind: SearchKind, raw: string | null | undefined): PreparedSearch {
  const s = (raw ?? "").trim();

  if (kind === "name") {
    if (s.length < NAME_MIN_LEN) {
      return { ok: false, error: `Ketik minimal ${NAME_MIN_LEN} huruf nama.` };
    }
    // Wildcards would be a harvest lever (and we search by substring) — reject, don't escape-and-run.
    if (/[%_]/.test(s)) {
      return { ok: false, error: "Karakter wildcard (% _) tidak diperbolehkan pada pencarian nama." };
    }
    // All-digits on a name search is almost always a phone typed into the wrong box.
    if (/^\d+$/.test(s)) {
      return { ok: false, error: "Itu tampak seperti nomor — pilih pencarian Telepon." };
    }
    return { ok: true, kind: "name", term: s };
  }

  if (kind === "phone") {
    const key = normalizePhoneID(s);
    if (!key) {
      return { ok: false, error: "Nomor tidak dikenali. Coba format 0812…, +62…, atau 62…." };
    }
    return { ok: true, kind: "phone", term: key };
  }

  // email
  const key = normalizeEmail(s);
  if (!key) {
    return { ok: false, error: "Email tidak dikenali (harus mengandung @)." };
  }
  return { ok: true, kind: "email", term: key };
}

export type ResultStatus = "empty" | "ok" | "too_many";

/**
 * Classify a search by how many rows were fetched. The caller probes with `limit = cap+1`
 * so that `fetched > cap` unambiguously means "more than the cap matched" without a second
 * count query. Pure, so it is unit-tested alongside the input rules.
 */
export function classifyResultCount(fetched: number, cap: number = SEARCH_MAX_RESULTS): ResultStatus {
  if (fetched <= 0) return "empty";
  if (fetched > cap) return "too_many";
  return "ok";
}
