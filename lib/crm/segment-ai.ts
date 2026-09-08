import "server-only";
import { AUDIENCE_UNITS, AUDIENCE_SEGMENTS } from "./audience-constants";
import { ECOSYSTEM_UNITS } from "./engagement-constants";
import { STAGING_RFM_VALUES, STAGING_PROGRAMS } from "./staging-constants";
import { sanitizeAssistOutput, type AssistProposal } from "./segment-ai-shared";
import { groupTags, namespaceLabel, tagValueLabel } from "./tags";
import type { Lang } from "@/lib/i18n";

/**
 * AI segment assistant — the SERVER-ONLY LLM call. Uses OpenRouter (OpenAI-compatible chat API).
 *
 * free text → (here) LLM → JSON → sanitizeAssistOutput (closed-list validation + clinical gate)
 *
 * The model only PROPOSES structured criteria; it never sees the database, never writes SQL, and
 * its output is fully re-validated by sanitizeAssistOutput before anything is shown or run. The
 * API key is read from the server env and never reaches the client. If the key is missing or the
 * call fails, this throws AiUnavailableError and the route degrades to the manual builder.
 *
 * Config (env, all server-side):
 *   SEGMENT_AI_API_KEY   — OpenRouter key (sk-or-...)
 *   SEGMENT_AI_BASE_URL  — default https://openrouter.ai/api/v1
 *   SEGMENT_AI_MODEL     — default deepseek/deepseek-v4-flash-0731
 */

export class AiUnavailableError extends Error {}
/** The model did not respond within AI_TIMEOUT_MS. A subclass of AiUnavailableError so every existing
 *  `instanceof AiUnavailableError` fallback still catches it — but the route can single it out to show
 *  a "try again / build manually" message instead of the generic "unavailable" one. */
export class AiTimeoutError extends AiUnavailableError {}

const MAX_INPUT = 500; // free text is capped before it ever reaches the model (cost + abuse)
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";
/**
 * Hard cap on the model round-trip. MUST stay comfortably under the edge proxy's limit (Cloudflare/
 * Railway cut an idle request at ~100s and return a 524 the origin never sees). Without this, a slow
 * model hung the request until that cut, so the user got a raw "HTTP 524" instead of our handled 503 —
 * the route's own error paths were never reached. 25s lets us respond first, every time.
 */
const AI_TIMEOUT_MS = 25_000;

/** The tag vocabulary section — the EXACT operator tags present in the pool, grouped per namespace
 *  with their human labels. The model may map an event/role name ONLY to a tag in this list; anything
 *  else goes to `unexpressible`. Empty pool → an explicit "no tags" line so the model can't invent. */
function tagVocabSection(availableTags: readonly string[]): string {
  if (availableTags.length === 0) {
    return "- tagsAny / tagsAll: array of tag. TIDAK ADA tag di pool saat ini — selalu kosongkan keduanya, dan kalau permintaan menyebut acara/peran, tulis di unexpressible.";
  }
  const grouped = groupTags(availableTags);
  const lines = grouped.operator.map((g) => {
    const values = g.tags.map((t) => `"${t}" (${tagValueLabel(t, "id")})`).join(", ");
    return `    ${g.namespace} — ${namespaceLabel(g.namespace, "id")}: ${values}`;
  });
  return [
    "- tagsAny: array of tag — cocok kalau orang punya SALAH SATU tag (mis. ikut event A ATAU B). tagsAll: array of tag — HARUS punya SEMUA (mis. peran race DAN wave pagi). [] kalau tak ada.",
    "  Tag yang BOLEH dipakai (HANYA ini — salin persis, jangan mengarang):",
    ...lines,
  ].join("\n");
}

