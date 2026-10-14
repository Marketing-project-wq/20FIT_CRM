import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { canImportAudience, grantFor, type Role } from "@/lib/auth/roles";
import { listSegments, saveSegment } from "@/lib/crm/segment-store";
import { EMPTY_CRITERIA } from "@/lib/crm/segment";
import { parseCsvText } from "@/lib/crm/csv-parse";
import { runImportRequest } from "@/lib/crm/import-audience-run";
import { MAX_IMPORT_ROWS } from "@/lib/crm/import-audience";
import { buildImportDeps, finishImportExecute } from "@/lib/crm/import-audience-deps";
import { validateCampaignName } from "@/lib/crm/campaign-name";
import { validateSenderName } from "@/lib/email/sender-name";
import { extractVariables } from "@/lib/crm/template";
import { listDeliveries, deliveryDetail } from "@/lib/crm/deliveries";
import { stopRunDrain } from "@/lib/crm/send-drain";
import {
  previewCampaignCore,
  sendCampaignCore,
  scheduleCampaignCore,
  sendPreviewEmailCore,
  type MergeRow,
  type SendActor,
} from "@/lib/crm/campaign-send-core";
import { AGENT_TEMPLATE_PREFIX, AGENT_MAIL_GUIDE, isAgentMailTemplateKey } from "./guide";
import { ensureUnsubscribe, withPreheader } from "./html";

/**
 * Agent Mail tools — what an AI agent (Claude Code over MCP, /api/mcp) may do in the CRM. Every tool
 * runs as the CRM user named by the agent token, with that user's CURRENT role, through the SAME
 * gates as the human composer (lib/crm/campaign-send-core.ts, lib/crm/import-audience-deps.ts). The
 * agent can never do more than its user could do by hand. Writes are audited as `agent_mail.<tool>`.
 */

export interface AgentContext {
  userId: string;
  email: string;
  role: Role | null;
  servingHost: string | undefined;
}

type Json = Record<string, unknown>;
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Json;
}

export class ToolError extends Error {}

const MAX_CSV_BYTES = 15 * 1024 * 1024;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_TEST_RECIPIENTS = 5;

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

function str(args: Json, key: string, required = true): string {
  const v = args[key];
  if (typeof v === "string" && v.trim() !== "") return v;
  if (required) throw new ToolError(`'${key}' wajib diisi (string).`);
  return "";
}

function slug(s: string, max = 40): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "kampanye"
  );
}

function actorOf(ctx: AgentContext): SendActor {
  return { role: ctx.role, email: ctx.email };
}

async function audit(ctx: AgentContext, tool: string, summary: string, metadata: Json): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("crm_audit_log").insert({
    actor_id: ctx.userId,
    actor_email: ctx.email,
    action: `agent_mail.${tool}`,
    target_table: "agent_mail",
    summary: summary.slice(0, 500),
    metadata: { via: "mcp", ...metadata },
  });
  // Accountability first: an unlogged agent write is refused (same rule as /api/audience).
  if (error) throw new ToolError("Gagal mencatat audit — aksi dibatalkan. Coba lagi sebentar.");
}

/** CSV text or an array of row objects → headers + string rows (the importer's shape). */
function tableFrom(args: Json): { headers: string[]; rows: Record<string, string>[] } {
  if (typeof args.csv === "string" && args.csv.trim() !== "") {
    if (Buffer.byteLength(args.csv, "utf8") > MAX_CSV_BYTES) throw new ToolError("CSV terlalu besar (maks 15 MB).");
    const { headers, rows } = parseCsvText(args.csv);
    return { headers, rows };
  }
  if (Array.isArray(args.rows) && args.rows.length > 0) {
    const headers: string[] = [];
    const rows: Record<string, string>[] = [];
    for (const r of args.rows) {
      if (!r || typeof r !== "object" || Array.isArray(r)) throw new ToolError("'rows' harus array objek {kolom: nilai}.");
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r as Json)) {
        const key = k.trim();
        if (!headers.includes(key)) headers.push(key);
        out[key] = v == null ? "" : String(v);
      }
      rows.push(out);
    }
    return { headers, rows };
  }
  throw new ToolError("Kirim audiens sebagai 'csv' (teks CSV) atau 'rows' (array objek). Excel: ubah dulu ke CSV.");
}

