"use client";

import { EmailTemplateBuilder } from "@/components/templates/email-template-builder";

/** Renders the real builder modal on its starter-gallery step (template=null). onClose is a no-op —
 *  the screenshot only needs the open gallery. Brand-asset loading may no-op without auth; the gallery
 *  renders regardless (starters are static, thumbnails are client-rendered srcDoc iframes). */
export function TemplateGalleryPreview() {
  return <EmailTemplateBuilder template={null} onClose={() => {}} />;
}
