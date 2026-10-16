"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor, isPermitted } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { flowApi } from "@/lib/crm/flow/api";
import { renderFlowEmail, ctxVars } from "@/lib/crm/flow/email";
import { runFlowTick, type FlowTickSummary } from "@/lib/crm/flow/tick";
import { sendTransactionalEmail } from "@/lib/email/send";
import { inlineEmailCss } from "@/lib/crm/css-inline";
import type { EnrollmentRow, FlowDetail, FlowGraph } from "@/lib/crm/flow/types";

/**
 * Flow server actions. Gates (lib/auth/roles):
 *   view + edit drafts → workflow.create ≠ deny
 *   activate / pause / test run / send test → workflow.activate (super_admin, crm_manager)
 * The engine (c360-api) holds the definitions; nothing here sends to customers except through
 * runFlowTick, which only reaches people of ACTIVE flows or explicit test enrollments.
 */

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string; errors?: string[] };

async function actor() {
  const role = await getCurrentUserRole();
  let email: string | null = null;
  try {
    email = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    email = null;
  }
  return { role, email, canView: grantFor(role, "workflow.create") !== "deny", canActivate: isPermitted(role, "workflow.activate") };
}

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export async function getFlowAction(id: string): Promise<Res<{ detail: FlowDetail }>> {
  const a = await actor();
  if (!a.canView) return { ok: false, error: "Akses ditolak" };
  try {
    return { ok: true, detail: await flowApi.get(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveFlowAction(flow: {
  id: string;
  name: string;
  journey: string;
  description: string | null;
  priority: number;
  holdout_pct: number;
  goal: unknown;
  graph: FlowGraph;
}): Promise<Res<{ warnings: string[]; version: number }>> {
  const a = await actor();
  if (!a.canView) return { ok: false, error: "Akses ditolak" };
  try {
    const r = await flowApi.save(flow, a.email);
    if (!r.ok) return { ok: false, error: "Flow belum valid", errors: r.errors ?? [] };
    revalidatePath("/flows");
    return { ok: true, warnings: r.warnings ?? [], version: r.flow?.version ?? 0 };
  } catch (e) {
    return fail(e);
  }
}

export async function setFlowStatusAction(id: string, status: "draft" | "active" | "paused"): Promise<Res> {
  const a = await actor();
  if (!a.canActivate) return { ok: false, error: "Hanya Super Admin / CRM Manager yang bisa mengaktifkan atau menjeda flow" };
  try {
    const r = await flowApi.status(id, status, a.email);
    if (!r.ok) return { ok: false, error: "Flow belum bisa diaktifkan", errors: r.errors ?? [] };
    revalidatePath("/flows");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFlowAction(id: string): Promise<Res> {
  const a = await actor();
  if (!a.canActivate) return { ok: false, error: "Akses ditolak" };
  try {
    const r = await flowApi.remove(id);
    if (!r.ok) return { ok: false, error: r.error ?? "Gagal menghapus" };
    revalidatePath("/flows");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function previewAudienceAction(id: string, graph: FlowGraph): Promise<Res<{ count: number; sample: { email: string; nama: string | null; ref: string }[] }>> {
  const a = await actor();
  if (!a.canView) return { ok: false, error: "Akses ditolak" };
  try {
    const r = await flowApi.preview(id, graph);
    return { ok: true, count: r.count, sample: r.sample.map((s) => ({ email: s.email, nama: s.nama, ref: s.ref })) };
  } catch (e) {
    return fail(e);
  }
}

export async function renderEmailPreviewAction(content: Record<string, unknown>, flowId: string, node: string): Promise<Res<{ subject: string; html: string }>> {
  const a = await actor();
  if (!a.canView) return { ok: false, error: "Akses ditolak" };
  const vars = {
    ...ctxVars({ event: "Livin' by Mandiri | VISA × Jakarta Hybrid Race", produk: "Kelas arena", jersey: "M", kota_event: "Jakarta", perusahaan: "PT Contoh" }),
    first_name: "Budi",
    full_name: "Budi Santoso",
    city: "Jakarta",
    perusahaan: "PT Contoh",
  };
  const r = renderFlowEmail(content, vars, { flowId, node, unsubscribeUrl: "https://crm.20fit.id/unsubscribe?token=PREVIEW" });
  return { ok: true, subject: r.subject, html: r.html };
}

export async function sendNodeTestAction(content: Record<string, unknown>, flowId: string, node: string, to: string): Promise<Res<{ to: string }>> {
  const a = await actor();
  if (!a.canActivate) return { ok: false, error: "Hanya Super Admin / CRM Manager yang bisa kirim uji" };
  if (!/@20fit\.id$/i.test(to.trim())) return { ok: false, error: "Kirim uji hanya ke alamat @20fit.id" };
  const p = await renderEmailPreviewAction(content, flowId, node);
  if (!p.ok) return p;
  try {
    await sendTransactionalEmail({ to: to.trim(), subject: `[UJI ${flowId}/${node}] ${p.subject}`, text: p.subject, html: inlineEmailCss(p.html) }, "crm-flow-preview", "20FIT");
    return { ok: true, to: to.trim() };
  } catch (e) {
    return fail(e);
  }
}

/** Start a test run: one enrollment for the test address (profile borrowed from a real match so the
 *  branches evaluate realistically; the email goes ONLY to the test address), then tick right away. */
export async function startTestRunAction(id: string, email: string): Promise<Res<{ profil: string | null; tick: FlowTickSummary }>> {
  const a = await actor();
  if (!a.canActivate) return { ok: false, error: "Hanya Super Admin / CRM Manager yang bisa menjalankan uji" };
  if (!/@20fit\.id$/i.test(email.trim())) return { ok: false, error: "Uji flow hanya ke alamat @20fit.id" };
  try {
    const s = await flowApi.testStart(id, email.trim().toLowerCase());
    const tick = await runFlowTick({ enroll: false });
    return { ok: true, profil: s.profil, tick };
  } catch (e) {
    return fail(e);
  }
}

export async function runTickAction(): Promise<Res<{ tick: FlowTickSummary }>> {
  const a = await actor();
  if (!a.canActivate) return { ok: false, error: "Akses ditolak" };
  try {
    return { ok: true, tick: await runFlowTick({ enroll: false }) };
  } catch (e) {
    return fail(e);
  }
}

export async function listEnrollmentsAction(id: string, test: boolean): Promise<Res<{ rows: EnrollmentRow[] }>> {
  const a = await actor();
  if (!a.canView) return { ok: false, error: "Akses ditolak" };
  try {
    return { ok: true, rows: (await flowApi.enrollments(id, test)).rows };
  } catch (e) {
    return fail(e);
  }
}

export async function seedBlueprintAction(): Promise<Res<{ inserted: number }>> {
  const a = await actor();
  if (!a.canActivate) return { ok: false, error: "Akses ditolak" };
  try {
    const r = await flowApi.seedDefault(a.email);
    revalidatePath("/flows");
    return { ok: true, inserted: r.inserted };
  } catch (e) {
    return fail(e);
  }
}