function buildSystemPrompt(lang: Lang, availableTags: readonly string[]): string {
  const programs = STAGING_PROGRAMS.map((p) => `${p.key}${p.clinical ? " (KLINIS)" : ""} = "${p.label}"`).join(", ");
  // One prompt, one vocabulary — the user may write in any language; only the language the model
  // REPLIES in (notes + unexpressible reasons) follows the user's chosen UI language.
  const replyLang = lang === "en" ? "English" : "Bahasa Indonesia";
  return [
    `Anda memetakan deskripsi bebas (bahasa apa pun) menjadi kriteria segmen CRM 20FIT. Balas isi "unexpressible" dan "notes" dalam ${replyLang}.`,
    "Keluarkan HANYA satu objek JSON valid, tanpa teks lain, tanpa markdown.",
    "",
    "Skema JSON (semua opsional):",
    "- conditions: array of { field, value } untuk kolom master. field ∈ [unit, segment, city, revenue, hasPhone, hasEmail].",
    `    unit ∈ [${AUDIENCE_UNITS.join(", ")}]. segment ∈ [${AUDIENCE_SEGMENTS.join(", ")}] atau "__null__".`,
    "    revenue ∈ [has, none, negative]. city = teks bebas nama kota. hasPhone/hasEmail = true (kehadiran).",
    `- ecoUnit ∈ [${ECOSYSTEM_UNITS.join(", ")}] atau null. ecoProduct = nama produk ekosistem atau null.`,
    "- srcHyrox, srcMy20fit, srcRecency, srcArena, srcGym, srcClinicPatient, srcClinicTxn: boolean (kehadiran di sumber).",
    `- srcRfm: array of value dari [${STAGING_RFM_VALUES.join(", ")}] (pertahankan ejaan apa adanya, termasuk "Campion user"). Boleh beberapa (OR di dalam kriteria), atau [] kalau tak ada.`,
    `- srcProgram: array of key dari: ${programs}. Boleh beberapa key sekaligus (mis. peserta Half ATAU Double → dua-duanya), atau [] kalau tak ada.`,
    "- joinedWithinDays: integer (hari) — bergabung ≤ N hari lalu (untuk sambutan). Berdasarkan aktivitas NYATA.",
    "- inactiveForDays: integer (hari) — tidak aktif ≥ N hari (untuk aktivasi ulang). Berdasarkan aktivitas NYATA.",
    tagVocabSection(availableTags),
    "- unexpressible: array string. notes: string pendek.",
    "",
    "ATURAN KETAT:",
    "- Tag: petakan nama acara/peran HANYA ke tag di daftar tag di atas (cocokkan berdasarkan makna, mis. \"sportfest 2\" → \"event:sportfest-2-2026-02\"). Kalau acara/peran yang diminta TIDAK ADA di daftar, JANGAN menebak tag terdekat — tulis di unexpressible bahwa tag itu tak ada di pool. Menebak segmen jauh lebih buruk daripada mengaku tidak tahu.",
    "- JANGAN mengarang field/nilai di luar daftar tertutup di atas. Kalau ragu, kosongkan dan jelaskan di unexpressible.",
    "- Kriteria waktu HANYA joinedWithinDays / inactiveForDays (dari aktivitas nyata). JANGAN mengarang kriteria waktu lain.",
    "- Program pasien klinik (clinic_2024_2025 / clinic_2025_2026) dan srcClinicPatient/srcClinicTxn bersifat klinis; boleh diusulkan, tetapi server yang menentukan izinnya.",
    "- Kalau Anda tidak yakin memetakan sebagian permintaan, tulis keraguan itu di notes — usulan salah yang terlihat yakin lebih buruk daripada mengaku tidak yakin.",
  ].join("\n");
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** Extract the first balanced JSON object from a model reply (defensive against stray prose). */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new AiUnavailableError("no JSON in model reply");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiUnavailableError("model reply was not valid JSON");
  }
}

export async function proposeSegment(
  rawText: string,
  opts: { canViewHealth: boolean; lang: Lang; availableTags: readonly string[] },
): Promise<AssistProposal> {
  const text = String(rawText ?? "").trim().slice(0, MAX_INPUT);
  if (text === "") throw new AiUnavailableError("empty request");

  const apiKey = process.env.SEGMENT_AI_API_KEY;
  if (!apiKey) throw new AiUnavailableError("SEGMENT_AI_API_KEY not configured");
  const baseUrl = (process.env.SEGMENT_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.SEGMENT_AI_MODEL || DEFAULT_MODEL;

  // Bound the round-trip with an AbortController so we respond before the edge proxy times out.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(opts.lang, opts.availableTags) },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    // AbortError (our timeout) → the model was too slow; distinguish it so the UI can say "try again".
    if (e instanceof Error && e.name === "AbortError") throw new AiTimeoutError("model timed out");
    throw new AiUnavailableError("could not reach the model");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AiUnavailableError(`model returned HTTP ${res.status}`);

  const body = (await res.json().catch(() => null)) as ChatResponse | null;
  const reply = body?.choices?.[0]?.message?.content ?? "";
  if (!reply) throw new AiUnavailableError("empty model reply");

  // Untrusted model output → the pure sanitizer is the security boundary. allowedTags makes the
  // sanitizer drop any proposed tag NOT in the pool — the refusal survives even a model that ignores
  // the prompt and invents a tag.
  return sanitizeAssistOutput(extractJson(reply), { canViewHealth: opts.canViewHealth, allowedTags: opts.availableTags });
}