/** Mail-merge rows from a CSV/rows table: the email column + every other column as a {{field}}. */
function mergeRowsFrom(args: Json): MergeRow[] | undefined {
  if (args.merge_csv === undefined && args.merge_rows === undefined) return undefined;
  const { headers, rows } = tableFrom({ csv: args.merge_csv, rows: args.merge_rows });
  const emailCol = headers.find((h) => /^e-?mail$/i.test(h)) ?? headers.find((h) => /e-?mail/i.test(h));
  if (!emailCol) throw new ToolError("Data merge harus punya kolom email.");
  return rows.map((r, i) => {
    const fields: Record<string, string> = {};
    for (const h of headers) if (h !== emailCol) fields[h] = r[h] ?? "";
    return { email: r[emailCol] ?? "", rowIndex: i, fields };
  });
}

const STD_VARS = new Set(["full_name", "first_name", "city", "unsubscribe_url"]);

const ERROR_HINT: Record<string, string> = {
  denied: "Role CRM pemilik token tidak boleh mengirim campaign.",
  not_found: "Segmen tidak ditemukan / sudah nonaktif.",
  clinical_gate: "Segmen ini memakai data klinis — role pemilik token tidak boleh memakainya.",
  no_unsubscribe: "Template tidak memuat {{unsubscribe_url}}.",
  needs_confirm: "Penerima > 500: panggil ulang dengan confirm_large_send: true setelah memastikan audiensnya benar.",
  count_changed: "Jumlah penerima berubah sejak preview — pakai fresh_sendable sebagai expected_recipients lalu kirim ulang.",
  label_required: "Nama campaign wajib 3–100 karakter.",
  send_in_progress: "Campaign dengan segmen + template yang sama masih berjalan — tidak boleh kirim dobel.",
  run_create_failed: "Gagal membuat campaign. Coba lagi.",
  enqueue_failed: "Gagal mengantrekan pengiriman. Coba lagi.",
  missing_env: "Konfigurasi kirim di server belum lengkap.",
  unresolvable_recipients: "Ada alamat di daftar email yang belum ada di database CRM.",
  unsubscribe_host_mismatch: "Link unsubscribe akan mati (host tidak cocok) — pengiriman ditolak.",
  bad_time: "Format jadwal salah. Pakai 'YYYY-MM-DD HH:MM' (WIB).",
  time_in_past: "Jadwal sudah lewat.",
  schedule_failed: "Gagal menyimpan jadwal.",
  no_template: "Template tidak ditemukan.",
  send_failed: "Email test gagal terkirim.",
};

function fail(code: string | undefined, extra: Json = {}): Json {
  const c = code ?? "unknown";
  return { ok: false, error: c, hint: ERROR_HINT[c] ?? "Gagal.", ...extra };
}

function pct(n: number, base: number): string | null {
  return base > 0 ? `${((n / base) * 100).toFixed(1)}%` : null;
}

// ── tool definitions ────────────────────────────────────────────────────────────────────────────

