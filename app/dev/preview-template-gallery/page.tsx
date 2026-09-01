import { TemplateGalleryPreview } from "./preview-client";
import { DevBanner } from "@/components/dev/dev-banner";

export const dynamic = "force-dynamic";

/**
 * Dev-only FIXTURE for the "Pilih Template Awal" starter gallery (the real EmailTemplateBuilder modal,
 * opened on its gallery step). No Supabase writes, no PII. /dev/* is 404 in production. A screenshot
 * here must show: each of the 4 starters reads DIFFERENTLY — a true-proportion thumbnail of the top of
 * the email (600px-wide source, scaled to card width), the "blank" card as an explicit placeholder
 * (not a failed-looking preview), and a one-line description under each name. Also verifies the modal
 * sizes to content (no stretched empty gap) and the unsubscribe note appears once (header only).
 */
export default function Page() {
  return (
    <div className="min-h-screen bg-surface">
      <DevBanner />
      <TemplateGalleryPreview />
    </div>
  );
}
