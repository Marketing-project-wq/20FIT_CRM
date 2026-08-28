import "server-only";
import { AUDIENCE_UNITS, AUDIENCE_SEGMENTS } from "./audience-constants";
import { ECOSYSTEM_UNITS } from "./engagement-constants";
import { STAGING_RFM_VALUES, STAGING_PROGRAMS } from "./staging-constants";
import { sanitizeAssistOutput, type AssistProposal } from "./segment-ai-shared";
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

const MAX_INPUT = 500; // free text is capped before it ever reaches the model (cost + abuse)
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";

function buildSystemPrompt(lang: Lang): string {
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
    `- srcRfm ∈ [${STAGING_RFM_VALUES.join(", ")}] atau null (pertahankan ejaan apa adanya, termasuk "Campion user").`,
    `- srcProgram ∈ salah satu key: ${programs}. atau null.`,
    "- joinedWithinDays: integer (hari) — bergabung ≤ N hari lalu (untuk sambutan). Berdasarkan aktivitas NYATA.",
    "- inactiveForDays: integer (hari) — tidak aktif ≥ N hari (untuk aktivasi ulang). Berdasarkan aktivitas NYATA.",
    "- unexpressible: array string. notes: string pendek.",
    "",
    "ATURAN KETAT:",
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
  opts: { canViewHealth: boolean; lang: Lang },
): Promise<AssistProposal> {
  const text = String(rawText ?? "").trim().slice(0, MAX_INPUT);
  if (text === "") throw new AiUnavailableError("empty request");

  const apiKey = process.env.SEGMENT_AI_API_KEY;
  if (!apiKey) throw new AiUnavailableError("SEGMENT_AI_API_KEY not configured");
  const baseUrl = (process.env.SEGMENT_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.SEGMENT_AI_MODEL || DEFAULT_MODEL;

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
          { role: "system", content: buildSystemPrompt(opts.lang) },
          { role: "user", content: text },
        ],
      }),
    });
  } catch {
    throw new AiUnavailableError("could not reach the model");
  }
  if (!res.ok) throw new AiUnavailableError(`model returned HTTP ${res.status}`);

  const body = (await res.json().catch(() => null)) as ChatResponse | null;
  const reply = body?.choices?.[0]?.message?.content ?? "";
  if (!reply) throw new AiUnavailableError("empty model reply");

  // Untrusted model output → the pure sanitizer is the security boundary.
  return sanitizeAssistOutput(extractJson(reply), opts);
}
