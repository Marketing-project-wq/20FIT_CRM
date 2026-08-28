import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";

/**
 * GET /api/templates?id=<uuid> — fetch a single template by ID (for editing).
 */
export async function GET(req: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (grantFor(role, "workflow.create") === "deny") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_message_template")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ template: data });
  } catch (err) {
    console.error("Template fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/templates — save a new template (email or WhatsApp).
 * Creates a new version (INSERT only, no UPDATE) following crm_message_template immutability.
 */
export async function POST(req: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (grantFor(role, "workflow.create") === "deny") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const { template_key, channel, language, name, subject, body: content } = body;

    if (!template_key || !channel || !language || !name || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (channel === "email" && !subject) {
      return NextResponse.json({ error: "Email templates require a subject" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Get the highest version for this template_key + language
    const { data: existing } = await admin
      .from("crm_message_template")
      .select("version")
      .eq("template_key", template_key)
      .eq("language", language)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1;

    // Extract variables from content
    const variableRegex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    let match;
    while ((match = variableRegex.exec(`${subject ?? ""}\n${content}`)) !== null) {
      variables.add(match[1]);
    }

    const { data, error } = await admin
      .from("crm_message_template")
      .insert({
        template_key,
        channel,
        language,
        version: nextVersion,
        name,
        subject: channel === "email" ? subject : null,
        body: content,
        variables: Array.from(variables),
        wa_approval_status: channel === "whatsapp" ? "draft" : "not_applicable",
        is_active: true,
        created_by: role, // Store role as created_by for now
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to save template:", error);
      return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
    }

    return NextResponse.json({ success: true, template: data });
  } catch (err) {
    console.error("Template save error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/templates?key=<template_key> — soft-delete ALL versions of a template (is_active=false).
 * The append-only table keeps the rows (audit/history), they just stop appearing in lists/sends.
 * Gate: workflow.create. The internal-test template key is protected (never deletable via UI).
 */
export async function DELETE(req: NextRequest) {
  try {
    const role = await getCurrentUserRole();
    if (grantFor(role, "workflow.create") === "deny") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
    if (key === "__uji_internal__") {
      return NextResponse.json({ error: "Protected template" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("crm_message_template")
      .update({ is_active: false })
      .eq("template_key", key);
    if (error) {
      console.error("Failed to delete template:", error);
      return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Template delete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
