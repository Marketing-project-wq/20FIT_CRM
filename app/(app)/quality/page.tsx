import { redirect } from "next/navigation";

// Nav rebuild (11→7): /quality is gone. The data-quality dashboard is now a tab under Audience —
// the quality numbers describe that pool, so they sit beside it.
export default function QualityRedirect() {
  redirect("/audience?tab=quality");
}
