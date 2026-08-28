"use server";

import { getCurrentUserRole } from "@/lib/auth/current-role";
import { grantFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Brand asset (logo) actions. Upload → Supabase Storage bucket 'brand-assets' (public) → record
 * public URL in crm_brand_asset. The URL is what gets inserted into email HTML as <img src>, so it
 * must be public + stable (email clients can't authenticate). Gate: workflow.create (same as
 * template authoring). Only image types, max 2 MiB (also enforced by the bucket).
 */

const BUCKET = "brand-assets";
const MAX_BYTES = 2_097_152;
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

export interface BrandAsset {
  id: string;
  name: string;
  publicUrl: string;
  createdAt: string;
}

export async function listBrandAssetsAction(): Promise<{ ok: boolean; assets: BrandAsset[] }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "workflow.create") === "deny") return { ok: false, assets: [] };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("crm_brand_asset")
      .select("id, name, public_url, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, assets: [] };
    return {
      ok: true,
      assets: (data ?? []).map((r) => {
        const row = r as { id: string; name: string; public_url: string; created_at: string };
        return { id: row.id, name: row.name, publicUrl: row.public_url, createdAt: row.created_at };
      }),
    };
  } catch {
    return { ok: false, assets: [] };
  }
}

export async function uploadBrandAssetAction(formData: FormData): Promise<{ ok: boolean; error?: string; asset?: BrandAsset }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "workflow.create") === "deny") return { ok: false, error: "denied" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "no_file" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };
  if (!ALLOWED.includes(file.type)) return { ok: false, error: "bad_type" };

  let uploadedBy: string | null = null;
  try {
    uploadedBy = (await createClient().auth.getUser()).data.user?.email ?? null;
  } catch {
    // fail-open on identity
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "png";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const admin = createAdminClient();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) return { ok: false, error: "upload_failed" };

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { data, error } = await admin
      .from("crm_brand_asset")
      .insert({
        name: file.name,
        storage_path: path,
        public_url: publicUrl,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: uploadedBy,
      })
      .select("id, name, public_url, created_at")
      .single();
    if (error) return { ok: false, error: "record_failed" };
    const row = data as { id: string; name: string; public_url: string; created_at: string };
    return { ok: true, asset: { id: row.id, name: row.name, publicUrl: row.public_url, createdAt: row.created_at } };
  } catch {
    return { ok: false, error: "threw" };
  }
}

export async function deleteBrandAssetAction(id: string): Promise<{ ok: boolean }> {
  const role = await getCurrentUserRole();
  if (grantFor(role, "workflow.create") === "deny") return { ok: false };
  try {
    const admin = createAdminClient();
    // Soft-delete the record; also remove the file so the bucket doesn't grow unbounded.
    const { data } = await admin.from("crm_brand_asset").select("storage_path").eq("id", id).maybeSingle();
    await admin.from("crm_brand_asset").update({ is_active: false }).eq("id", id);
    const path = (data as { storage_path?: string } | null)?.storage_path;
    if (path) await admin.storage.from(BUCKET).remove([path]);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
