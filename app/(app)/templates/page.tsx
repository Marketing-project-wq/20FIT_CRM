import { redirect } from "next/navigation";

// Templates screen removed (owner request 2026-10-14). Campaigns and workflows keep sending with the
// templates already in crm_message_template; /api/templates, the builders and brand-asset-actions stay
// because the send/preview paths import them. Old bookmarks land on Campaigns.
export default function TemplatesRedirect() {
  redirect("/campaigns");
}
