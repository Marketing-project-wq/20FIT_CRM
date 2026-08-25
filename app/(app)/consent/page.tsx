import { redirect } from "next/navigation";

// Nav rebuild (11→7): /consent is gone. The unsubscribe (crm_suppression) list is now a tab under
// Audience; the consent-basis archive (crm_consent) is a read-only panel under Settings.
export default function ConsentRedirect() {
  redirect("/audience?tab=unsubscribe");
}