export const TOOLS: ToolDef[] = [
  {
    name: "agent_mail_guide",
    description: "Baca dulu: aturan & alur kerja Agent Mail 20FIT (urutan tool, aturan HTML, unsubscribe, batas). Panggil sekali di awal.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_segments",
    description: "Daftar segmen audiens yang tersimpan di CRM (id + nama). Pakai id-nya sebagai segment_id.",
    inputSchema: {
      type: "object",
      properties: { search: { type: "string", description: "Filter nama segmen (opsional)." } },
      additionalProperties: false,
    },
  },
  {
    name: "import_audience",
    description:
      "Upload audiens dari CSV/Excel (sudah diubah ke CSV) ke CRM lalu otomatis jadi segmen baru. Kolom email wajib; nama/telepon/kota dipetakan otomatis. Orang yang sudah ada tidak diduplikasi (hanya ditandai), yang pernah unsubscribe tetap tidak akan dikirimi. Mulai dengan dry_run: true untuk melihat ringkasannya. Hanya untuk role Super Admin.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama audiens, mis. 'Peserta HYROX Jakarta 2026'." },
        csv: { type: "string", description: "Isi file CSV (teks). Pilih ini ATAU rows." },
        rows: { type: "array", items: { type: "object" }, description: "Baris audiens sebagai objek {email, nama, ...}." },
        consent_source: {
          type: "string",
          description: "WAJIB: dari mana kontak ini berasal & bagaimana mereka setuju menerima email, mis. 'Form pendaftaran HYROX 2026, centang setuju info promo'.",
        },
        consent_confirmed: { type: "boolean", description: "WAJIB true: kontak di file ini setuju menerima email promo 20FIT." },
        dry_run: { type: "boolean", description: "true = hanya hitung, tidak menulis apa pun." },
      },
      required: ["name", "consent_source", "consent_confirmed"],
      additionalProperties: false,
    },
  },
  {
    name: "create_email",
    description:
      "Simpan email HTML sebagai template campaign. Variabel bawaan: {{first_name}}, {{full_name}}, {{city}}, {{unsubscribe_url}}; kolom lain dari data merge bisa dipakai sebagai {{nama_kolom}}. Link unsubscribe ditambahkan otomatis kalau belum ada. Hasil: template_key.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama internal email/campaign." },
        subject: { type: "string", description: "Subjek email (boleh pakai {{first_name}})." },
        html: { type: "string", description: "HTML email: dokumen lengkap (<html>…</html>) atau potongan konten." },
        sender_name: { type: "string", description: "Nama pengirim (opsional, maks 64 karakter), mis. '20FIT'." },
        preheader: { type: "string", description: "Teks pratinjau di inbox (opsional)." },
      },
      required: ["name", "subject", "html"],
      additionalProperties: false,
    },
  },
  {
    name: "preview_campaign",
    description: "Hitung penerima nyata untuk segmen + template sebelum kirim: cocok, punya email, kena unsubscribe/suppression, siap kirim. Simpan 'sendable' untuk expected_recipients.",
    inputSchema: {
      type: "object",
      properties: { segment_id: { type: "string" }, template_key: { type: "string" } },
      required: ["segment_id", "template_key"],
      additionalProperties: false,
    },
  },
  {
    name: "send_test_email",
    description: "Kirim email test ([PREVIEW]) ke maks. 5 alamat untuk dicek sebelum blast. Tidak dihitung sebagai campaign.",
    inputSchema: {
      type: "object",
      properties: {
        template_key: { type: "string" },
        to: { type: "array", items: { type: "string" }, description: "Alamat email penguji (maks 5)." },
        sample: { type: "object", description: "Contoh nilai field merge, mis. {\"kode_voucher\": \"HYROX10\"} (opsional)." },
      },
      required: ["template_key", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "send_campaign",
    description:
      "Kirim (atau jadwalkan) campaign ke segmen. Pengiriman berjalan di latar; pantau dengan campaign_stats. Wajib: expected_recipients = 'sendable' dari preview_campaign (kalau berubah, server menolak dan memberi angka baru). > 500 penerima butuh confirm_large_send: true.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama campaign (3–100 karakter) — tampil di daftar Kampanye." },
        segment_id: { type: "string" },
        template_key: { type: "string" },
        expected_recipients: { type: "number", description: "'sendable' dari preview_campaign." },
        confirm_large_send: { type: "boolean" },
        schedule_wib: { type: "string", description: "Opsional: jadwal 'YYYY-MM-DD HH:MM' (WIB). Kosong = kirim sekarang." },
        merge_csv: { type: "string", description: "Opsional: CSV dengan kolom email + field merge untuk {{field}} kustom." },
        merge_rows: { type: "array", items: { type: "object" }, description: "Opsional: sama seperti merge_csv tapi array objek." },
      },
      required: ["name", "segment_id", "template_key", "expected_recipients"],
      additionalProperties: false,
    },
  },
  {
    name: "campaign_stats",
    description: "Performa satu campaign: terkirim, diterima, dibuka (unik), klik, bounce, lapor spam, berhenti langganan, gagal, antre — plus persentasenya.",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string", description: "run_id dari send_campaign atau list_campaigns." } },
      required: ["run_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_campaigns",
    description: "Daftar campaign terbaru dengan performa ringkas. Default hanya campaign buatan Agent Mail.",
    inputSchema: {
      type: "object",
      properties: {
        all: { type: "boolean", description: "true = termasuk campaign manual & otomatis." },
        limit: { type: "number", description: "Maks baris (default 20, maks 50)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "stop_campaign",
    description: "Hentikan campaign yang sedang terkirim (batch yang sedang jalan selesai, sisanya tidak dikirim).",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string" } },
      required: ["run_id"],
      additionalProperties: false,
    },
  },
];

// ── handlers ────────────────────────────────────────────────────────────────────────────────────

export async function callTool(ctx: AgentContext, name: string, args: Json): Promise<Json> {
  // Every tool needs at least the send grant — Agent Mail is a sending surface.
  if (grantFor(ctx.role, "send.at_or_below_threshold") === "deny") {
    throw new ToolError("Role CRM pemilik token tidak punya akses kirim campaign. Minta Super Admin memberi role.");
  }

  switch (name) {
    case "agent_mail_guide":
      return { guide: AGENT_MAIL_GUIDE, acting_as: ctx.email, role: ctx.role };

    case "list_segments": {
      const q = typeof args.search === "string" ? args.search.trim().toLowerCase() : "";
      const all = await listSegments();
      const rows = all.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 100);
      return {
        segments: rows.map((s) => ({ segment_id: s.id, name: s.name, clinical: s.requiresClinical, created_at: s.createdAt })),
        total: rows.length,
      };
    }

    case "import_audience": {
      if (!canImportAudience(ctx.role)) throw new ToolError("Upload audiens hanya untuk role Super Admin. Pakai segmen yang sudah ada (list_segments).");
      const audName = str(args, "name");
      const consentSource = str(args, "consent_source");
      if (args.consent_confirmed !== true) throw new ToolError("consent_confirmed harus true — hanya kontak yang setuju menerima email promo yang boleh diupload.");
      const dryRun = args.dry_run === true;
      const { headers, rows } = tableFrom(args);
      if (rows.length > MAX_IMPORT_ROWS) throw new ToolError(`Maks ${MAX_IMPORT_ROWS} baris per upload — pecah filenya.`);

      const tag = `sumber:agent-mail-${slug(audName, 30)}-${randomUUID().slice(0, 6)}`;
      const admin = createAdminClient();
      const result = await runImportRequest(
        {
          phase: dryRun ? "dry_run" : "execute",
          headers,
          rows,
          collectionSource: `Agent Mail: ${consentSource}`,
          filename: `agent-mail:${audName}`,
          extraTags: [tag],
        },
        buildImportDeps(admin, { userId: ctx.userId, userEmail: ctx.email }, randomUUID(), "agent_mail_import"),
      );
      if (!result.ok) return fail(result.error, { hint: `Import ditolak: ${result.error}` });
      const mapping = result.mapping;
      const mergeFields = Object.entries(mapping)
        .filter(([, f]) => f === "ignore")
        .map(([h]) => h);
      const summary = result.plan?.summary;
      const counts = summary
        ? {
            rows: rows.length,
            new_contacts: summary.netInsert,
            already_in_crm_tagged: summary.taggedExisting,
            unsubscribed_or_suppressed: summary.suppressed,
            invalid_email: summary.invalid,
            duplicates_in_file: summary.duplicatesInBatch,
            contactable_new: summary.netContactable,
          }
        : { rows: rows.length };
      if (dryRun) return { ok: true, dry_run: true, column_mapping: mapping, merge_fields_available: mergeFields, counts };

      await finishImportExecute(admin, result.plan!);
      const seg = await saveSegment({
        name: `Agent Mail · ${audName}`.slice(0, 120),
        stored: { criteria: { ...EMPTY_CRITERIA, tagsAny: [tag] }, masterFilterExpr: null },
        createdBy: ctx.email,
      });
      if (!seg.ok || !seg.id) throw new ToolError("Audiens masuk, tapi segmen gagal dibuat. Coba import_audience lagi dengan nama lain.");
      await audit(ctx, "import_audience", `Agent Mail impor audiens "${audName}": ${counts.rows} baris → segmen ${seg.id}.`, { segment_id: seg.id, tag, counts });
      return {
        ok: true,
        segment_id: seg.id,
        segment_name: `Agent Mail · ${audName}`,
        tag,
        counts,
        merge_fields_available: mergeFields,
        next: "Panggil preview_campaign dengan segment_id ini. Kalau email memakai {{kolom}} kustom, kirim CSV yang sama sebagai merge_csv di send_campaign.",
      };
    }

    case "create_email": {
      const nm = str(args, "name");
      const subject = str(args, "subject");
      let html = str(args, "html");
      if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new ToolError("HTML terlalu besar (maks 512 KB). Host gambar di URL, jangan base64.");
      const sender = validateSenderName(typeof args.sender_name === "string" ? args.sender_name : null);
      if (!sender.ok) throw new ToolError("sender_name maks 64 karakter.");
      html = withPreheader(html, typeof args.preheader === "string" ? args.preheader.trim() : "");
      const ensured = ensureUnsubscribe(html);
      html = ensured.html;

      const templateKey = `${AGENT_TEMPLATE_PREFIX}${slug(nm)}-${Date.now().toString(36)}`;
      const variables = Array.from(new Set(extractVariables(`${subject}\n${html}`)));
      const admin = createAdminClient();
      const { error } = await admin.from("crm_message_template").insert({
        template_key: templateKey,
        channel: "email",
        language: "id",
        version: 1,
        name: nm.slice(0, 200),
        display_name: `Agent Mail · ${nm}`.slice(0, 200),
        description: "Dibuat oleh AI agent lewat Agent Mail (MCP).",
        category: "promo",
        status: "active",
        subject,
        body: html,
        sender_name: sender.value,
        variables,
        wa_approval_status: "not_applicable",
        is_active: true,
        created_by: ctx.email,
      });
      if (error) throw new ToolError("Gagal menyimpan template email.");
      await audit(ctx, "create_email", `Agent Mail membuat template "${nm}" (${templateKey}).`, { template_key: templateKey, unsubscribe_added: ensured.added });
      const custom = variables.filter((v) => !STD_VARS.has(v));
      return {
        ok: true,
        template_key: templateKey,
        variables,
        custom_merge_fields: custom,
        unsubscribe_link_added: ensured.added,
        next: custom.length
          ? `Email memakai field kustom ${custom.map((c) => `{{${c}}}`).join(", ")} — sertakan merge_csv saat send_campaign.`
          : "Lanjut send_test_email lalu preview_campaign.",
      };
    }

    case "preview_campaign": {
      const r = await previewCampaignCore(actorOf(ctx), str(args, "segment_id"), str(args, "template_key"));
      if (!r.ok) return fail(r.error);
      return {
        ok: true,
        segment: r.segmentName,
        matched: r.matched,
        with_email: r.withEmail,
        no_contact: r.noContact,
        suppressed_or_unsubscribed: r.suppressed,
        sendable: r.sendable,
        needs_confirm_large_send: r.needsLargeConfirm,
        unresolved_addresses: r.unresolved,
      };
    }

    case "send_test_email": {
      const to = Array.isArray(args.to) ? (args.to as unknown[]).filter((x): x is string => typeof x === "string" && /\S+@\S+\.\S+/.test(x)) : [];
      if (to.length === 0) throw new ToolError("'to' minimal satu alamat email valid.");
      if (to.length > MAX_TEST_RECIPIENTS) throw new ToolError(`Email test maks ${MAX_TEST_RECIPIENTS} alamat.`);
      const sample =
        args.sample && typeof args.sample === "object" && !Array.isArray(args.sample)
          ? Object.fromEntries(Object.entries(args.sample as Json).map(([k, v]) => [k, String(v ?? "")]))
          : undefined;
      const templateKey = str(args, "template_key");
      const r = await sendPreviewEmailCore(actorOf(ctx), to, templateKey, sample);
      await audit(ctx, "send_test_email", `Agent Mail kirim email test ${templateKey} ke ${to.length} alamat.`, { template_key: templateKey, count: to.length, ok: r.ok });
      return r.ok ? { ok: true, sent_to: r.sentTo } : fail(r.error, { detail: r.detail });
    }

    case "send_campaign": {
      const label = str(args, "name");
      const nameCheck = validateCampaignName(label);
      if (!nameCheck.ok) return fail("label_required");
      const segmentId = str(args, "segment_id");
      const templateKey = str(args, "template_key");
      const expected = Number(args.expected_recipients);
      if (!Number.isFinite(expected) || expected < 0) throw new ToolError("expected_recipients wajib angka dari preview_campaign.");
      const confirmed = args.confirm_large_send === true;
      const mergeData = mergeRowsFrom(args);
      const schedule = typeof args.schedule_wib === "string" ? args.schedule_wib.trim() : "";

      if (schedule) {
        const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/.exec(schedule);
        if (!m) return fail("bad_time");
        const r = await scheduleCampaignCore(
          actorOf(ctx),
          { segmentId, templateKey, confirmedLargeSend: confirmed, shownSendable: expected, runLabel: nameCheck.value!, dateWib: m[1], timeWib: m[2], mergeData },
          ctx.servingHost,
        );
        await audit(ctx, "schedule_campaign", `Agent Mail menjadwalkan "${label}" (${templateKey}) ${schedule} WIB.`, { segment_id: segmentId, template_key: templateKey, ok: r.ok, error: r.error ?? null });
        if (!r.ok) return fail(r.error, { fresh_sendable: r.freshSendable, detail: r.detail });
        return { ok: true, scheduled: true, scheduled_at_utc: r.scheduledAtUtc, recipients: expected };
      }

      const r = await sendCampaignCore(
        actorOf(ctx),
        { segmentId, templateKey, confirmedLargeSend: confirmed, shownSendable: expected, run: { kind: "new", label: nameCheck.value! }, mergeData },
        ctx.servingHost,
      );
      await audit(ctx, "send_campaign", `Agent Mail kirim "${label}" (${templateKey}).`, { segment_id: segmentId, template_key: templateKey, run_id: r.runId ?? null, ok: r.ok, error: r.error ?? null, sendable: r.sendable ?? null });
      if (!r.ok) return fail(r.error, { fresh_sendable: r.freshSendable, run_id: r.runId, detail: r.detail });
      return {
        ok: true,
        queued: true,
        run_id: r.runId,
        name: r.runLabel,
        recipients: r.sendable,
        next: "Pengiriman berjalan di latar. Cek campaign_stats(run_id) beberapa menit lagi; open/klik masuk bertahap.",
      };
    }

    case "campaign_stats": {
      const d = await deliveryDetail(createAdminClient(), str(args, "run_id"));
      if (!d) return fail("not_found", { hint: "run_id tidak ditemukan." });
      const r = d.result;
      const sentBase = r.sent;
      const deliveredBase = r.delivered || Math.max(0, r.sent - r.bounced - r.failed);
      return {
        ok: true,
        run_id: d.runId,
        name: d.label,
        status: d.status,
        audience: d.ownerName,
        created_at: d.createdAt,
        created_by: d.createdBy,
        metrics: {
          sent: r.sent,
          delivered: r.delivered,
          opened_unique: r.opened,
          clicked_unique: r.clicked,
          bounced: r.bounced,
          spam_reports: r.complained,
          unsubscribed: r.unsubscribed,
          failed: r.failed,
          queued: r.queued,
        },
        rates: {
          delivered: pct(r.delivered, sentBase),
          open: pct(r.opened, deliveredBase),
          click: pct(r.clicked, deliveredBase),
          bounce: pct(r.bounced, sentBase),
          spam: pct(r.complained, sentBase),
          unsubscribe: pct(r.unsubscribed, deliveredBase),
        },
        engagement_measured: d.engagementMeasured,
        last_error: d.lastError,
        crm_url: `https://crm.20fit.id/campaigns?tab=kiriman&run=${d.runId}`,
      };
    }

    case "list_campaigns": {
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const rows = await listDeliveries(createAdminClient(), 60);
      const pick = rows.filter((r) => r.kind === "run" && (args.all === true || isAgentMailTemplateKey(r.templateKey))).slice(0, limit);
      return {
        campaigns: pick.map((r) => {
          const sent = r.sentCount + r.deliveredCount;
          const base = Math.max(r.deliveredCount, sent - r.bouncedCount - r.failedCount);
          return {
            run_id: r.runId,
            name: r.label,
            state: r.state,
            audience: r.ownerName,
            created_at: r.time,
            recipients: r.recipientCount,
            sent,
            open_rate: pct(r.openedCount, base),
            click_rate: pct(r.clickedCount, base),
            bounced: r.bouncedCount,
            spam_reports: r.complainedCount,
            unsubscribed: r.unsubscribedCount,
            agent_mail: isAgentMailTemplateKey(r.templateKey),
          };
        }),
      };
    }

    case "stop_campaign": {
      const runId = str(args, "run_id");
      const r = await stopRunDrain(createAdminClient(), runId);
      await audit(ctx, "stop_campaign", `Agent Mail menghentikan campaign ${runId}.`, { run_id: runId, ok: r.ok });
      return r.ok ? { ok: true, stopped: true } : fail("not_found", { hint: "Campaign tidak sedang mengirim (atau bukan campaign segmen)." });
    }

    default:
      throw new ToolError(`Tool tidak dikenal: ${name}`);
  }
}
