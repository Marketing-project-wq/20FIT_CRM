import { redirect } from "next/navigation";

// Nav rebuild (11→7): /consent is gone. The unsubscribe (crm_suppression) list screen was removed too
// (2026-10-14; the list still applies to every send); the consent-basis archive (crm_consent) is a
// read-only panel under Settings.
export default function ConsentRedirect() {
  redirect("/audience");
}
